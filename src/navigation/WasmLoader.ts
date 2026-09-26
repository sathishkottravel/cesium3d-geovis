export class WasmLoadError extends Error {}

/**
 * Loads and instantiates a navigation WASM module from a URL.
 * Falls back to ArrayBuffer instantiation when the server does not
 * serve `application/wasm` (e.g. file:// in Electron).
 */
export async function loadWasm(
  url: string,
  imports: WebAssembly.Imports = {},
): Promise<WebAssembly.Instance> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new WasmLoadError(`Failed to fetch WASM module at ${url}: ${String(err)}`);
  }
  if (!response.ok) {
    throw new WasmLoadError(
      `WASM module not found at ${url} (HTTP ${response.status}). See public/wasm/README.md.`,
    );
  }

  if (
    typeof WebAssembly.instantiateStreaming === "function" &&
    response.headers.get("content-type")?.includes("application/wasm")
  ) {
    const { instance } = await WebAssembly.instantiateStreaming(response, imports);
    return instance;
  }

  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), imports);
  return instance;
}
