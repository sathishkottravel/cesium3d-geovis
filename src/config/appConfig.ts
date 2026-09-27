import type { TransportKind } from "../navigation/types";

const TRANSPORTS: readonly TransportKind[] = ["standalone", "standalone_remote", "msfs", "api"];

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
  /** glTF model of the aircraft in the flight animation. */
  aircraftModel: string;
}

// BASE_URL is "/" in dev, "/<repo>/" on GitHub Pages and "./" in Electron.
const base = import.meta.env.BASE_URL;

export const appConfig: AppConfig = {
  transport: resolveTransport(import.meta.env.VITE_TRANSPORT),
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/mock",
  cesiumIonToken: import.meta.env.VITE_CESIUM_ION_TOKEN || undefined,
  wasm: {
    standalone: `${base}wasm/standalone/mock/standalone_navigation_data_interface.wasm`,
    standalone_remote: `${base}wasm/standalone/remote/standalone_navigation_data_interface.wasm`,
    msfs: `${base}wasm/msfs-2020/msfs_navigation_data_interface.wasm`,
  },
  aircraftModel: `${base}models/CesiumAir/Cesium_Air.glb`,
};
