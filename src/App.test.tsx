import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { notifySuccess } from "@/lib/toast";
import { usePreferencesStore } from "@/stores/use-preferences-store";

import App from "./App";

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("App routing", () => {
  it("renders the landing page immediately, without waiting for any lazy chunk", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: "Cuervo Planner" })).toBeInTheDocument();
  });

  it("shows a loading state, then the page, for a lazily loaded route", async () => {
    renderAt("/pricing");

    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    expect(
      await screen.findByRole("heading", { level: 1, name: /Pricing that scales/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each([
    ["/privacy", /Your study data stays yours/],
    ["/documentation", /Build with the same structure/],
    ["/auth/onboarding", /Getting Started/],
  ])("routes %s to its page", async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });

  it("sends unknown URLs to the landing page", () => {
    renderAt("/no-such-page");

    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { level: 1, name: "Cuervo Planner" })).toBeInTheDocument();
  });

  it("renders a workspace page inside the shell", async () => {
    renderAt("/board");

    expect(await screen.findByRole("heading", { level: 1, name: "Board" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument();
  });

  it("dresses the document in the saved look from the first render", () => {
    usePreferencesStore.getState().update({ theme: "oled", accent: "teal" });
    renderAt("/");

    expect(document.documentElement.dataset).toMatchObject({ theme: "oled", accent: "teal" });
    expect(document.documentElement).toHaveClass("dark");
  });

  it("shows toasts sent from anywhere", async () => {
    renderAt("/");

    act(() => notifySuccess("Backup saved", "cuervo-backup.json"));

    expect(await screen.findByText("Backup saved")).toBeInTheDocument();
    expect(screen.getByText("cuervo-backup.json")).toBeInTheDocument();
  });
});
