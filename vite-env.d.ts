interface ImportMetaEnv {
  readonly VITE_BACKEND_API_URL?: string;
  readonly VITE_PRISM_API_KEY?: string;
  readonly VITE_PRISM_SCAN_ID?: string;
  readonly VITE_PRISM_TOKEN?: string;
  readonly VITE_PRISM_ENV?: string;
  [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}