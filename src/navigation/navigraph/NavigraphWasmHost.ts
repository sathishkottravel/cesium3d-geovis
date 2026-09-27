import { ConsoleStdout, OpenFile, File as WasiFile, WASI } from "@bjorn3/browser_wasi_shim";
import { compileWasm } from "../WasmLoader";
import type { NavigraphEvent, NavigraphFunctionResult } from "./types";

interface NavigraphExports {
  memory: WebAssembly.Memory;
  navigraph_alloc(len: number): number;
  navigraph_dealloc(ptr: number, len: number): void;
  navigraph_call_function(ptr: number, len: number): void;
  navigraph_update(): void;
  /** Only exported by the remote data build. */
  navigraph_fetch_complete?(requestId: number, ok: number, ptr: number, len: number): void;
}

interface PendingCall {
  resolve(data: unknown): void;
  reject(err: Error): void;
}

const UPDATE_INTERVAL_MS = 50;

/**
 * Hosts the standalone Navigraph navigation data interface WASM module.
 *
 * Protocol (mirrors the MSFS CommBus events):
 * - call: write `{ id, function, data }` JSON into module memory via
 *   `navigraph_alloc` and pass it to `navigraph_call_function(ptr, len)`
 * - reply: the module calls the `navigraph.send_message(namePtr, nameLen, dataPtr, dataLen)`
 *   import with `NAVIGRAPH_FunctionResult` (`{ id, status, data }`) or `NAVIGRAPH_Event`
 * - `navigraph_update()` must be pumped periodically to drive async work
 * - fetch (remote data build only): the module calls the `navigraph.fetch(requestId, urlPtr, urlLen)`
 *   import; the host fetches the URL and passes the body (`ok = 1`) or an error message (`ok = 0`)
 *   back through `navigraph_fetch_complete(requestId, ok, ptr, len)`
 */
export class NavigraphWasmHost {
  private readonly pending = new Map<string, PendingCall>();
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextId = 0;

  private constructor(private readonly exports: NavigraphExports) {}

  static async load(url: string, onEvent?: (event: NavigraphEvent) => void): Promise<NavigraphWasmHost> {
    const module = await compileWasm(url);
    const wasi = new WASI(
      [],
      [],
      [
        new OpenFile(new WasiFile([])),
        ConsoleStdout.lineBuffered((line) => console.log(`[navigraph] ${line}`)),
        ConsoleStdout.lineBuffered((line) => console.warn(`[navigraph] ${line}`)),
      ],
    );

    let host: NavigraphWasmHost | null = null;
    const instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasi.wasiImport,
      navigraph: {
        send_message: (namePtr: number, nameLen: number, dataPtr: number, dataLen: number) =>
          host?.handleMessage(namePtr, nameLen, dataPtr, dataLen, onEvent),
        fetch: (requestId: number, urlPtr: number, urlLen: number) => {
          // Copy the URL now: the module only guarantees the pointer for the duration of this call.
          if (host) void host.hostFetch(requestId, host.readString(urlPtr, urlLen));
        },
      },
    });
    wasi.initialize(instance as { exports: { memory: WebAssembly.Memory } });

    host = new NavigraphWasmHost(instance.exports as unknown as NavigraphExports);
    host.timer = setInterval(() => host?.exports.navigraph_update(), UPDATE_INTERVAL_MS);
    return host;
  }

  call<T>(fn: string, data: Record<string, unknown> = {}): Promise<T> {
    const id = `${fn}-${++this.nextId}`;
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (data: unknown) => void, reject });
    });

    const bytes = this.encoder.encode(JSON.stringify({ id, function: fn, data }));
    // The module takes ownership of the buffer.
    this.exports.navigraph_call_function(this.write(bytes), bytes.length);
    return promise;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const call of this.pending.values()) call.reject(new Error("Navigraph host disposed"));
    this.pending.clear();
  }

  private async hostFetch(requestId: number, url: string): Promise<void> {
    let ok = 1;
    let body: Uint8Array;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      body = new Uint8Array(await response.arrayBuffer());
    } catch (err) {
      ok = 0;
      body = this.encoder.encode(err instanceof Error ? err.message : String(err));
    }

    // The host may have been disposed while the fetch was in flight.
    if (!this.timer || !this.exports.navigraph_fetch_complete) return;
    // The module takes ownership of the buffer.
    this.exports.navigraph_fetch_complete(requestId, ok, this.write(body), body.length);
  }

  /** Copies bytes into a buffer allocated by the module and returns its pointer. */
  private write(bytes: Uint8Array): number {
    const ptr = this.exports.navigraph_alloc(bytes.length);
    new Uint8Array(this.exports.memory.buffer, ptr, bytes.length).set(bytes);
    return ptr;
  }

  private readString(ptr: number, len: number): string {
    return this.decoder.decode(new Uint8Array(this.exports.memory.buffer, ptr, len));
  }

  private handleMessage(
    namePtr: number,
    nameLen: number,
    dataPtr: number,
    dataLen: number,
    onEvent?: (event: NavigraphEvent) => void,
  ): void {
    const name = this.readString(namePtr, nameLen);
    const payload = JSON.parse(this.readString(dataPtr, dataLen));

    if (name === "NAVIGRAPH_FunctionResult") {
      const result = payload as NavigraphFunctionResult;
      const call = this.pending.get(result.id);
      if (!call) return;
      this.pending.delete(result.id);
      if (result.status === "Success") call.resolve(result.data);
      else call.reject(new Error(String(result.data)));
    } else if (name === "NAVIGRAPH_Event") {
      onEvent?.(payload as NavigraphEvent);
    }
  }
}
