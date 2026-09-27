import { describe, expect, it, vi } from "vitest";
import { getRuntime } from "../../../src/runtime/runtime";

const chromeUA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

describe("getRuntime", () => {
  it("detects the web runtime when no Electron bridge is exposed", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { userAgent: chromeUA });
    const runtime = getRuntime();
    expect(runtime.kind).toBe("web");
    expect(runtime.describe()).toBe("Browser (Safari/537.36)");
  });

  it("detects the electron runtime from the preload bridge", () => {
    vi.stubGlobal("window", {
      electronAPI: {
        isElectron: true,
        platform: "win32",
        versions: { electron: "44.4.5", chrome: "140.0.0.0", node: "24.0.0" },
      },
    });
    const runtime = getRuntime();
    expect(runtime.kind).toBe("electron");
    expect(runtime.describe()).toBe("Electron 44.4.5 on win32");
  });

  it("does not treat a partial bridge as electron", () => {
    vi.stubGlobal("window", { electronAPI: { platform: "linux" } });
    expect(getRuntime().kind).toBe("web");
  });
});

describe("electron preload bridge", () => {
  it("exposes the shape the renderer expects", async () => {
    const exposeInMainWorld = vi.fn();
    vi.doMock("electron", () => ({ contextBridge: { exposeInMainWorld } }));
    vi.resetModules();
    await import("../../../electron/preload");

    expect(exposeInMainWorld).toHaveBeenCalledWith("electronAPI", {
      isElectron: true,
      platform: process.platform,
      versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
      },
    });
    vi.doUnmock("electron");
  });
});
