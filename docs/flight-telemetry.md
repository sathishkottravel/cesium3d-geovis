# Flight telemetry

The second page of the app, at `#/flight-telemetry` ([live](https://sathishkottravel.github.io/cesium3d-geovis/#/flight-telemetry)), shows live aircraft from the [Aviation Telemetry](https://github.com/sathishkottravel/aviation-telemetry-service) GraphQL API (`https://aviation-api-5f6p.onrender.com/graphql`).

[← Back to the README](../README.md) · [Development guide](development.md)

## Using the page

- **Area:** enter a latitude, longitude and radius, then click **Find aircraft**. The default is London Heathrow, 40 nm. Aircraft appear as 3D models with callsign labels inside the area circle. With **Auto-refresh** on, positions update every 15 s.
- **Tracking:** tick aircraft in the list and/or type extra flight IDs (`*` = everything in the area), then click **Track**. IDs can be an ICAO hex or a callsign. Tracked aircraft are drawn in orange. **Stop** ends tracking.
- **Data source:** **Data** switches between **Live API** and **Sample data (offline)**. Published builds (GitHub Pages, the desktop app) start on sample data; `bun run dev` starts on the live API. The choice is remembered for the session.
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
- **Sample data:** the default in published builds; pick it under **Data**, or force a start source with `VITE_TELEMETRY_SOURCE=sample|api`. It needs no network or token. The same operations are answered in-process from 25 aircraft recorded from the API. Each aircraft keeps its recorded distance from the searched area and flies a smooth loop. Like the API, the subscription sends the latest position on subscribe and then periodically: one flight for an ICAO hex, or every tracked flight for `*`.

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
| GitHub Pages build | The page starts on sample data, which needs no token. For **Live API**, the user pastes a token under **Connection**. It's kept in `sessionStorage` (cleared when the tab closes), or in `localStorage` with **Remember on this device**, where any script on the page could read it; a static site has nothing safer. **Forget token** clears it. |
| Packaged Electron app | The same, but **Remember on this device** keeps the token encrypted by the OS keychain (Electron `safeStorage`, in `<userData>/telemetry-token.bin`), never in `localStorage`. Without a keychain (Linux with no keyring), the token is kept for the session only. |
| CI | Never. GitHub Secrets keep a value safe in CI, but a secret passed to a `VITE_*` variable is compiled into the published bundle. |

When the API rejects the token (or there is none), the page opens **Connection** and asks for one.

**Why not ship the token, even encrypted?** The browser has to decrypt it to use it, so the key ships too, and the token is visible in the request headers anyway. Anyone could then extract it, and the same `API_TOKEN` currently also guards the API's ingest endpoint. Short page sessions don't help either: the token itself is long-lived until rotated.

### Backend options for token-free live data
These are changes to the [Aviation Telemetry API](https://github.com/sathishkottravel/aviation-telemetry-service), outside this repo. The frontend works with the API as it is.

1. **Separate tokens by scope:** a low-risk view/track token, kept apart from the ingest and admin tokens, so a leaked frontend token can't write data.
2. **Short-lived tokens:** a login step (e.g. GitHub OAuth or a passcode) on the API mints tokens that expire after 15–60 minutes.
3. **Public read-only access:** queries and live updates open, start/stop tracking still behind a token. The frontend already handles a refused mutation ("API token required…") by asking for a token.
4. **A proxy that holds the token:** e.g. a Cloudflare Worker that forwards only this app's operations, with rate limits.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_TELEMETRY_SOURCE` | build | start source: `api` or `sample`. Default: `api` in `bun run dev`, `sample` in builds |
| `VITE_TELEMETRY_GRAPHQL_URL` | build | GraphQL endpoint. Default: `/telemetry-api/graphql` (the dev proxy) in development, the hosted API in builds |
| `VITE_TELEMETRY_WAKE_URLS` | build | comma-separated health URLs pinged when the page opens |
| `TELEMETRY_API_TOKEN` | `.env.local`, dev server only | token the dev proxy adds; never reaches the browser bundle |
| `TELEMETRY_API_ORIGIN` | `.env.local`, dev server only | backend the dev proxy forwards to, e.g. `http://localhost:8000`. Default: the hosted API |

To use a local backend in development, set `TELEMETRY_API_ORIGIN=http://localhost:8000` in `.env.local`. The dev proxy then forwards `/telemetry-api` there. A local API answers CORS pre-checks with 405, so going through the proxy is required there too.

## Live deployment checklist

- Optional, GitHub → Settings → Secrets and variables → Actions → **Variables**: `VITE_TELEMETRY_WAKE_URLS` (comma-separated health URLs, see `.env.example`). Both workflows pass it to the build; the page pings them when someone switches to **Live API**.
- Nothing else is needed for visitors: the page starts on sample data.
- For **Live API** from the published site, the API must allow the site's origin (CORS): `https://sathishkottravel.github.io`, and `null` for the packaged desktop app, whose `file://` pages send `Origin: null`. Without it, the browser's preflight (`OPTIONS`) is refused with 401. The dev proxy sidesteps this locally.
