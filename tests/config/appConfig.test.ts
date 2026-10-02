import { beforeEach, describe, expect, it, vi } from "vitest";
import { toWebSocketUrl, type AppConfig } from "../../src/config/appConfig";

// appConfig is evaluated once at import time from import.meta.env, so every
// case stubs the env, drops the module cache and re-imports it.
async function loadConfig(env: Record<string, string | boolean | undefined>): Promise<AppConfig> {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "boolean") vi.stubEnv(key as "DEV", value);
    else vi.stubEnv(key, value);
  }
  vi.resetModules();
  return (await import("../../src/config/appConfig")).appConfig;
}

beforeEach(() => {
  // Keep a developer's local .env from leaking into the assertions.
  vi.stubEnv("VITE_TRANSPORT", undefined);
  vi.stubEnv("VITE_API_BASE_URL", undefined);
  vi.stubEnv("VITE_CESIUM_ION_TOKEN", undefined);
  vi.stubEnv("VITE_TELEMETRY_GRAPHQL_URL", undefined);
  vi.stubEnv("VITE_TELEMETRY_SOURCE", undefined);
  vi.stubEnv("VITE_TELEMETRY_WAKE_URLS", undefined);
  vi.stubEnv("BASE_URL", "/");
});

describe("transport selection (VITE_TRANSPORT)", () => {
  it("defaults to standalone when unset", async () => {
    expect((await loadConfig({})).transport).toBe("standalone");
  });

  it.each(["standalone", "standalone_remote", "msfs", "api"] as const)("accepts %s", async (transport) => {
    expect((await loadConfig({ VITE_TRANSPORT: transport })).transport).toBe(transport);
  });

  it.each(["", "STANDALONE", "remote", "http", "msfs-2020"])("falls back to standalone for %j", async (value) => {
    expect((await loadConfig({ VITE_TRANSPORT: value })).transport).toBe("standalone");
  });
});

describe("API base URL (VITE_API_BASE_URL)", () => {
  it("defaults to the local backend", async () => {
    expect((await loadConfig({})).apiBaseUrl).toBe("http://localhost:3000/api/mock");
  });

  it("uses the configured backend", async () => {
    const config = await loadConfig({ VITE_API_BASE_URL: "https://nav.example.com/api/v2" });
    expect(config.apiBaseUrl).toBe("https://nav.example.com/api/v2");
  });
});

describe("Cesium ion token (VITE_CESIUM_ION_TOKEN)", () => {
  it("is undefined when unset or empty", async () => {
    expect((await loadConfig({})).cesiumIonToken).toBeUndefined();
    expect((await loadConfig({ VITE_CESIUM_ION_TOKEN: "" })).cesiumIonToken).toBeUndefined();
  });

  it("is passed through when set", async () => {
    expect((await loadConfig({ VITE_CESIUM_ION_TOKEN: "tok" })).cesiumIonToken).toBe("tok");
  });
});

describe("WASM URLs per runtime base (BASE_URL)", () => {
  const files = {
    standalone: "wasm/standalone/mock/standalone_navigation_data_interface.wasm",
    standalone_remote: "wasm/standalone/remote/standalone_navigation_data_interface.wasm",
    msfs: "wasm/msfs-2020/msfs_navigation_data_interface.wasm",
  };

  it.each([
    ["web dev server", "/"],
    ["GitHub Pages project site", "/cesium3d-geovis/"],
    ["Electron (file://)", "./"],
  ])("resolves under the %s base %j", async (_label, base) => {
    const config = await loadConfig({ BASE_URL: base });
    expect(config.wasm).toEqual({
      standalone: `${base}${files.standalone}`,
      standalone_remote: `${base}${files.standalone_remote}`,
      msfs: `${base}${files.msfs}`,
    });
  });

  it.each(["/", "/cesium3d-geovis/", "./"])("resolves the aircraft model under the base %j", async (base) => {
    const config = await loadConfig({ BASE_URL: base });
    expect(config.aircraftModel).toBe(`${base}models/CesiumAir/Cesium_Air.glb`);
  });

  it("does not define a WASM URL for the api transport", async () => {
    expect(Object.keys((await loadConfig({})).wasm)).not.toContain("api");
  });
});

describe("telemetry GraphQL endpoint (VITE_TELEMETRY_GRAPHQL_URL)", () => {
  it("goes through the dev proxy on the dev server", async () => {
    expect((await loadConfig({ DEV: true })).telemetry).toEqual({
      source: "api",
      graphqlUrl: "/telemetry-api/graphql",
      proxied: true,
      devTokenUrl: "/__telemetry-dev-token",
      wakeUrls: [],
    });
  });

  it("calls the hosted API directly in builds", async () => {
    expect((await loadConfig({ DEV: false })).telemetry).toEqual({
      source: "api",
      graphqlUrl: "https://aviation-api-5f6p.onrender.com/graphql",
      proxied: false,
      wakeUrls: [],
    });
  });

  it("never uses the dev token endpoint in builds", async () => {
    const config = await loadConfig({ DEV: false, VITE_TELEMETRY_GRAPHQL_URL: "/telemetry-api/graphql" });
    expect(config.telemetry).toEqual({ source: "api", graphqlUrl: "/telemetry-api/graphql", proxied: false, wakeUrls: [] });
  });

  it("uses the configured endpoint", async () => {
    const config = await loadConfig({ DEV: false, VITE_TELEMETRY_GRAPHQL_URL: "https://t.example.com/graphql" });
    expect(config.telemetry).toEqual({ source: "api", graphqlUrl: "https://t.example.com/graphql", proxied: false, wakeUrls: [] });
  });

  it("reads extra wake-up URLs, comma-separated", async () => {
    const config = await loadConfig({ VITE_TELEMETRY_WAKE_URLS: " https://a.test/health, ,https://b.test/health " });
    expect(config.telemetry.wakeUrls).toEqual(["https://a.test/health", "https://b.test/health"]);
  });

  it.each([
    ["sample", "sample"],
    ["api", "api"],
    ["mock", "api"],
  ])("starts with VITE_TELEMETRY_SOURCE=%s as %s", async (value, expected) => {
    expect((await loadConfig({ VITE_TELEMETRY_SOURCE: value })).telemetry.source).toBe(expected);
  });
});

describe("toWebSocketUrl", () => {
  it.each([
    ["https://api.example.com/graphql", undefined, "wss://api.example.com/graphql"],
    ["http://localhost:8000/graphql", undefined, "ws://localhost:8000/graphql"],
    ["/telemetry-api/graphql", "http://localhost:5173/#/flight-telemetry", "ws://localhost:5173/telemetry-api/graphql"],
    ["/telemetry-api/graphql", "https://me.github.io/app/", "wss://me.github.io/telemetry-api/graphql"],
  ])("%s from %s → %s", (url, base, expected) => {
    expect(toWebSocketUrl(url, base)).toBe(expected);
  });
});
