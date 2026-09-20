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
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/components/ui/**", // shadcn-generated
        "src/main.tsx",
      ],
      // CLAUDE.md section 4. Set just below what is measured, so coverage can only go up.
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 80,
        branches: 80,
        // Hooks require 100% logic coverage.
        "src/hooks/**": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/lib/**": { lines: 92, functions: 92, branches: 85, statements: 92 },
        "src/workers/**": { lines: 95, functions: 95, branches: 85, statements: 95 },
      },
    },
  },
});
