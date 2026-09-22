import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

/**
 * The server is bundled rather than run from source.
 *
 * Node can strip types now, but not resolve `./app` or `@shared/…` — both of which this
 * codebase writes everywhere, because the browser build resolves them. Vite is already
 * here and already knows the aliases, so the build that ships is the one the app uses.
 * Dependencies stay external: this bundles our source, not `pg`.
 */
export default defineConfig({
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("../shared", import.meta.url)) },
  },
  build: {
    ssr: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
    outDir: fileURLToPath(new URL("../dist-server", import.meta.url)),
    emptyOutDir: true,
    target: "node22",
    minify: false,
  },
});
