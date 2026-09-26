import react from "@vitejs/plugin-react";
import type { PluginOption, UserConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumDest = "cesium";

/**
 * Shared renderer config for both the web build and the Electron renderer.
 * Cesium's static assets (workers, widgets, etc.) are copied to `<base>/cesium`;
 * src/cesiumSetup.ts points CESIUM_BASE_URL at them at runtime.
 */
export function sharedRendererConfig(base: string): UserConfig {
  const plugins: PluginOption[] = [
    react(),
    viteStaticCopy({
      targets: ["Workers", "ThirdParty", "Assets", "Widgets"].map((dir) => ({
        src: `${cesiumSource}/${dir}`,
        dest: cesiumDest,
        // Drop the "node_modules/cesium/Build/Cesium" prefix from the output path.
        rename: { stripBase: cesiumSource.split("/").length },
      })),
    }),
  ];

  return {
    base,
    plugins,
  };
}
