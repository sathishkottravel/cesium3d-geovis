import type { SettingsStorage } from "../config/transportSettings";

/** "sample" answers the same operations offline from recorded traffic (see mock/MockTelemetryServer). */
export type TelemetrySource = "api" | "sample";

export const SOURCE_LABELS: Record<TelemetrySource, string> = {
  api: "Live API",
  sample: "Sample data (offline)",
};

/**
 * Connection settings of the telemetry page. The API token is never part of a build: in dev the Vite
 * proxy adds it; otherwise the user pastes it here. It's kept in sessionStorage (gone with the tab)
 * unless the user opts into localStorage with "Remember on this device".
 */
export interface TelemetrySettings {
  source: TelemetrySource;
  graphqlUrl: string;
  token: string;
  remember: boolean;
}

export const TELEMETRY_SETTINGS_KEY = "cesium3d-geovis.telemetrySettings";

export interface SettingsStores {
  session?: SettingsStorage & Pick<Storage, "removeItem">;
  local?: SettingsStorage & Pick<Storage, "removeItem">;
}

/** The browser's storages; either may be missing or throw (private mode, blocked site data). */
export function browserStores(): SettingsStores {
  const pick = (name: "sessionStorage" | "localStorage") => {
    try {
      return globalThis[name];
    } catch {
      return undefined;
    }
  };
  return { session: pick("sessionStorage"), local: pick("localStorage") };
}

function read(storage: SettingsStorage | undefined): Record<string, unknown> | null {
  try {
    const raw = storage?.getItem(TELEMETRY_SETTINGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Session settings win over remembered ones; anything missing comes from the defaults. */
export function loadTelemetrySettings(
  stores: SettingsStores,
  defaultUrl: string,
  defaultSource: TelemetrySource = "api",
): TelemetrySettings {
  const local = read(stores.local);
  const saved = read(stores.session) ?? local ?? {};
  return {
    source: saved.source === "api" || saved.source === "sample" ? saved.source : defaultSource,
    graphqlUrl: typeof saved.graphqlUrl === "string" && saved.graphqlUrl ? saved.graphqlUrl : defaultUrl,
    token: typeof saved.token === "string" ? saved.token : "",
    remember: local !== null && saved === local,
  };
}

function remove(storage: SettingsStores["session"]): void {
  try {
    storage?.removeItem(TELEMETRY_SETTINGS_KEY);
  } catch {
    // Blocked storage: nothing was saved there either.
  }
}

function write(storage: SettingsStores["session"], settings: TelemetrySettings): void {
  try {
    storage?.setItem(TELEMETRY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Full or blocked: the settings still apply until the page closes.
  }
}

/** Saves to exactly one storage, so un-ticking "Remember" also removes the remembered copy. */
export function saveTelemetrySettings(stores: SettingsStores, settings: TelemetrySettings): void {
  if (settings.remember) {
    remove(stores.session);
    write(stores.local, settings);
  } else {
    remove(stores.local);
    write(stores.session, settings);
  }
}

/** "Forget token": drops saved settings everywhere. */
export function clearTelemetrySettings(stores: SettingsStores): void {
  remove(stores.session);
  remove(stores.local);
}

/** A secret as it may be shown: the first 4 characters, then a mask. */
export function maskSecret(secret: string): string {
  const value = secret.trim();
  if (!value) return "";
  return value.length <= 8 ? "•••" : `${value.slice(0, 4)}…•••`;
}
