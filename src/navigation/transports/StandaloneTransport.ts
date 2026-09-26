import { WasmTransport } from "./WasmTransport";

/** Local navigation data via navigation-standalone.wasm. */
export class StandaloneTransport extends WasmTransport {
  readonly kind = "standalone" as const;
}
