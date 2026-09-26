import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAesGcmCipher, resetActiveCipher, setActiveCipher } from "@/lib/cipher";
import { createBranch, createFlight, createNest, createWing } from "@/lib/entity-storage";
import { getNotesDb } from "@/lib/notes-db";
import { createTwig, listTwigs } from "@/lib/twig-storage";

import { useWorkspaceEditor } from "./use-workspace-editor";
import { WorkspaceEditorCard } from "./workspace-editor-card";

function Harness() {
  return <WorkspaceEditorCard {...useWorkspaceEditor()} />;
}

async function seedWorkspace() {
  const wing = await createWing("My Wing");
  const flight = await createFlight({ wingId: wing.id, name: "Fall 2026" });
  const branch = await createBranch({ flightId: flight.id, name: "Organic Chemistry" });
  const nest = await createNest({ branchId: branch.id, name: "Unit 1" });

  return { wing, flight, branch, nest };
}

afterEach(() => {
  resetActiveCipher();
});

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("wings"),
    database.clear("flights"),
    database.clear("branches"),
    database.clear("nests"),
    database.clear("twigs"),
    database.clear("share-paths"),
  ]);
});

describe("WorkspaceEditorCard", () => {
  it("says so when there is nothing to edit yet", async () => {
    render(<Harness />);

    expect(await screen.findByText(/nothing here yet/i)).toBeVisible();
  });

  it("shows the hierarchy down to its tags", async () => {
    await seedWorkspace();
    render(<Harness />);

    expect(await screen.findByText("My Wing")).toBeVisible();
    expect(screen.getByText("Fall 2026")).toBeVisible();
    expect(screen.getByText("Organic Chemistry")).toBeVisible();
    expect(screen.getByText("Unit 1")).toBeVisible();
  });

  it("renames a course, which is the change nothing else has to follow", async () => {
    const user = userEvent.setup();
    await seedWorkspace();
    render(<Harness />);

    await user.click(await screen.findByRole("button", { name: "Rename Organic Chemistry" }));
    const field = screen.getByLabelText("New name for Organic Chemistry");
    await user.clear(field);
    await user.type(field, "Organic Chemistry II");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Organic Chemistry II")).toBeVisible();
    expect(screen.queryByText("Organic Chemistry")).not.toBeInTheDocument();
  });

  it("backs out of a rename without writing anything", async () => {
    const user = userEvent.setup();
    await seedWorkspace();
    render(<Harness />);

    await user.click(await screen.findByRole("button", { name: "Rename My Wing" }));
    await user.type(screen.getByLabelText("New name for My Wing"), "!!");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("My Wing")).toBeVisible();
  });

  it("recolours a course", async () => {
    const user = userEvent.setup();
    const { branch } = await seedWorkspace();
    render(<Harness />);

    const picker = await screen.findByRole("group", { name: "Colour for Organic Chemistry" });
    await user.click(screen.getByRole("button", { name: "violet" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "violet" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(picker).toBeVisible();

    const database = await getNotesDb();
    expect((await database.get("branches", branch.id))?.color).toBe("violet");
  });

  it("asks before a delete, and says what goes with it", async () => {
    const user = userEvent.setup();
    await seedWorkspace();
    render(<Harness />);

    await user.click(await screen.findByRole("button", { name: "Delete Fall 2026" }));

    expect(
      screen.getByText(/Delete Fall 2026 and its courses, tags, notes, tasks and files\?/i),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Keep Fall 2026" }));
    expect(screen.getByText("Fall 2026")).toBeVisible();
  });

  it("deletes a course and everything under it", async () => {
    const user = userEvent.setup();
    const { branch } = await seedWorkspace();
    await createTwig({ branchId: branch.id, title: "Problem set 4" });
    render(<Harness />);

    await user.click(await screen.findByRole("button", { name: "Delete Organic Chemistry" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Organic Chemistry")).not.toBeInTheDocument();
    });
    // The tag under it goes too, and so does the task that pointed at it.
    expect(screen.queryByText("Unit 1")).not.toBeInTheDocument();
    expect(await listTwigs()).toEqual([]);
    // The flight above it stays: a delete goes down, never up.
    expect(screen.getByText("Fall 2026")).toBeVisible();
  });

  it("lifts a tag off what it marked rather than deleting it", async () => {
    const user = userEvent.setup();
    const { branch, nest } = await seedWorkspace();
    await createTwig({ branchId: branch.id, title: "Problem set 4", nestIds: [nest.id] });
    render(<Harness />);

    await user.click(await screen.findByRole("button", { name: "Delete Unit 1" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Unit 1")).not.toBeInTheDocument();
    });

    const [twig] = await listTwigs();
    expect(twig.title).toBe("Problem set 4");
    expect(twig.nestIds).toEqual([]);
  });

  it("says so when a change cannot be saved, rather than looking like it worked", async () => {
    const user = userEvent.setup();
    await seedWorkspace();
    const database = await getNotesDb();
    render(<Harness />);

    await screen.findByText("My Wing");
    vi.spyOn(database, "put").mockRejectedValueOnce(new Error("storage gone"));

    await user.click(screen.getByRole("button", { name: "Rename My Wing" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("could not be saved");
    vi.restoreAllMocks();
  });

  it("says so when the workspace cannot be read at all", async () => {
    const branch = await seedWorkspace();

    // Sealed by a key that is then dropped: the names cannot be opened, so there is no
    // list to show and the card has to say that rather than render an empty one.
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    setActiveCipher(createAesGcmCipher(key, "test-key"));
    await createWing("Sealed wing");
    resetActiveCipher();

    render(<Harness />);

    expect(await screen.findByRole("status")).toHaveTextContent("could not be read");
    expect(branch.wing.id).not.toHaveLength(0);
  });

  it("does not offer somebody else's wing, known here only as a shared path, for editing", async () => {
    await seedWorkspace();
    await (
      await getNotesDb()
    ).put("share-paths", {
      id: "their-note",
      kind: "feather",
      path: JSON.stringify({
        wings: [
          { id: "their-wing", name: "Their Wing", createdAt: 1, updatedAt: 1, deletedAt: null },
        ],
        flights: [],
        branches: [],
        nests: [],
      }),
      updatedAt: 1,
      deletedAt: null,
    });

    render(<Harness />);

    expect(await screen.findByText("My Wing")).toBeVisible();
    expect(screen.queryByText("Their Wing")).not.toBeInTheDocument();
  });
});
