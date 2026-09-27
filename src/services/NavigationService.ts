import { ApiClient } from "../api/client";
import { getNavdataPackageUrl } from "../api/navdataApi";
import { appConfig, type AppConfig } from "../config/appConfig";
import {
  defaultSettings,
  loadSettings,
  saveSettings,
  type SettingsStorage,
  type TransportSettings,
} from "../config/transportSettings";
import { NavigationDataInterface, type ConnectionState } from "../navigation/NavigationDataInterface";
import { ApiTransport } from "../navigation/transports/ApiTransport";
import { StandaloneTransport } from "../navigation/transports/StandaloneTransport";
import type { NavigationTransport } from "../navigation/types";

/** Builds the transport for the selected data source mode. */
export function createTransport(
  settings: TransportSettings,
  wasm: AppConfig["wasm"] = appConfig.wasm,
): NavigationTransport {
  const api = { baseUrl: settings.api.baseUrl.trim(), token: settings.api.token.trim() || undefined };
  switch (settings.mode) {
    case "mock":
      return new StandaloneTransport(wasm.standalone);
    case "remote": {
      const packageUrl = settings.remote.packageUrl.trim();
      return new StandaloneTransport(wasm.standalone_remote, {
        kind: "standalone_remote",
        // A pasted signed URL is used as is; otherwise the backend issues a fresh one per connect.
        getNavdataUrl: packageUrl
          ? async () => packageUrl
          : () => getNavdataPackageUrl(new ApiClient(api.baseUrl, { token: api.token })),
      });
    }
    case "api":
      return new ApiTransport(api.baseUrl, { token: api.token });
  }
}

export interface NavigationSnapshot {
  settings: TransportSettings;
  nav: NavigationDataInterface;
  state: ConnectionState;
  error: string | null;
}

export interface NavigationServiceOptions {
  defaults?: TransportSettings;
  storage?: SettingsStorage;
  createTransport?: (settings: TransportSettings) => NavigationTransport;
}

/**
 * Owns the active navigation data interface and swaps it when the data source changes.
 * Immutable snapshots make it usable with React's useSyncExternalStore.
 */
export class NavigationService {
  private readonly listeners = new Set<() => void>();
  private readonly storage?: SettingsStorage;
  private readonly create: (settings: TransportSettings) => NavigationTransport;
  private snapshot: NavigationSnapshot;
  private generation = 0;
  private started = false;

  constructor(options: NavigationServiceOptions = {}) {
    this.storage = options.storage;
    this.create = options.createTransport ?? ((settings) => createTransport(settings));
    const settings = loadSettings(this.storage, options.defaults ?? defaultSettings(appConfig));
    this.snapshot = this.idle(settings);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): NavigationSnapshot => this.snapshot;

  /** Connects the saved data source once; later calls are no-ops (safe under StrictMode). */
  start(): Promise<void> {
    if (this.started) return Promise.resolve();
    this.started = true;
    return this.connect(this.snapshot);
  }

  /** Saves the settings for this session and reconnects with the matching transport. */
  async apply(settings: TransportSettings): Promise<void> {
    this.started = true;
    saveSettings(this.storage, settings);
    const previous = this.snapshot.nav;
    const next = this.idle(settings);
    this.set(next);
    await previous.disconnect().catch(() => {});
    await this.connect(next);
  }

  private idle(settings: TransportSettings): NavigationSnapshot {
    return {
      settings,
      nav: new NavigationDataInterface(this.create(settings)),
      state: "disconnected",
      error: null,
    };
  }

  private async connect(target: NavigationSnapshot): Promise<void> {
    // Replaced by a newer apply() before connecting started: nothing to do.
    if (this.snapshot.nav !== target.nav) return;
    const generation = ++this.generation;
    const isCurrent = () => generation === this.generation && this.snapshot.nav === target.nav;
    this.set({ ...target, state: "connecting", error: null });
    try {
      await target.nav.connect();
      if (isCurrent()) this.set({ ...this.snapshot, state: "connected" });
    } catch (err) {
      if (isCurrent()) {
        this.set({ ...this.snapshot, state: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }
    // Superseded while connecting: release what this attempt loaded (e.g. the WASM host).
    if (!isCurrent()) await target.nav.disconnect().catch(() => {});
  }

  private set(snapshot: NavigationSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

function sessionStorageOrUndefined(): SettingsStorage | undefined {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

let instance: NavigationService | null = null;

/** App-wide navigation service; settings persist in sessionStorage for the tab/window. */
export function getNavigationService(): NavigationService {
  instance ??= new NavigationService({ storage: sessionStorageOrUndefined() });
  return instance;
}
