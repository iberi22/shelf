/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
declare const __COMMIT_HASH__: string;

interface ImportMetaEnv {
  readonly VITE_XAVIER_URL?: string;
  readonly VITE_XAVIER_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
