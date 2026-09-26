export class WasmLoadError extends Error {}

async function fetchBytes(url: string): Promise<Response> {
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
  return response;
}

/**
 * Fetches and compiles a navigation WASM module.
 * Falls back to ArrayBuffer compilation when the server does not
 * serve `application/wasm` (e.g. file:// in Electron).
 */
export async function compileWasm(url: string): Promise<WebAssembly.Module> {
  const response = await fetchBytes(url);
  if (
    typeof WebAssembly.compileStreaming === "function" &&
    response.headers.get("content-type")?.includes("application/wasm")
  ) {
    return WebAssembly.compileStreaming(response);
  }
  return WebAssembly.compile(await response.arrayBuffer());
}

/** Fetches, compiles and instantiates a WASM module with the given imports. */
export async function loadWasm(
  url: string,
  imports: WebAssembly.Imports = {},
): Promise<WebAssembly.Instance> {
  return WebAssembly.instantiate(await compileWasm(url), imports);
}
