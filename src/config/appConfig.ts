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
  telemetry: TelemetryConfig;
}

export interface TelemetryConfig {
  /** Initial data source of the telemetry page: the live API, or offline sample data. */
  source: "api" | "sample";
  /** GraphQL endpoint of the Aviation Telemetry API; may be relative (the dev proxy). */
  graphqlUrl: string;
  /** True when requests go through the Vite dev proxy, which adds the API token server-side. */
  proxied: boolean;
  /** Dev server only: where the subscription socket gets the token the proxy can't add (see vite.shared.mts). */
  devTokenUrl?: string;
}

export const TELEMETRY_API_URL = "https://aviation-api-5f6p.onrender.com/graphql";
/** Path the Vite dev server proxies to the telemetry API (see vite.config.mts). */
export const TELEMETRY_PROXY_PATH = "/telemetry-api";

function resolveTelemetry(): TelemetryConfig {
  const source = import.meta.env.VITE_TELEMETRY_SOURCE === "sample" ? "sample" : "api";
  const configured = import.meta.env.VITE_TELEMETRY_GRAPHQL_URL;
  const graphqlUrl = configured || (import.meta.env.DEV ? `${TELEMETRY_PROXY_PATH}/graphql` : TELEMETRY_API_URL);
  const proxied = Boolean(import.meta.env.DEV) && graphqlUrl.startsWith(TELEMETRY_PROXY_PATH);
  return proxied ? { source, graphqlUrl, proxied, devTokenUrl: "/__telemetry-dev-token" } : { source, graphqlUrl, proxied };
}

/** ws(s):// URL for a GraphQL endpoint; relative URLs resolve against `base` (the page URL). */
export function toWebSocketUrl(url: string, base?: string): string {
  const resolved = new URL(url, base);
  resolved.protocol = resolved.protocol === "https:" ? "wss:" : "ws:";
  return resolved.toString();
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
  telemetry: resolveTelemetry(),
};
