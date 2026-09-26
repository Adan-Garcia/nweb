import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "coverage", "test-results", "playwright-report", "blob-report"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: [
          "./tsconfig.node.json",
          "./tsconfig.app.json",
          "./tsconfig.e2e.json",
          "./tsconfig.server.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      // CLAUDE.md section 3: no stray logging (the tracer in lib/notes-trace.ts is exempt below).
      "no-console": "error",
      // CLAUDE.md section 3: packages, then `@/`, then relative, then side-effect (CSS) imports.
      // Side-effect imports come last and keep their written order: CSS order is the cascade.
      "simple-import-sort/imports": [
        "error",
        { groups: [["^react$", "^@?\\w"], ["^@/"], ["^\\."], ["^\\u0000"]] },
      ],
      "simple-import-sort/exports": "error",
    },
  },
  {
    // CLAUDE.md section 1: components 150 lines, every line counted. shadcn primitives and tests are exempt.
    files: ["src/**/*.tsx"],
    ignores: ["src/components/ui/**", "src/**/*.test.tsx"],
    rules: {
      "max-lines": ["error", { max: 150, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    // Hooks, lib modules and workers: 300 lines.
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    // The server is Node, not a browser, and a service that cannot log is not operable —
    // so `no-console` is off here. It has the same 300-line limit as any other module.
    files: ["server/**/*.ts"],
    ignores: ["server/**/*.test.ts"],
    languageOptions: { globals: globals.node },
    rules: {
      "no-console": "off",
      "max-lines": ["error", { max: 300, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    // The global stylesheet (Tailwind + theme) must load before any page stylesheet, and the
    // entry point is where that is decided, so its imports keep their written order.
    files: ["src/main.tsx"],
    rules: {
      "simple-import-sort/imports": "off",
    },
  },
  {
    // The sanctioned tracer is the one place allowed to log.
    files: ["src/lib/notes-trace.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // shadcn-generated primitives intentionally co-export variants/hooks
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);
