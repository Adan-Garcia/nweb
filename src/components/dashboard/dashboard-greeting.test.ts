import { describe, expect, it } from "vitest";

import { dashboardGreeting } from "./dashboard-greeting";

describe("dashboardGreeting", () => {
  it.each([
    [3, "Good evening"],
    [9, "Good morning"],
    [14, "Good afternoon"],
    [20, "Good evening"],
  ])("at %i:00 says %s", (hour, greeting) => {
    expect(dashboardGreeting(new Date(2026, 8, 27, hour))).toBe(
      `${greeting} · Sunday, September 27`,
    );
  });
});
