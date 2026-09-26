# Cesium3D GeoVis

Geospatial visualization app built with [CesiumJS](https://cesium.com/platform/cesiumjs/) through [Resium](https://resium.reearth.io/), the React bindings for Cesium. It builds for two runtimes from one codebase:

- **web**: a static site deployed to GitHub Pages
- **electron**: a desktop app packaged with Electron Forge and published as release artifacts

Navigation data comes through one of three **transports**, chosen at build time:

| Transport | Backed by | Needs |
| --- | --- | --- |
| `standalone` (default) | `public/wasm/navigation-standalone.wasm` | the WASM binary |
| `msfs` | `public/wasm/navigation-msfs.wasm` (Navigraph / MSFS) | the WASM binary |
| `api` | remote HTTP backend | `VITE_API_BASE_URL` |

## Architecture

```
React + Resium/Cesium            src/components, src/app
        │
        ▼
NavigationDataInterface          src/navigation/NavigationDataInterface.ts
        │
        ▼
NavigationService                src/services/NavigationService.ts  (picks the transport)
        │
        ▼
Transport                        src/navigation/transports/*
   ┌────┼──────────┐
   ▼    ▼          ▼
Standalone  MSFS   API
   │        │      │
   ▼        ▼      ▼
standalone  msfs   HTTP backend
.wasm       .wasm  (src/api)
```

The runtime (`web` or `electron`) is detected at startup in `src/runtime/runtime.ts`. The Electron preload script exposes `window.electronAPI`, and the web build has no such object.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3, used as the package manager and script runner:
  `curl -fsSL https://bun.sh/install | bash` (or `npm install -g bun`)
- Node.js LTS, which Electron Forge runs on

## Quick start

```bash
bun install
cp .env.example .env.local   # optional, edit as needed
bun run dev                  # web runtime at http://localhost:5173
```

## Configuration

Settings are Vite env variables. They are fixed at build time, so rebuild after you change them. Set them in `.env.local` or inline on the command line.

| Variable | Values | Default | Used by |
| --- | --- | --- | --- |
| `VITE_TRANSPORT` | `standalone` \| `msfs` \| `api` | `standalone` | both runtimes |
| `VITE_API_BASE_URL` | URL | `http://localhost:8787/api/v1` | `api` transport |
| `VITE_CESIUM_ION_TOKEN` | Cesium ion token | none | optional; enables ion terrain/imagery |
| `VITE_BASE` | public path, e.g. `/cesium3d-geovis/` | `/` | web build only |

### Runtime × transport matrix

| Runtime | Transport | Develop | Build |
| --- | --- | --- | --- |
| web | standalone | `bun run dev` | `bun run build:web` |
| web | msfs | `VITE_TRANSPORT=msfs bun run dev` | `VITE_TRANSPORT=msfs bun run build:web` |
| web | api | `VITE_TRANSPORT=api VITE_API_BASE_URL=https://host/api/v1 bun run dev` | same vars + `bun run build:web` |
| electron | standalone | `bun run electron:start` | `bun run electron:make` |
| electron | msfs | `VITE_TRANSPORT=msfs bun run electron:start` | `VITE_TRANSPORT=msfs bun run electron:make` |
| electron | api | `VITE_TRANSPORT=api VITE_API_BASE_URL=https://host/api/v1 bun run electron:start` | same vars + `bun run electron:make` |

## Web runtime

```bash
bun run dev                                     # dev server with HMR
VITE_BASE=/cesium3d-geovis/ bun run build:web   # static build into dist/
VITE_BASE=/cesium3d-geovis/ bun run preview     # serve dist/ locally
```

`VITE_BASE` must match the path the site is served from. A GitHub Pages project site uses `/<repo-name>/`, and a custom domain or user site uses `/`. The CI workflow sets it for you.

Cesium's static assets (workers, widgets, third-party code) are copied to `<base>/cesium/` by `vite-plugin-static-copy` (see `vite.shared.mts`). `src/cesiumSetup.ts` points `CESIUM_BASE_URL` at them.

## Electron runtime

```bash
bun run electron:start     # dev: Vite dev server + Electron window with HMR
bun run electron:package   # packaged app in out/<name>-<platform>-<arch>/
bun run electron:make      # installers/archives in out/make/
```

Makers are configured in `forge.config.ts`:

| Platform | Maker | Output |
| --- | --- | --- |
| macOS | ZIP | `.zip` |
| Windows | Squirrel | `Setup.exe` + `.nupkg` |
| Linux | Deb, RPM | `.deb`, `.rpm` (needs `dpkg`/`fakeroot` and `rpm`) |

A maker only builds for the host OS, so each platform's artifacts come from the CI matrix.

Electron files:

- `electron/main.ts`: creates the window and loads the Vite dev server URL in development or the bundled `index.html` when packaged
- `electron/preload.ts`: exposes the small `window.electronAPI` bridge (context isolation on, Node integration off)
- `vite.main.config.mts`, `vite.preload.config.mts`, `vite.renderer.config.mts`: per-target Vite configs merged with Forge's defaults. The renderer shares `vite.shared.mts` with the web build.

## Transports

### Standalone and MSFS (WASM)

Put the compiled binaries in `public/wasm/`:

```
public/wasm/navigation-standalone.wasm
public/wasm/navigation-msfs.wasm
```

Both builds serve them from `<base>/wasm/`. `src/navigation/WasmLoader.ts` streams the module when the server sends `application/wasm`, and otherwise falls back to `ArrayBuffer` instantiation (needed for Electron's `file://`). Until the real binaries are in place, the UI shows a "WASM module not found" message. The data methods in `src/navigation/transports/WasmTransport.ts` are stubs, waiting for the module's exported bindings.

### API

Set `VITE_TRANSPORT=api` and `VITE_API_BASE_URL`. The client in `src/api/navigationApi.ts` expects:

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | any 2xx |
| GET | `/airports/:ident` | `Airport` JSON, or 404 |
| GET | `/waypoints?q=&lat=&lon=` | `Waypoint[]` JSON |

Types are in `src/navigation/types.ts`. For the web runtime, the backend must allow CORS from the Pages origin.

## CI/CD

| Workflow | Trigger | Result |
| --- | --- | --- |
| `.github/workflows/deploy-web.yml` | push to `main`, manual | builds with `VITE_BASE=/<repo>/` and deploys `dist/` to GitHub Pages |
| `.github/workflows/release-electron.yml` | tag `v*`, manual | runs `electron:make` on macOS, Windows and Linux; on tags, attaches the outputs to a GitHub Release |

One-time setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Optional repository **variables**: `VITE_TRANSPORT`, `VITE_API_BASE_URL`. Optional **secret**: `VITE_CESIUM_ION_TOKEN`.

To cut a release:

```bash
npm version patch            # or edit package.json version
git push --follow-tags       # pushes the vX.Y.Z tag and triggers release-electron.yml
```

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | web dev server |
| `bun run build:web` | type-check + static web build to `dist/` |
| `bun run preview` | serve `dist/` |
| `bun run typecheck` | `tsc -b` for app, Electron and config files |
| `bun run electron:start` | Electron in dev mode |
| `bun run electron:package` | package the Electron app for the host platform |
| `bun run electron:make` | build distributables for the host platform |

## Project layout

```
src/
  app/            App shell, routes, MapView
  components/     CesiumMap, FlightPanel, NavigationPanel
  navigation/     NavigationDataInterface, WasmLoader, types, transports/
  api/            HTTP client + navigation endpoints
  services/       NavigationService (transport factory)
  runtime/        web/electron runtime detection
  config/         appConfig (env → typed config)
  cesiumSetup.ts  CESIUM_BASE_URL
  main.tsx        entry point
electron/         main + preload
public/wasm/      navigation WASM binaries (placeholders)
.github/workflows deploy-web.yml, release-electron.yml
```
