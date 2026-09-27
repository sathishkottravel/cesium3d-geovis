import type { TransportKind } from "../navigation/types";
import type { AppConfig } from "./appConfig";

/** Data source modes offered in the UI. */
export type TransportMode = "mock" | "remote" | "api";

export const TRANSPORT_MODES: readonly TransportMode[] = ["mock", "remote", "api"];

export const MODE_TRANSPORT: Record<TransportMode, TransportKind> = {
  mock: "standalone",
  remote: "standalone_remote",
  api: "api",
};

export const MODE_LABELS: Record<TransportMode, string> = {
  mock: "Mock (bundled WASM database)",
  remote: "Remote (Navigraph package)",
  api: "API (HTTP backend)",
};

export interface TransportSettings {
  mode: TransportMode;
  remote: {
    /**
     * Signed navigation data package URL, required to connect from the UI. Empty only when a build starts in
     * remote mode (VITE_TRANSPORT=standalone_remote); the transport then asks the backend (`api.baseUrl`) for one.
     */
    packageUrl: string;
  };
  api: {
    baseUrl: string;
    token: string;
  };
}

/** Minimal Storage subset, so tests and non-browser runtimes can pass their own. */
export type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

export const SETTINGS_STORAGE_KEY = "cesium3d-geovis.transportSettings";

/** Build-time defaults: the mode follows VITE_TRANSPORT, falling back to mock. */
export function defaultSettings(config: Pick<AppConfig, "transport" | "apiBaseUrl">): TransportSettings {
  const mode = TRANSPORT_MODES.find((m) => MODE_TRANSPORT[m] === config.transport) ?? "mock";
  return {
    mode,
    remote: { packageUrl: "" },
    api: { baseUrl: config.apiBaseUrl, token: "" },
  };
}

const asString = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/** Reads settings saved in this session, filling anything missing or invalid from `defaults`. */
export function loadSettings(storage: SettingsStorage | undefined, defaults: TransportSettings): TransportSettings {
  let raw: string | null | undefined;
  let saved: Record<string, unknown>;
  try {
    raw = storage?.getItem(SETTINGS_STORAGE_KEY);
    saved = asRecord(raw ? JSON.parse(raw) : null);
  } catch {
    // Storage blocked or corrupt JSON: fall back to defaults.
    return defaults;
  }
  if (!raw) return defaults;

  const remote = asRecord(saved.remote);
  const api = asRecord(saved.api);
  return {
    mode: TRANSPORT_MODES.includes(saved.mode as TransportMode) ? (saved.mode as TransportMode) : defaults.mode,
    remote: { packageUrl: asString(remote.packageUrl, defaults.remote.packageUrl) },
    api: {
      baseUrl: asString(api.baseUrl, defaults.api.baseUrl),
      token: asString(api.token, defaults.api.token),
    },
  };
}

export function saveSettings(storage: SettingsStorage | undefined, settings: TransportSettings): void {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: settings still apply for this page load.
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Returns a message per invalid field for the given mode; empty when the settings can be applied. */
export function validateSettings(settings: TransportSettings): Partial<Record<"packageUrl" | "baseUrl", string>> {
  const errors: Partial<Record<"packageUrl" | "baseUrl", string>> = {};
  const { packageUrl } = settings.remote;
  const { baseUrl } = settings.api;
  if (settings.mode === "remote" && !isHttpUrl(packageUrl.trim())) {
    errors.packageUrl = packageUrl.trim() ? "Enter an http(s) URL" : "Enter the signed package URL";
  }
  if (settings.mode === "api" && !isHttpUrl(baseUrl.trim())) errors.baseUrl = "Enter an http(s) URL";
  return errors;
}

const MASK = "•••";

/**
 * Masks the parts of a URL that carry credentials (user info, query values, fragment),
 * keeping the host and path readable, e.g. `https://host/path/file.zip?Signature=•••&Expires=•••`.
 */
export function maskSignedUrl(value: string): string {
  if (!value.trim()) return "";
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return MASK;
  }
  const query = [...url.searchParams.keys()].map((key) => `${encodeURIComponent(key)}=${MASK}`).join("&");
  const userInfo = url.username || url.password ? `${MASK}@` : "";
  return `${url.protocol}//${userInfo}${url.host}${url.pathname}${query ? `?${query}` : ""}${url.hash ? `#${MASK}` : ""}`;
}
