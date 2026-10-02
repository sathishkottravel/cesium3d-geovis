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
 * unless the user opts into "Remember on this device": then the desktop app keeps it in the OS keychain,
 * and a browser in localStorage (readable by any script on the page; a static site has nothing safer).
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
  /** Electron only: where a remembered token goes instead of localStorage. */
  keychain?: ElectronSecrets;
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
  return { session: pick("sessionStorage"), local: pick("localStorage"), keychain: globalThis.window?.electronAPI?.secrets };
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
  const remember = local !== null && saved === local;
  let token = typeof saved.token === "string" ? saved.token : "";
  if (remember && stores.keychain) {
    try {
      token = stores.keychain.getTelemetryToken() ?? "";
    } catch {
      token = "";
    }
  }
  return {
    source: saved.source === "api" || saved.source === "sample" ? saved.source : defaultSource,
    graphqlUrl: typeof saved.graphqlUrl === "string" && saved.graphqlUrl ? saved.graphqlUrl : defaultUrl,
    token,
    remember,
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

function setKeychainToken(stores: SettingsStores, token: string): boolean {
  try {
    if (!token) {
      stores.keychain?.clearTelemetryToken();
      return true;
    }
    return stores.keychain?.setTelemetryToken(token) ?? false;
  } catch {
    return false;
  }
}

/** Saves to exactly one place, so un-ticking "Remember" also removes the remembered copy. */
export function saveTelemetrySettings(stores: SettingsStores, settings: TelemetrySettings): void {
  if (!settings.remember) {
    remove(stores.local);
    setKeychainToken(stores, "");
    write(stores.session, settings);
  } else if (!stores.keychain) {
    remove(stores.session);
    write(stores.local, settings);
  } else if (setKeychainToken(stores, settings.token)) {
    // The desktop app: the token goes to the OS keychain, never to localStorage.
    remove(stores.session);
    write(stores.local, { ...settings, token: "" });
  } else {
    // No OS keychain: don't fall back to plain text. Remember the rest; keep the token for this session.
    write(stores.local, { ...settings, token: "" });
    write(stores.session, { ...settings, remember: false });
  }
}

/** "Forget token": drops saved settings everywhere. */
export function clearTelemetrySettings(stores: SettingsStores): void {
  remove(stores.session);
  remove(stores.local);
  setKeychainToken(stores, "");
}

/** A secret as it may be shown: the first 4 characters, then a mask. */
export function maskSecret(secret: string): string {
  const value = secret.trim();
  if (!value) return "";
  return value.length <= 8 ? "•••" : `${value.slice(0, 4)}…•••`;
}
