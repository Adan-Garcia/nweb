import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Excalidraw is a canvas app; this page test stays in linear mode, so a minimal stand-in is enough.
vi.mock("@excalidraw/excalidraw", () => ({
  getSceneVersion: () => 0,
  serializeAsJSON: () => "{}",
  convertToExcalidrawElements: () => [],
  Excalidraw: () => null,
  MainMenu: Object.assign(() => null, {
    Item: () => null,
    Separator: () => null,
    DefaultItems: {},
  }),
}));

import { NotesPage } from "./notes";

// ProseMirror measures text with layout APIs that jsdom leaves out.
document.elementFromPoint = () => null;
Range.prototype.getClientRects = () => document.body.getClientRects();
Range.prototype.getBoundingClientRect = () => new DOMRect();

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

describe("NotesPage", () => {
  it("opens the default note in the linear editor once storage is ready", async () => {
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Lecture Notes")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Autosave enabled|Autosaved at/)).toBeInTheDocument(),
    );
  });

  it("shows the note's place in the hierarchy", async () => {
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "My Wing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Untitled note" })).toBeInTheDocument();
  });

  it("is wrapped in the workspace navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
