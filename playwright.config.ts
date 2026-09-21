import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/**
 * Browser-level tests. They cover what jsdom cannot: the real Excalidraw canvas, real pdf.js,
 * drag-and-drop and fullscreen. Everything else is covered by the Vitest suite.
 *
 * They run against a production build served by `vite preview`, so they exercise what ships.
 * First run on a machine: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  // Local screenshot baselines for the `visual` project (not committed; see e2e/visual.spec.ts).
  snapshotPathTemplate: "e2e/__visual__/{projectName}/{arg}{ext}",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    { name: "e2e", testIgnore: "**/visual.spec.ts" },
    { name: "visual", testMatch: "**/visual.spec.ts" },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
