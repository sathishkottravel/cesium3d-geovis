import { defineConfig } from "vite";
import { sharedRendererConfig } from "./vite.shared.mjs";

// Web runtime (dev server + static build for GitHub Pages).
// Set VITE_BASE=/<repo-name>/ when deploying to a GitHub Pages project site.
export default defineConfig(() => {
  const base = process.env.VITE_BASE ?? "/";
  return {
    ...sharedRendererConfig(base.endsWith("/") ? base : `${base}/`),
    build: { outDir: "dist" },
  };
});
