import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setApiSession } from "@/lib/api/session-store";
import * as push from "@/lib/push/subscribe";
import { usePreferencesStore } from "@/stores/use-preferences-store";
import { server } from "@/test/server";

import { ReminderPrompt } from "./reminder-prompt";

const BASE = "https://cuervo.example.com";

beforeEach(() => {
  server.use(http.get(`${BASE}/v1/push/key`, () => HttpResponse.json({ publicKey: "a-key" })));
  // jsdom has no push, so what this browser would answer is stubbed per test.
  vi.spyOn(push, "currentPushSubscription").mockResolvedValue(false);
  vi.spyOn(push, "notificationPermission").mockReturnValue("default");
});

afterEach(() => {
  setApiSession(null);
});

function signIn() {
  act(() => setApiSession({ baseUrl: BASE, token: "a-token" }));
}

const offer = () => screen.queryByRole("region", { name: "Turn on reminders" });

describe("ReminderPrompt", () => {
  it("offers nothing without a signed-in session, then offers once there is one", async () => {
    render(<ReminderPrompt />);

    // Nothing could be subscribed without an account to file it against.
    await act(() => Promise.resolve());
    expect(offer()).not.toBeInTheDocument();

    signIn();

    expect(await screen.findByRole("region", { name: "Turn on reminders" })).toBeInTheDocument();
  });

  it("turns reminders on through the browser's own prompt", async () => {
    const user = userEvent.setup();
    const subscribe = vi.spyOn(push, "subscribeToPush").mockResolvedValue("subscribed");
    signIn();
    render(<ReminderPrompt />);

    await user.click(await screen.findByRole("button", { name: "Turn on" }));

    expect(subscribe).toHaveBeenCalledWith({ baseUrl: BASE, token: "a-token" }, "a-key");
    await waitFor(() => expect(offer()).not.toBeInTheDocument());
  });

  it("remembers a Not now, so it is not offered again", async () => {
    const user = userEvent.setup();
    signIn();
    const { unmount } = render(<ReminderPrompt />);

    await user.click(await screen.findByRole("button", { name: "Not now" }));

    expect(offer()).not.toBeInTheDocument();
    expect(usePreferencesStore.getState().preferences.reminderPrompt).toBe("dismissed");

    unmount();
    vi.mocked(push.currentPushSubscription).mockClear();
    render(<ReminderPrompt />);
    await waitFor(() => expect(push.currentPushSubscription).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(offer()).not.toBeInTheDocument();
  });

  it("is not offered where the browser was already asked", async () => {
    vi.spyOn(push, "notificationPermission").mockReturnValue("granted");
    signIn();
    render(<ReminderPrompt />);

    // Everything else says yes: a key, a browser that can, no subscription yet.
    await waitFor(() => expect(push.currentPushSubscription).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(offer()).not.toBeInTheDocument();
  });
});
