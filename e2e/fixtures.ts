import { expect, test as base } from "@playwright/test";

/**
 * Every test fails on an uncaught page error or a `console.error`, so a spec cannot pass while
 * the app is quietly broken.
 */
export const test = base.extend<{ failOnBrowserErrors: void }>({
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
});

export { expect };
