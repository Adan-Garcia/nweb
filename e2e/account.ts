import { expect, type Page } from "@playwright/test";

/**
 * Every device has a local account before its workspace opens, and its passphrase is asked
 * for on every page load: the key lives in memory only. These are those two steps, as a
 * person takes them.
 */
export const PASSPHRASE = "correct horse battery staple";

export async function signUp(page: Page, passphrase = PASSPHRASE) {
  await page.goto("/auth/signup");
  await page.getByLabel("Name").fill("Ada");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
  await page.getByLabel("Confirm passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/auth\/onboarding$/, { timeout: 30_000 });
}

/** Answers the lock screen a full page load brings up. */
export async function unlock(page: Page, passphrase = PASSPHRASE) {
  await expect(page.getByRole("heading", { name: "Welcome back, Ada" })).toBeVisible();
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back, Ada" })).toBeHidden({
    timeout: 30_000,
  });
}

/** A full page load of a workspace page, and the unlock it needs. */
export async function visit(page: Page, path: string) {
  await page.goto(path);
  await unlock(page);
}

export async function reload(page: Page) {
  await page.reload();
  await unlock(page);
}
