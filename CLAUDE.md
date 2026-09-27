## Overview
This project implements a geo spatial visualization app using CesiumJS and more specifically using Resium
, a React variant of CesiumJS. This project has two runtime targets: web runtime - to be deployed to githubpages and electron app - to be built and released as artifact. Wasm binaries can target two different modes: local and navigraph, both providers are included. Additionally, a third option to target remote servers. It should be possible for ci/cd pipelines to target static build for githubpages (web runtime) and electron build for release artifacts (electron app). 


Here are some ground rules for various configurations:

Runtime
-------
web
electron

Transport
---------
standalone
msfs
api

Overview
---------
React + Resium/Cesium
        │
        ▼
NavigationDataInterface
        │
        ▼
NavigationService
        │
        ▼
Transport
   ┌────┼─────┐
   │    │     │
   ▼    ▼     ▼
Standalone  MSFS  API
   │        │     │
   ▼        ▼     ▼
standalone  msfs  HTTP
.wasm       .wasm backend

Suggested layout (not very strict)
---------
cesium3d-geovis/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   └── routes.tsx
│   │
│   ├── components/
│   │   ├── CesiumMap/
│   │   ├── FlightPanel/
│   │   └── NavigationPanel/
│   │
│   ├── navigation/
│   │   ├── NavigationDataInterface.ts
│   │   ├── WasmLoader.ts
│   │   ├── types.ts
│   │   └── transports/
│   │       ├── StandaloneTransport.ts
│   │       ├── MsfsTransport.ts
│   │       └── ApiTransport.ts
│   │
│   ├── api/
│   │   ├── client.ts
│   │   └── navigationApi.ts
│   │
│   ├── services/
│   │   └── NavigationService.ts
│   │
│   ├── runtime/
│   │   ├── runtime.ts
│   │   ├── web.ts
│   │   └── electron.ts
│   │
│   ├── config/
│   │   └── appConfig.ts
│   │
│   ├── main.tsx
│   └── vite-env.d.ts
│
├── public/
│   └── wasm/
│       ├── msfs-2020/
│       │   └── msfs_navigation_data_interface.wasm
│       ├── standalone/
│           ├── mock
│           │   └── standalone_navigation_data_interface.wasm
│           └── remote
│               └── standalone_navigation_data_interface.wasm
│
├── electron/
│   ├── main.ts
│   └── preload.ts
│
├── .github/
│   └── workflows/
│       ├── deploy-web.yml
│       └── release-electron.yml
│
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── forge.config.ts
└── README.md

## Technologies Used
- TypeScript
- Electron
- Electron Forge for packaging/distribution

## Development Process
1. Before implementing, use DeepWiki's Ask Question tool to get latest information so that you write the code as per the latest library updates.



