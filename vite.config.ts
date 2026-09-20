import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globalSetup: ["./vitest.global-setup.ts"],
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/hooks/**", "src/lib/**"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**"],
      // CLAUDE.md §4: hooks require 100% logic coverage.
      thresholds: {
        "src/hooks/**": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
