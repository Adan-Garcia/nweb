import { beforeEach, describe, expect, it } from "vitest";

import { createBranch, createFlight, createWing } from "./entity-storage";
import { getNotesDb } from "./notes-db";
import {
  currentFlightName,
  DEFAULT_BRANCH_NAME,
  DEFAULT_WING_NAME,
  ensureDefaultWorkspace,
  loadWorkspaceSnapshot,
} from "./workspace-storage";

beforeEach(async () => {
  const database = await getNotesDb();
  await Promise.all([
    database.clear("wings"),
    database.clear("flights"),
    database.clear("branches"),
    database.clear("nests"),
  ]);
});

describe("currentFlightName", () => {
  it("names the term the date falls in", () => {
    expect(currentFlightName(new Date(2026, 9, 1))).toBe("Fall 2026");
    expect(currentFlightName(new Date(2026, 1, 1))).toBe("Spring 2026");
    expect(currentFlightName(new Date(2026, 6, 1))).toBe("Summer 2026");
  });
});

describe("ensureDefaultWorkspace", () => {
  it("builds a complete path on a first run, because a note must belong to a branch", async () => {
    const { snapshot, path } = await ensureDefaultWorkspace();

    expect(path.wing.name).toBe(DEFAULT_WING_NAME);
    expect(path.flight.name).toBe(currentFlightName());
    expect(path.branch.name).toBe(DEFAULT_BRANCH_NAME);
    expect(snapshot.wings).toHaveLength(1);
    expect(snapshot.flights).toHaveLength(1);
    expect(snapshot.branches).toHaveLength(1);
  });

  it("adopts what is already there instead of making a second default", async () => {
    const wing = await createWing("School");
    const flight = await createFlight({ wingId: wing.id, name: "Spring 2027" });
    const branch = await createBranch({ flightId: flight.id, name: "Physics" });

    const { path } = await ensureDefaultWorkspace();

    expect(path).toMatchObject({
      wing: { id: wing.id },
      flight: { id: flight.id },
      branch: { id: branch.id },
    });
    expect((await loadWorkspaceSnapshot()).wings).toHaveLength(1);
  });

  it("fills in only the levels that are missing", async () => {
    const wing = await createWing("School");

    const { path, snapshot } = await ensureDefaultWorkspace();

    expect(path.wing.id).toBe(wing.id);
    expect(path.flight.name).toBe(currentFlightName());
    expect(path.branch.name).toBe(DEFAULT_BRANCH_NAME);
    expect(snapshot.flights).toHaveLength(1);
  });

  it("is idempotent, so a second call adds nothing", async () => {
    await ensureDefaultWorkspace();
    await ensureDefaultWorkspace();

    const snapshot = await loadWorkspaceSnapshot();

    expect(snapshot.wings).toHaveLength(1);
    expect(snapshot.flights).toHaveLength(1);
    expect(snapshot.branches).toHaveLength(1);
  });
});
