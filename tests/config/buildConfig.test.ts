import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ConfigEnv, UserConfig, UserConfigFnObject } from "vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { projectRoot } from "../helpers";

const buildEnv: ConfigEnv = { command: "build", mode: "production" };

async function loadWebConfig(base: string | undefined): Promise<UserConfig> {
  vi.stubEnv("VITE_BASE", base);
  vi.resetModules();
  const factory = (await import("../../vite.config.mts")).default as UserConfigFnObject;
  return factory(buildEnv);
}

describe("web runtime build (vite.config.mts)", () => {
  it("uses / when VITE_BASE is unset", async () => {
    const config = await loadWebConfig(undefined);
    expect(config.base).toBe("/");
    expect(config.build?.outDir).toBe("dist");
  });

  it.each([
    ["/cesium3d-geovis/", "/cesium3d-geovis/"],
    ["/cesium3d-geovis", "/cesium3d-geovis/"],
  ])("normalizes GitHub Pages base %j to %j", async (input, expected) => {
    expect((await loadWebConfig(input)).base).toBe(expected);
  });
});

describe("electron runtime build", () => {
  let forge: ForgeConfig;

  // Loading the Forge makers is slow on a cold cache.
  beforeAll(async () => {
    forge = (await import("../../forge.config")).default;
  }, 60_000);

  it("renderer uses a relative base for file:// loading", async () => {
    const config = (await import("../../vite.renderer.config.mts")).default as UserConfig;
    expect(config.base).toBe("./");
  });

  it("forge wires main, preload and renderer entries that exist", async () => {
    const vitePlugin = forge.plugins?.find((p) => (p as { name?: string }).name === "vite") as
      | { config: { build: { entry: string; config: string }[]; renderer: { config: string }[] } }
      | undefined;
    expect(vitePlugin).toBeDefined();

    const { build, renderer } = vitePlugin!.config;
    const files = [
      ...build.flatMap((b) => [b.entry, b.config]),
      ...renderer.map((r) => r.config),
    ];
    expect(build.map((b) => b.entry)).toEqual(["electron/main.ts", "electron/preload.ts"]);
    for (const file of files) expect(existsSync(path.join(projectRoot, file)), file).toBe(true);
  });

  it("names the executable after package.json for the Linux makers", async () => {
    const pkg = (await import("../../package.json")).default;
    expect(forge.packagerConfig?.executableName).toBe(pkg.name);
  });
});

describe("shipped WASM binaries", () => {
  it("exist in public/ for every WASM transport in appConfig", async () => {
    vi.stubEnv("BASE_URL", "/");
    vi.resetModules();
    const { appConfig } = await import("../../src/config/appConfig");
    for (const [transport, url] of Object.entries(appConfig.wasm)) {
      expect(existsSync(path.join(projectRoot, "public", url)), `${transport}: ${url}`).toBe(true);
    }
  });
});

describe("shipped aircraft model", () => {
  it("exists in public/ as a binary glTF (GLB) file", async () => {
    vi.stubEnv("BASE_URL", "/");
    vi.resetModules();
    const { appConfig } = await import("../../src/config/appConfig");
    const file = path.join(projectRoot, "public", appConfig.aircraftModel);
    expect(existsSync(file), appConfig.aircraftModel).toBe(true);
    // GLB header: magic "glTF", then container version 2.
    const header = readFileSync(file).subarray(0, 8);
    expect(header.toString("latin1", 0, 4)).toBe("glTF");
    expect(header.readUInt32LE(4)).toBe(2);
  });

  it("is attributed in public/models/README.md", () => {
    const readme = readFileSync(path.join(projectRoot, "public/models/README.md"), "utf8");
    expect(readme).toContain("Cesium_Air.glb");
    expect(readme).toContain("Apache License 2.0");
  });
});
