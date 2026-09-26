import { WasmTransport } from "./WasmTransport";

/** Navigraph/MSFS navigation data via navigation-msfs.wasm. */
export class MsfsTransport extends WasmTransport {
  readonly kind = "msfs" as const;
}
