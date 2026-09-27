import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps the type scale's sizes beside a text colour", () => {
    expect(cn("text-title", "text-muted-foreground")).toBe("text-title text-muted-foreground");
    expect(cn("text-caption font-medium", "text-destructive")).toBe(
      "text-caption font-medium text-destructive",
    );
  });

  it("lets a later size replace an earlier one", () => {
    expect(cn("text-sm", "text-heading")).toBe("text-heading");
    expect(cn("text-body", "text-title")).toBe("text-title");
  });
});
