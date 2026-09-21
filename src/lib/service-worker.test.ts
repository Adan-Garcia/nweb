import { afterEach, describe, expect, it, vi } from "vitest";

import { registerServiceWorker } from "./service-worker";

function stubServiceWorkerContainer(register: () => Promise<ServiceWorkerRegistration>) {
  vi.stubGlobal("navigator", { serviceWorker: { register } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerServiceWorker", () => {
  it("registers the worker at the root, so it can serve every route", async () => {
    // A registration object only has to be non-null here; nothing reads it.
    const registration = {} as ServiceWorkerRegistration;
    const register = vi.fn(() => Promise.resolve(registration));
    stubServiceWorkerContainer(register);

    expect(await registerServiceWorker({ isProduction: true })).toBe(registration);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("does nothing in development, where a cache would serve back yesterday's code", async () => {
    const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));
    stubServiceWorkerContainer(register);

    expect(await registerServiceWorker({ isProduction: false })).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("does nothing in a browser without service workers", async () => {
    vi.stubGlobal("navigator", {});

    expect(await registerServiceWorker({ isProduction: true })).toBeNull();
  });

  it("swallows a failed registration, because it only costs offline support", async () => {
    stubServiceWorkerContainer(() => Promise.reject(new Error("insecure context")));

    await expect(registerServiceWorker({ isProduction: true })).resolves.toBeNull();
  });
});
