import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createLocalAccount } from "@/lib/account/device-account";
import { resetActiveCipher } from "@/lib/crypto/cipher";
import { eraseNotesDb } from "@/lib/db/notes-db";
import { lockWorkspace } from "@/lib/lock/workspace-lock";

import { UnlockedLayout } from "./unlocked-layout";

vi.mock("@/lib/crypto/kdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crypto/kdf")>()),
  createKdfParams: () => ({
    name: "Argon2id" as const,
    memorySize: 1024,
    iterations: 1,
    parallelism: 1,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
  }),
  assertAccountKdf: () => undefined,
}));

const PASSPHRASE = "correct horse battery";

beforeEach(async () => {
  resetActiveCipher();
  await eraseNotesDb();
  window.localStorage.clear();
});

function renderLayout() {
  render(
    <MemoryRouter initialEntries={["/auth/onboarding"]}>
      <Routes>
        <Route element={<UnlockedLayout />}>
          <Route path="/auth/onboarding" element={<p>Setting up</p>} />
        </Route>
        <Route path="/auth/signup" element={<p>Sign up</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("UnlockedLayout", () => {
  it("sends a device with no account to make one", async () => {
    renderLayout();

    expect(await screen.findByText("Sign up")).toBeInTheDocument();
  });

  it("asks a locked device for its passphrase before showing the page", async () => {
    await createLocalAccount({ name: "Ada", email: "ada@example.com", passphrase: PASSPHRASE });
    await lockWorkspace();
    renderLayout();

    expect(await screen.findByRole("heading", { name: "Welcome back, Ada" })).toBeInTheDocument();
    expect(screen.queryByText("Setting up")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Passphrase"), PASSPHRASE);
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("Setting up")).toBeInTheDocument();
  });
});
