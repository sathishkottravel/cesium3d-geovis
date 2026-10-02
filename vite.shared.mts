import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin, type PluginOption, type ProxyOptions, type UserConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const DEFAULT_TELEMETRY_API_ORIGIN = "https://aviation-api-5f6p.onrender.com";
const TELEMETRY_PROXY_PATH = "/telemetry-api";
/** Dev server only: hands the subscription socket its token (see telemetryDevToken). */
export const TELEMETRY_DEV_TOKEN_PATH = "/__telemetry-dev-token";

/** Where the dev proxy sends telemetry requests: TELEMETRY_API_ORIGIN (e.g. a local backend), else the hosted API. */
function telemetryOrigin(mode: string): string {
  return loadEnv(mode, process.cwd(), "").TELEMETRY_API_ORIGIN || DEFAULT_TELEMETRY_API_ORIGIN;
}

/**
 * The telemetry API token for local development. It has no VITE_ prefix and is read here, in Node,
 * from .env / .env.local, so it is never compiled into a bundle.
 */
function telemetryToken(mode: string): string | undefined {
  const env = loadEnv(mode, process.cwd(), "");
  if (env.TELEMETRY_API_TOKEN) return env.TELEMETRY_API_TOKEN;
  if (env.VITE_TELEMETRY_API_TOKEN) {
    console.warn(
      "[telemetry-proxy] Rename VITE_TELEMETRY_API_TOKEN to TELEMETRY_API_TOKEN: VITE_ variables are exposed to client code.",
    );
    return env.VITE_TELEMETRY_API_TOKEN;
  }
  return undefined;
}

/**
 * Dev-server proxy for the telemetry API (src/config/appConfig.ts points there in dev). It avoids the
 * API's CORS preflight and adds the token to HTTP requests, so queries and mutations need no token in
 * the browser.
 */
function telemetryProxy(target: string, token: string | undefined): Record<string, ProxyOptions> {
  return {
    [TELEMETRY_PROXY_PATH]: {
      target,
      changeOrigin: true,
      ws: true,
      rewrite: (path) => path.slice(TELEMETRY_PROXY_PATH.length),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  };
}

/**
 * The API authenticates subscriptions only from the graphql-ws `connection_init` payload (the upgrade's
 * Authorization header is ignored), so the socket must send the token itself. In `vite` dev only, this
 * serves it to loopback clients; builds never contain it.
 */
function telemetryDevToken(token: string | undefined): Plugin {
  return {
    name: "telemetry-dev-token",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(TELEMETRY_DEV_TOKEN_PATH, (req, res) => {
        const remote = req.socket.remoteAddress ?? "";
        const loopback = remote === "::1" || remote === "::ffff:127.0.0.1" || remote.startsWith("127.");
        res.setHeader("Cache-Control", "no-store");
        res.statusCode = loopback && token ? 200 : 404;
        res.end(loopback && token ? token : "");
      });
    },
  };
}

const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumDest = "cesium";

/**
 * Shared renderer config for both the web build and the Electron renderer.
 * Cesium's static assets (workers, widgets, etc.) are copied to `<base>/cesium`;
 * src/cesiumSetup.ts points CESIUM_BASE_URL at them at runtime.
 */
export function sharedRendererConfig(base: string, mode = "development"): UserConfig {
  const token = telemetryToken(mode);
  const plugins: PluginOption[] = [
    react(),
    telemetryDevToken(token),
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
    server: { proxy: telemetryProxy(telemetryOrigin(mode), token) },
  };
}
