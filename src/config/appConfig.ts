import type { TransportKind } from "../navigation/types";

const TRANSPORTS: readonly TransportKind[] = ["standalone", "msfs", "api"];

function resolveTransport(value: string | undefined): TransportKind {
  if (value && (TRANSPORTS as readonly string[]).includes(value)) {
    return value as TransportKind;
  }
  return "standalone";
}

export interface AppConfig {
  transport: TransportKind;
  apiBaseUrl: string;
  cesiumIonToken?: string;
  wasm: Record<Exclude<TransportKind, "api">, string>;
}

// BASE_URL is "/" in dev, "/<repo>/" on GitHub Pages and "./" in Electron.
const base = import.meta.env.BASE_URL;

export const appConfig: AppConfig = {
  transport: resolveTransport(import.meta.env.VITE_TRANSPORT),
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787/api/v1",
  cesiumIonToken: import.meta.env.VITE_CESIUM_ION_TOKEN || undefined,
  wasm: {
    standalone: `${base}wasm/navigation-standalone.wasm`,
    msfs: `${base}wasm/navigation-msfs.wasm`,
  },
};
