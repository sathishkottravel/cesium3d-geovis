import { defineConfig } from "vite";
import { sharedRendererConfig } from "./vite.shared.mjs";

// Electron renderer. Forge merges this with its own renderer defaults;
// a relative base is required because the packaged app loads from file://.
export default defineConfig(sharedRendererConfig("./"));
