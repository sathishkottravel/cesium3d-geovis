import { ConsoleStdout, OpenFile, File as WasiFile, WASI } from "@bjorn3/browser_wasi_shim";
import { compileWasm } from "../WasmLoader";
import type { NavigraphEvent, NavigraphFunctionResult } from "./types";

interface NavigraphExports {
  memory: WebAssembly.Memory;
  navigraph_alloc(len: number): number;
  navigraph_dealloc(ptr: number, len: number): void;
  navigraph_call_function(ptr: number, len: number): void;
  navigraph_update(): void;
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
    const ptr = this.exports.navigraph_alloc(bytes.length);
    new Uint8Array(this.exports.memory.buffer, ptr, bytes.length).set(bytes);
    this.exports.navigraph_call_function(ptr, bytes.length);
    return promise;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const call of this.pending.values()) call.reject(new Error("Navigraph host disposed"));
    this.pending.clear();
  }

  private handleMessage(
    namePtr: number,
    nameLen: number,
    dataPtr: number,
    dataLen: number,
    onEvent?: (event: NavigraphEvent) => void,
  ): void {
    const memory = this.exports.memory.buffer;
    const name = this.decoder.decode(new Uint8Array(memory, namePtr, nameLen));
    const payload = JSON.parse(this.decoder.decode(new Uint8Array(memory, dataPtr, dataLen)));

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
