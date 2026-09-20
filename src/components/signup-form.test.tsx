import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SignupForm } from "./signup-form";

async function fill(user: ReturnType<typeof userEvent.setup>, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    await user.type(screen.getByLabelText(label), value);
  }
}

const valid = {
  "Full Name": "Ada Lovelace",
  Email: "ada@example.com",
  Password: "correct-horse",
  "Confirm Password": "correct-horse",
};

describe("SignupForm", () => {
  it("asks for every field when submitted empty", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Full name is required")).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters long")).toBeInTheDocument();
    expect(screen.getByText("Please confirm your password")).toBeInTheDocument();
  });

  it("rejects a one-letter name, a malformed email and a short password", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fill(user, { "Full Name": "A", Email: "nope", Password: "short" });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Enter your full name")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters long")).toBeInTheDocument();
  });

  it("requires the two passwords to match", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await fill(user, { ...valid, "Confirm Password": "something-else" });
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
  });

  it("accepts a valid form without showing errors or logging what was typed", async () => {
    const user = userEvent.setup();
    const spies = (["log", "info", "debug", "warn"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    render(<SignupForm />);

    await fill(user, valid);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await vi.waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.queryByText("Passwords do not match")).not.toBeInTheDocument();
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
