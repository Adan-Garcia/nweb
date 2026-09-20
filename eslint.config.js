import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
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
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // CLAUDE.md section 3: no stray logging (the tracer in lib/notes-trace.ts is exempt below).
      'no-console': 'error',
    },
  },
  {
    // CLAUDE.md section 1: components 150 lines, every line counted. shadcn primitives and tests are exempt.
    files: ['src/**/*.tsx'],
    ignores: ['src/components/ui/**', 'src/**/*.test.tsx'],
    rules: {
      'max-lines': ['error', { max: 150, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    // Hooks, lib modules and workers: 300 lines.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    // The sanctioned tracer is the one place allowed to log.
    files: ['src/lib/notes-trace.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // shadcn-generated primitives intentionally co-export variants/hooks
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
