# Cesium3D GeoVis

A 3D globe for exploring flights, built with [CesiumJS](https://cesium.com/platform/cesiumjs/) and React ([Resium](https://resium.reearth.io/)). It runs in the browser and as a desktop app.

| Page | What it shows | Open it |
| --- | --- | --- |
| **Route planner** | Plan a flight between two airports and watch it fly in 3D | https://sathishkottravel.github.io/cesium3d-geovis/ |
| **Flight telemetry** | Live aircraft around any location, updated in real time | https://sathishkottravel.github.io/cesium3d-geovis/#/flight-telemetry |

Switch between the two with the buttons at the top of the page.

![Cesium3D GeoVis web app animating a flight from Cancún (MMUN) to Guatemala City (MGGT) with the mock data: the 3D aircraft climbing through 8,280 ft over the Riviera Maya coast, with its orange trail, the white route line and the flight controls in the side panel](docs/flight_riviera_maya.png)

*A flight from Cancún (MMUN) to Guatemala City (MGGT), climbing over the Riviera Maya coast.*

## Route planner

Type a departure and an arrival airport and press **Start**. The aircraft takes off, climbs to cruise and lands, in real time or sped up to 600×. You can pause, restart, or let the camera follow the aircraft.

It works offline with built-in sample airports in Mexico and Central America. Try `MMUN` → `MGGT`, `MGGT` → `MSLP` or `MSLP` → `MMUN`. It can also use real navigation data from a server.

## Flight telemetry

Enter a latitude, longitude and radius, then press **Find aircraft**. Every aircraft in that area appears as a 3D model with its callsign, and positions refresh every 15 seconds. Pick aircraft (or type a flight ID or callsign) and press **Track** to get live updates; tracked aircraft turn orange. Aircraft glide smoothly between updates and leave a trail.

- **No account needed to look:** viewing is open. Starting and stopping tracking needs an API token, which you paste into the page.
- **First load can take a minute:** the data servers sleep when unused. The page wakes them up and shows the progress.
- **Offline demo:** choose **Data → Sample data (offline)** to try the page with recorded traffic, no network needed.

Data comes from the [Aviation Telemetry API](https://github.com/sathishkottravel/aviation-telemetry-service), which collects positions from [ADSB.lol](https://adsb.lol).

## Run it yourself

You need [Bun](https://bun.sh) (≥ 1.3) and Node.js LTS.

```bash
bun install
bun run dev              # http://localhost:5173 in your browser
bun run electron:start   # or as a desktop app
```

The flight-telemetry page is at http://localhost:5173/#/flight-telemetry. To use live data while developing, put your API token in `.env.local` as `TELEMETRY_API_TOKEN=...`. Copy `.env.example` to `.env.local` as a starting point.

Desktop installers for Windows, macOS and Linux are attached to each [GitHub Release](https://github.com/sathishkottravel/cesium3d-geovis/releases).

## How it fits together

```
          Browser (GitHub Pages)  ·  Desktop app (Electron)
                              │
              React + Resium / CesiumJS (3D globe)
                 ┌────────────┴─────────────┐
           Route planner              Flight telemetry
                 │                          │
       Navigation data              Aviation Telemetry API
  (built-in WASM database,          (GraphQL: area search,
   remote package, or HTTP API)      tracking, live updates)
```

## Documentation

- [Development guide](docs/development.md): architecture, configuration, the web and desktop builds, navigation data sources, CI/CD, scripts and project layout.
- [Flight telemetry](docs/flight-telemetry.md): how the telemetry page works, API tokens, sample data, and what to configure for a live deployment.
