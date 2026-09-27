import { describe, expect, it, vi } from "vitest";
import { compileWasm, loadWasm, WasmLoadError } from "../../../src/navigation/WasmLoader";
import { EMPTY_WASM } from "../../helpers";

const wasmResponse = (contentType?: string) =>
  new Response(EMPTY_WASM, { headers: contentType ? { "content-type": contentType } : {} });

describe("compileWasm", () => {
  it("streams when the server sends application/wasm (web dev / Pages)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => wasmResponse("application/wasm")));
    const streaming = vi.spyOn(WebAssembly, "compileStreaming");

    expect(await compileWasm("/wasm/a.wasm")).toBeInstanceOf(WebAssembly.Module);
    // (Node's compileStreaming calls WebAssembly.compile internally, so that spy is not checked here.)
    expect(streaming).toHaveBeenCalledWith(expect.any(Response));
  });

  it.each([undefined, "application/octet-stream"])(
    "falls back to ArrayBuffer compilation for content-type %j (Electron file://)",
    async (contentType) => {
      vi.stubGlobal("fetch", vi.fn(async () => wasmResponse(contentType)));
      const streaming = vi.spyOn(WebAssembly, "compileStreaming");
      const buffered = vi.spyOn(WebAssembly, "compile");

      expect(await compileWasm("./wasm/a.wasm")).toBeInstanceOf(WebAssembly.Module);
      expect(streaming).not.toHaveBeenCalled();
      expect(buffered).toHaveBeenCalledOnce();
    },
  );

  it("falls back when compileStreaming is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => wasmResponse("application/wasm")));
    const { Module } = WebAssembly;
    const compile = vi.fn(WebAssembly.compile);
    vi.stubGlobal("WebAssembly", { compile, compileStreaming: undefined });
    expect(await compileWasm("/wasm/a.wasm")).toBeInstanceOf(Module);
    expect(compile).toHaveBeenCalledWith(expect.any(ArrayBuffer));
  });

  it("throws WasmLoadError for HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const err = await compileWasm("/wasm/missing.wasm").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WasmLoadError);
    expect((err as Error).message).toMatch(/\/wasm\/missing\.wasm \(HTTP 404\)/);
  });

  it("throws WasmLoadError for network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(compileWasm("/wasm/a.wasm")).rejects.toThrow(WasmLoadError);
    await expect(compileWasm("/wasm/a.wasm")).rejects.toThrow(/Failed to fetch/);
  });
});

describe("loadWasm", () => {
  it("instantiates the compiled module", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => wasmResponse("application/wasm")));
    expect(await loadWasm("/wasm/a.wasm")).toBeInstanceOf(WebAssembly.Instance);
  });
});
