import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../../src/config/appConfig";
import {
  SETTINGS_STORAGE_KEY,
  type SettingsStorage,
  type TransportMode,
  type TransportSettings,
} from "../../../src/config/transportSettings";
import { ApiTransport } from "../../../src/navigation/transports/ApiTransport";
import { StandaloneTransport } from "../../../src/navigation/transports/StandaloneTransport";
import type { NavigationTransport, TransportKind } from "../../../src/navigation/types";
import { createTransport, NavigationService } from "../../../src/services/NavigationService";
import { jsonResponse } from "../../helpers";

const wasm: AppConfig["wasm"] = {
  standalone: "/wasm/mock.wasm",
  standalone_remote: "/wasm/remote.wasm",
  msfs: "/wasm/msfs.wasm",
};

function settings(mode: TransportMode, patch: Partial<TransportSettings> = {}): TransportSettings {
  return {
    mode,
    remote: { packageUrl: "" },
    api: { baseUrl: "https://nav.example.com/api/v1", token: "" },
    ...patch,
  };
}

describe("createTransport", () => {
  it.each([
    ["mock", StandaloneTransport, "standalone"],
    ["remote", StandaloneTransport, "standalone_remote"],
    ["api", ApiTransport, "api"],
  ] as const)("builds the %s transport", (mode, Class, kind) => {
    const transport = createTransport(settings(mode), wasm);
    expect(transport).toBeInstanceOf(Class);
    expect(transport.kind).toBe(kind);
  });

  it.each([
    ["mock", "/wasm/mock.wasm"],
    ["remote", "/wasm/remote.wasm"],
  ] as const)("points the %s transport at its own WASM binary", async (mode, wasmUrl) => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createTransport(settings(mode), wasm).connect()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledWith(wasmUrl);
  });

  it("points the api transport at the configured backend with the token", async () => {
    const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) => jsonResponse({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    const s = settings("api", { api: { baseUrl: " https://api.test/v2 ", token: " secret " } });
    await createTransport(s, wasm).connect();
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.test/v2/health");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer secret" });
  });

  it("omits the Authorization header without a token", async () => {
    const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await createTransport(settings("api", { api: { baseUrl: "https://api.test", token: "  " } }), wasm).connect();
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
  });
});

describe("createTransport: remote package URL source", () => {
  // Capture the getNavdataUrl option without loading WASM.
  function remoteOptions(s: TransportSettings) {
    const transport = createTransport(s, wasm) as StandaloneTransport;
    return (transport as unknown as { getNavdataUrl: () => Promise<string> }).getNavdataUrl;
  }

  it("uses a pasted signed URL without calling the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const getUrl = remoteOptions(settings("remote", { remote: { packageUrl: " https://pkg.test/a.zip?sig=1 " } }));
    await expect(getUrl()).resolves.toBe("https://pkg.test/a.zip?sig=1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the backend (with token) when no URL is given", async () => {
    const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) => jsonResponse({ url: "https://pkg.test/b.zip" }));
    vi.stubGlobal("fetch", fetchMock);
    const getUrl = remoteOptions(settings("remote", { api: { baseUrl: "https://api.test", token: "t0k" } }));
    await expect(getUrl()).resolves.toBe("https://pkg.test/b.zip");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.test/navdata/package-url");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer t0k" });
  });
});

/** Transport whose connect() is resolved/rejected by the test. */
function controllableTransport(kind: TransportKind) {
  let settle!: { resolve(): void; reject(err: Error): void };
  const transport: NavigationTransport = {
    kind,
    connect: vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          settle = { resolve, reject };
        }),
    ),
    disconnect: vi.fn(async () => {}),
    getAirport: vi.fn(async () => null),
    searchWaypoints: vi.fn(async () => []),
    getWaypointsInRange: vi.fn(async () => []),
  };
  return { transport, settle: () => settle };
}

function memoryStorage(initial: Record<string, string> = {}): SettingsStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function setup(storage = memoryStorage()) {
  const created: ReturnType<typeof controllableTransport>[] = [];
  const service = new NavigationService({
    storage,
    defaults: settings("mock"),
    createTransport: (s) => {
      const t = controllableTransport(
        ({ mock: "standalone", remote: "standalone_remote", api: "api" } as const)[s.mode],
      );
      created.push(t);
      return t.transport;
    },
  });
  return { service, created, storage };
}

