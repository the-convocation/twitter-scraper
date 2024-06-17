/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TWITTER_USERNAME: string;
  readonly VITE_TWITTER_PASSWORD: string;
  readonly VITE_TWITTER_EMAIL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
