import { expect, test as base } from "@playwright/test";

import { signUp } from "./account";

/**
 * Every test fails on an uncaught page error or a `console.error`, so a spec cannot pass while
 * the app is quietly broken.
 *
 * Every test also starts on a device with its local account, since no workspace page opens
 * without one. A spec about the sign-up itself opts out with `test.use({ signedUp: false })`.
 */
export const test = base.extend<{ signedUp: boolean; failOnBrowserErrors: void; account: void }>({
  signedUp: [true, { option: true }],
  failOnBrowserErrors: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") {
          problems.push(`console.error: ${message.text()}`);
        }
      });

      await use();

      expect(problems, "unexpected browser errors").toEqual([]);
    },
    { auto: true },
  ],
  account: [
    async ({ page, signedUp }, use) => {
      if (signedUp) {
        await signUp(page);
      }

      await use();
    },
    { auto: true },
  ],
});

export { expect };