describe("NavigationService", () => {
  it("defaults to mock and starts disconnected", () => {
    const { service } = setup();
    expect(service.getSnapshot().settings.mode).toBe("mock");
    expect(service.getSnapshot().nav.transportKind).toBe("standalone");
    expect(service.getSnapshot().state).toBe("disconnected");
  });

  it("restores settings saved earlier in the session", () => {
    const saved = settings("api", { api: { baseUrl: "https://saved.test", token: "x" } });
    const { service } = setup(memoryStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify(saved) }));
    expect(service.getSnapshot().settings).toEqual(saved);
    expect(service.getSnapshot().nav.transportKind).toBe("api");
  });

  it("start connects once and notifies subscribers", async () => {
    const { service, created } = setup();
    const listener = vi.fn();
    service.subscribe(listener);

    const started = service.start();
    void service.start(); // StrictMode double effect
    expect(service.getSnapshot().state).toBe("connecting");
    created[0].settle().resolve();
    await started;

    expect(created[0].transport.connect).toHaveBeenCalledOnce();
    expect(service.getSnapshot().state).toBe("connected");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps snapshots referentially stable between changes", () => {
    const { service } = setup();
    expect(service.getSnapshot()).toBe(service.getSnapshot());
  });

  it("reports connect errors", async () => {
    const { service, created } = setup();
    const started = service.start();
    created[0].settle().reject(new Error("WASM module not found"));
    await started;
    expect(service.getSnapshot()).toMatchObject({ state: "error", error: "WASM module not found" });
  });

  it.each(["remote", "api"] as const)("apply switches from mock to %s and disconnects the old transport", async (mode) => {
    const { service, created, storage } = setup();
    const started = service.start();
    created[0].settle().resolve();
    await started;

    const next = settings(mode, { api: { baseUrl: "https://api.test", token: "secret" } });
    const applied = service.apply(next);
    expect(service.getSnapshot().settings).toBe(next);
    await vi.waitFor(() => expect(created[1].transport.connect).toHaveBeenCalled());
    created[1].settle().resolve();
    await applied;

    expect(created[0].transport.disconnect).toHaveBeenCalled();
    expect(service.getSnapshot().nav.transportKind).toBe(created[1].transport.kind);
    expect(service.getSnapshot().state).toBe("connected");
    expect(JSON.parse(storage.data[SETTINGS_STORAGE_KEY])).toEqual(next);
  });

  it("ignores a connect that finishes after a newer apply, and releases it", async () => {
    const { service, created } = setup();
    const first = service.apply(settings("api"));
    await vi.waitFor(() => expect(created[1].transport.connect).toHaveBeenCalled());
    const second = service.apply(settings("mock"));
    await vi.waitFor(() => expect(created[2].transport.connect).toHaveBeenCalled());

    created[2].settle().resolve();
    created[1].settle().reject(new Error("stale failure"));
    await Promise.all([first, second]);

    expect(service.getSnapshot()).toMatchObject({ state: "connected", error: null });
    expect(service.getSnapshot().nav.transportKind).toBe("standalone");
    expect(created[1].transport.disconnect).toHaveBeenCalled();
  });

  it("skips connecting a transport replaced before its connect started", async () => {
    const { service, created } = setup();
    // Back-to-back applies: the first is superseded while the old transport disconnects.
    const first = service.apply(settings("api"));
    const second = service.apply(settings("remote"));
    await vi.waitFor(() => expect(created[2].transport.connect).toHaveBeenCalled());
    expect(service.getSnapshot()).toMatchObject({ state: "connecting" });
    expect(service.getSnapshot().settings.mode).toBe("remote");

    created[2].settle().resolve();
    await Promise.all([first, second]);
    expect(created[1].transport.connect).not.toHaveBeenCalled();
    expect(service.getSnapshot()).toMatchObject({ state: "connected" });
    expect(service.getSnapshot().nav.transportKind).toBe("standalone_remote");
  });
});

describe("getNavigationService", () => {
  async function load() {
    vi.resetModules();
    return (await import("../../../src/services/NavigationService")).getNavigationService;
  }

  it("is a single instance restoring settings from sessionStorage", async () => {
    const saved = settings("remote", { remote: { packageUrl: "https://pkg.test/a.zip?sig=1" } });
    vi.stubGlobal("sessionStorage", memoryStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify(saved) }));
    const getNavigationService = await load();

    expect(getNavigationService()).toBe(getNavigationService());
    expect(getNavigationService().getSnapshot().settings).toEqual(saved);
    expect(getNavigationService().getSnapshot().nav.transportKind).toBe("standalone_remote");
  });

  it("defaults to mock when nothing is saved and VITE_TRANSPORT is unset", async () => {
    vi.stubEnv("VITE_TRANSPORT", undefined);
    vi.stubGlobal("sessionStorage", memoryStorage());
    const getNavigationService = await load();
    expect(getNavigationService().getSnapshot().settings.mode).toBe("mock");
  });

  it("works without sessionStorage (e.g. storage disabled)", async () => {
    vi.stubGlobal("sessionStorage", undefined);
    const getNavigationService = await load();
    expect(getNavigationService().getSnapshot().settings.mode).toBeDefined();
  });
});
