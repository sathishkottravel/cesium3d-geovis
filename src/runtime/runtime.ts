import { electronRuntime } from "./electron";
import { webRuntime } from "./web";

export type RuntimeKind = "web" | "electron";

export interface Runtime {
  kind: RuntimeKind;
  /** Human-readable platform description for diagnostics. */
  describe(): string;
}

export function getRuntime(): Runtime {
  return window.electronAPI?.isElectron ? electronRuntime : webRuntime;
}
