/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_MOCK_AUTOLOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
