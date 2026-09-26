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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
