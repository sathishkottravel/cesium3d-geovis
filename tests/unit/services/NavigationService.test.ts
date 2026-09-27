import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../../src/config/appConfig";
import { ApiTransport } from "../../../src/navigation/transports/ApiTransport";
import { MsfsTransport } from "../../../src/navigation/transports/MsfsTransport";
import { StandaloneTransport } from "../../../src/navigation/transports/StandaloneTransport";
import type { TransportKind } from "../../../src/navigation/types";
import { createTransport } from "../../../src/services/NavigationService";
import { jsonResponse } from "../../helpers";

function config(transport: TransportKind): AppConfig {
  return {
    transport,
    apiBaseUrl: "https://nav.example.com/api/v1",
    wasm: {
      standalone: "/wasm/mock.wasm",
      standalone_remote: "/wasm/remote.wasm",
      msfs: "/wasm/msfs.wasm",
    },
  };
}

describe("createTransport", () => {
  it.each([
    ["standalone", StandaloneTransport],
    ["standalone_remote", StandaloneTransport],
    ["msfs", MsfsTransport],
    ["api", ApiTransport],
  ] as const)("builds a %s transport", (kind, Class) => {
    const transport = createTransport(config(kind));
    expect(transport).toBeInstanceOf(Class);
    expect(transport.kind).toBe(kind);
  });

  it.each([
    ["standalone", "/wasm/mock.wasm"],
    ["standalone_remote", "/wasm/remote.wasm"],
    ["msfs", "/wasm/msfs.wasm"],
  ] as const)("points the %s transport at its own WASM binary", async (kind, wasmUrl) => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createTransport(config(kind)).connect()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledWith(wasmUrl);
  });

  it("points the api transport at the configured backend", async () => {
    const fetchMock = vi.fn(async (_url: URL) => jsonResponse({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    await createTransport(config("api")).connect();
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://nav.example.com/api/v1/health");
  });
});

describe("getNavigationService", () => {
  it("returns a single instance using the configured transport", async () => {
    vi.stubEnv("VITE_TRANSPORT", "api");
    vi.resetModules();
    const { getNavigationService } = await import("../../../src/services/NavigationService");
    const service = getNavigationService();
    expect(service).toBe(getNavigationService());
    expect(service.transportKind).toBe("api");
    expect(service.connectionState).toBe("disconnected");
  });
});
