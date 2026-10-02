/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRANSPORT?: "standalone" | "standalone_remote" | "msfs" | "api";
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CESIUM_ION_TOKEN?: string;
  /** Telemetry GraphQL endpoint. Default: the dev proxy in `vite` dev, the hosted API otherwise. */
  readonly VITE_TELEMETRY_GRAPHQL_URL?: string;
  /** Initial telemetry data source: "api" (default) or "sample" (offline sample data). */
  readonly VITE_TELEMETRY_SOURCE?: "api" | "sample";
  /** Comma-separated health URLs to wake from their cold start when the telemetry page opens. */
  readonly VITE_TELEMETRY_WAKE_URLS?: string;
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
