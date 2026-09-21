import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

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
    alias: {
      // brotli-wasm's ESM entry loads its .wasm by fetching a URL relative to the module,
      // which Node cannot do for a file: URL. Tests run in Node either way, so they use the
      // package's own Node build, which reads the same .wasm off disk. The browser and the
      // worker still get the web build.
      "brotli-wasm": fileURLToPath(
        new URL("./node_modules/brotli-wasm/index.node.js", import.meta.url),
      ),
    },
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
        lines: 97,
        statements: 97,
        functions: 95,
        branches: 92,
        // Hooks require 100% logic coverage.
        "src/hooks/**": { lines: 100, functions: 100, branches: 100, statements: 100 },
        // Feature hooks live next to their components; a few defensive branches remain.
        "src/components/**/use-*.ts": { lines: 97, functions: 97, branches: 88, statements: 97 },
        "src/lib/**": { lines: 97, functions: 99, branches: 93, statements: 97 },
        "src/workers/**": { lines: 100, functions: 100, branches: 90, statements: 100 },
      },
    },
  },
});
