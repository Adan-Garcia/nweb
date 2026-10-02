/// <reference types="vite/client" />

/**
 * The environment this build was compiled with.
 *
 * Declared rather than read off Vite's default index signature, which is `any` and would
 * make every use of it an unsafe assignment. Everything here is public: `VITE_` values are
 * compiled into the bundle and anyone can read them, which is right for a URL and would be
 * wrong for a credential.
 */
interface ImportMetaEnv {
  /** Where the accounts server lives. Absent means this build has no server, which is fine. */
  readonly VITE_API_URL?: string;
  /**
   * "1" signs a dev server straight in with a throwaway local account (`npm run dev:open`).
   * Read only behind `import.meta.env.DEV`, so a production build never contains it.
   */
  readonly VITE_DEV_SESSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
