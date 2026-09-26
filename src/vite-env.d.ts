/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRANSPORT?: "standalone" | "msfs" | "api";
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CESIUM_ION_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ElectronAPI {
  isElectron: true;
  platform: string;
  versions: { electron: string; chrome: string; node: string };
}

interface Window {
  electronAPI?: ElectronAPI;
}
