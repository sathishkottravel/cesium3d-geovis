import { readFile } from "node:fs/promises";
import path from "node:path";
import { vi } from "vitest";

export const projectRoot = path.resolve(import.meta.dirname, "..");

/** Builds a fetch Response with a JSON body. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Smallest valid WASM module (magic + version, no sections). */
export const EMPTY_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

/**
 * Stubs global fetch so that `<base>wasm/...` URLs are served from public/,
 * mimicking the Vite dev server / static host. Other URLs go to `fallback`.
 */
export function servePublicDir(
  fallback: (url: string) => Response | Promise<Response> = () => new Response(null, { status: 404 }),
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const match = /(?:^|\/)(wasm\/.+\.wasm)$/.exec(url);
    if (!match) return fallback(url);
    try {
      const bytes = await readFile(path.join(projectRoot, "public", match[1]));
      return new Response(bytes, { headers: { "content-type": "application/wasm" } });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
