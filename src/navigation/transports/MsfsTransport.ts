import { WasmTransport } from "./WasmTransport";

/** Navigraph MSFS 2020 gauge module (wasm/msfs-2020/msfs_navigation_data_interface.wasm). */
export class MsfsTransport extends WasmTransport {
  readonly kind = "msfs" as const;
}
