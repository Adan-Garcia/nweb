import { expect, test } from "./fixtures";

/**
 * jsdom cannot cover any of this: there is no service worker, no cache storage and no way
 * to go offline. Only a real browser can show that a cold start with no network works,
 * which is the whole point of the change.
 */
test.describe("installing and working offline", () => {
  test("serves a manifest a browser can install from", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );

    const response = await page.request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);

    const manifest = (await response.json()) as {
      name: string;
      start_url: string;
      display: string;
      icons: { sizes: string; purpose: string; src: string }[];
    };

    expect(manifest).toMatchObject({
      name: "Cuervo Planner",
      start_url: "/dashboard",
      display: "standalone",
    });

    // An installable icon set: something at 192, something at 512, and a maskable one.
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);

    // And the files behind them are really there.
    for (const icon of manifest.icons) {
      expect((await page.request.get(icon.src)).ok(), icon.src).toBe(true);
    }
  });

  test("starts from the cache with the network cut off", async ({ page, context }) => {
    await page.goto("/dashboard");

    // The worker only caches what it serves, and it is not controlling the page that
    // registered it. Everything below this line is the user's second visit onwards.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    // Visit both routes under the worker, so their lazily-loaded chunks are cached.
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

    await context.setOffline(true);

    // A full reload with no network: the document and every asset come from the cache.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

    // And another route is still reachable from there.
    await page.getByRole("link", { name: "Calendar", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();

    await context.setOffline(false);
  });
});
