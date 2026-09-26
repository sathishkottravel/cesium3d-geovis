import { loadWasm } from "../WasmLoader";
import type { Airport, Coordinates, NavigationTransport, TransportKind, Waypoint } from "../types";

/**
 * Generic WASM transport, used by the msfs transport. The msfs-2020 build is an
 * MSFS gauge module that imports MSFS SDK functions (fsCommBus*, fsNetwork*),
 * which are not provided here yet, so connect() fails with a LinkError.
 */
export abstract class WasmTransport implements NavigationTransport {
  abstract readonly kind: TransportKind;
  protected instance: WebAssembly.Instance | null = null;

  constructor(private readonly wasmUrl: string) {}

  async connect(): Promise<void> {
    this.instance = await loadWasm(this.wasmUrl);
  }

  async disconnect(): Promise<void> {
    this.instance = null;
  }

  async getAirport(_ident: string): Promise<Airport | null> {
    this.ensureConnected();
    throw new Error(`${this.kind}: getAirport is not implemented yet`);
  }

  async searchWaypoints(_query: string, _near?: Coordinates): Promise<Waypoint[]> {
    this.ensureConnected();
    throw new Error(`${this.kind}: searchWaypoints is not implemented yet`);
  }

  protected ensureConnected(): void {
    if (!this.instance) throw new Error(`${this.kind} transport is not connected`);
  }
}
