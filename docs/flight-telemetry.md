# Flight telemetry

The second page of the app, at `#/flight-telemetry` ([live](https://sathishkottravel.github.io/cesium3d-geovis/#/flight-telemetry)), shows live aircraft from the [Aviation Telemetry](https://github.com/sathishkottravel/aviation-telemetry-service) GraphQL API (`https://aviation-api-5f6p.onrender.com/graphql`).

[← Back to the README](../README.md) · [Development guide](development.md)

## Using the page

- **Area:** enter a latitude, longitude and radius, then click **Find aircraft**. The default is London Heathrow, 40 nm. Aircraft appear as 3D models with callsign labels inside the area circle. With **Auto-refresh** on, positions update every 15 s.
- **Tracking:** tick aircraft in the list and/or type extra flight IDs (`*` = everything in the area), then click **Track**. IDs can be an ICAO hex or a callsign. Tracked aircraft are drawn in orange. **Stop** ends tracking.
- **Data source:** **Data** switches between the live API and **Sample data (offline)**.
- **Connection:** the GraphQL URL and the API token. It opens by itself when a token is needed.

## How it works

| Step | GraphQL operation |
| --- | --- |
| Find aircraft (and every 15 s with Auto-refresh) | `trackableAircraft(latitude, longitude, radiusNm)` |
| Track | `startTracking`, then `flight` + `telemetryHistory` to backfill the last 30 min of the trail |
| Live positions | `liveTelemetry` subscription (graphql-ws) |
| Status (every 10 s) | `trackingStatus` |
| Stop | `stopTracking` |

- **Callsigns:** `liveTelemetry` matches ICAO hex only, so a callsign's live updates start once the server reports its ICAO hex in the tracking status.
- **Polled area:** `startTracking` with an area moves the producer's single polled area for every tracked aircraft.
- **Silent flights:** flights silent for 5 minutes drop off the map, as they do on the server.
- **Cold start:** the API and its ADS-B producer sleep when idle and take about a minute to wake. On load, the page sends a warm-up request to the API and pings every URL in `VITE_TELEMETRY_WAKE_URLS` (comma-separated, no auth). Requests that fail the way a waking server does (network error, timeout, 502/503/504, "producer unavailable") are retried with backoff for up to 90 s. Meanwhile the panel shows *Waking up server… N s, attempt K*. A 401 isn't retried.
- **Smooth motion:** between updates, each aircraft keeps moving along its reported track at its reported ground speed (dead reckoning, up to 30 s after its last report). A new report is blended in over 1.5 s instead of making the aircraft jump. The trail stays attached to the drawn model.
- **Sample data:** pick *Sample data (offline)* under **Data**, or set `VITE_TELEMETRY_SOURCE=sample`. It needs no network or token. The same operations are answered in-process from 25 aircraft recorded from the API. Each aircraft keeps its recorded distance from the searched area and flies a smooth loop. Like the API, the subscription sends the latest position on subscribe and then periodically: one flight for an ICAO hex, or every tracked flight for `*`.

### Code map

| File | Role |
| --- | --- |
| `src/telemetry/operations.ts` | the GraphQL operations and their types |
| `src/telemetry/graphqlClient.ts` | HTTP + `graphql-ws` client with cold-start retries |
| `src/telemetry/useTelemetry.ts` | page state: search, tracking, subscriptions, polling |
| `src/telemetry/motion.ts` | smooth motion between updates |
| `src/telemetry/mock/` | sample data server and the recorded aircraft |
| `src/components/TelemetryPanel/`, `src/components/CesiumMap/TelemetryMap.tsx` | the side panel and the map |

## API token

The API expects `Authorization: Bearer <token>`. A real token is never compiled into a bundle, because any `VITE_*` value is public once deployed.

| Where | Token source |
| --- | --- |
| `bun run dev` / `electron:start` | `TELEMETRY_API_TOKEN` in `.env.local` (no `VITE_` prefix). The Vite dev proxy `/telemetry-api` adds it to queries and mutations. Subscriptions are different: the API reads the token only from the graphql-ws `connection_init` payload, so the dev server also serves it to loopback clients at `/__telemetry-dev-token`. |
| GitHub Pages build | Viewing needs no token when the API runs with `PUBLIC_READ=true`. To start or stop tracking, the user pastes a token under **Connection**. It's kept in `sessionStorage`, or in `localStorage` with **Remember on this device**, where any script on the page could read it; a static site has nothing safer. **Forget token** clears it. |
| Packaged Electron app | The same, but **Remember on this device** keeps the token encrypted by the OS keychain (Electron `safeStorage`, in `<userData>/telemetry-token.bin`), never in `localStorage`. Without a keychain (Linux with no keyring), the token is kept for the session only. |
| CI | Never. GitHub Secrets keep a value safe in CI, but a secret passed to a `VITE_*` variable is compiled into the published bundle. |

When the API rejects the token, the page opens **Connection** and asks for a new one. This also happens when a public API refuses a mutation with "API token required to start or stop tracking".

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_TELEMETRY_SOURCE` | build | `api` (default) or `sample` |
| `VITE_TELEMETRY_GRAPHQL_URL` | build | GraphQL endpoint. Default: `/telemetry-api/graphql` (the dev proxy) in development, the hosted API in builds |
| `VITE_TELEMETRY_WAKE_URLS` | build | comma-separated health URLs pinged when the page opens |
| `TELEMETRY_API_TOKEN` | `.env.local`, dev server only | token the dev proxy adds; never reaches the browser bundle |
| `TELEMETRY_API_ORIGIN` | `.env.local`, dev server only | backend the dev proxy forwards to, e.g. `http://localhost:8000`. Default: the hosted API |

To use a local backend in development, set `TELEMETRY_API_ORIGIN=http://localhost:8000` in `.env.local`. The dev proxy then forwards `/telemetry-api` there. A local API answers CORS pre-checks with 405, so going through the proxy is required there too.

## Live deployment checklist

- GitHub → Settings → Secrets and variables → Actions → **Variables**: `VITE_TELEMETRY_WAKE_URLS` (comma-separated health URLs, see `.env.example`). Both workflows pass it to the build.
- API (Render dashboard or the VM's `.env`): `PUBLIC_READ=true` and `CORS_ORIGINS=https://sathishkottravel.github.io,null`. `null` is the origin of the packaged Electron app's `file://` pages. See the API's README, *Authentication*.

> **CORS:** browsers on other origins (GitHub Pages, the packaged app's `file://`) can call the API only when it lists them in `CORS_ORIGINS`. Without that, it answers the browser's preflight (`OPTIONS`) with 401. The dev proxy sidesteps this locally.
