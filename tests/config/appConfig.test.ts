import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../src/config/appConfig";

// appConfig is evaluated once at import time from import.meta.env, so every
// case stubs the env, drops the module cache and re-imports it.
async function loadConfig(env: Record<string, string | undefined>): Promise<AppConfig> {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  return (await import("../../src/config/appConfig")).appConfig;
}

beforeEach(() => {
  // Keep a developer's local .env from leaking into the assertions.
  vi.stubEnv("VITE_TRANSPORT", undefined);
  vi.stubEnv("VITE_API_BASE_URL", undefined);
  vi.stubEnv("VITE_CESIUM_ION_TOKEN", undefined);
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
    expect((await loadConfig({})).apiBaseUrl).toBe("http://localhost:8787/api/v1");
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

  it("does not define a WASM URL for the api transport", async () => {
    expect(Object.keys((await loadConfig({})).wasm)).not.toContain("api");
  });
});
