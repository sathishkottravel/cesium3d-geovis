import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appConfig } from "../config/appConfig";
import { GraphQLClient, SocketClosedError } from "./graphqlClient";
import { MockTelemetryServer } from "./mock/MockTelemetryServer";
import type { AreaQuery, TrackingStatus } from "./operations";
import { describeError, isUnauthorized, type RetryAttempt } from "./retry";
import { TelemetryApi } from "./telemetryApi";
import {
  browserStores,
  clearTelemetrySettings,
  loadTelemetrySettings,
  saveTelemetrySettings,
  type TelemetrySettings,
} from "./telemetrySettings";
import { fromArea, mergeTelemetry, withFlight, type Tracks } from "./telemetryState";

export const AREA_REFRESH_MS = 15_000;
export const STATUS_POLL_MS = 10_000;
/** Trail backfilled from history when tracking starts. */
const BACKFILL_MS = 30 * 60_000;

export type ServerState =
  | { state: "idle" }
  | { state: "waking"; since: number; attempt: number; message: string }
  | { state: "ready" }
  | { state: "unauthorized"; message: string }
  | { state: "error"; message: string };

export interface TrackedAircraft {
  /** Tracking was started here and not stopped: the live subscription and status poll run. */
  active: boolean;
  pending: boolean;
  status?: TrackingStatus;
  error?: string;
}

export interface AreaResult extends AreaQuery {
  fetchedAt: string;
  count: number;
}

export interface TelemetryControls {
  settings: TelemetrySettings;
  /** True when the dev proxy adds the token, so the panel needn't ask for one. */
  proxied: boolean;
  saveSettings(settings: TelemetrySettings): void;
  forgetToken(): void;
  server: ServerState;
  /** Warm-up request again (Retry button). */
  wake(): void;

  area: AreaQuery | null;
  areaResult: AreaResult | null;
  areaError: string | null;
  searching: boolean;
  /** Increments per search, so the map flies to the new area once. */
  searchId: number;
  search(area: AreaQuery): void;
  autoRefresh: boolean;
  setAutoRefresh(on: boolean): void;

  tracks: Tracks;
  tracked: Readonly<Record<string, TrackedAircraft>>;
  /** ICAO hex of every aircraft with a live subscription (or "*"). */
  liveIds: ReadonlySet<string>;
  track(ids: string[]): void;
  stop(ids: string[]): void;
}

const ICAO_HEX = /^[0-9a-f]{6}$/i;

/**
 * The id liveTelemetry knows a tracked aircraft by: its ICAO hex, lowercased, or "*". Tracking accepts
 * a callsign too; its hex comes with the tracking status, and is null until the server has resolved it.
 */
export function liveIdOf(id: string, tracked: TrackedAircraft | undefined): string | null {
  if (id === "*") return "*";
  const hex = tracked?.status?.icaoHex ?? (ICAO_HEX.test(id) ? id : null);
  return hex ? hex.toLowerCase() : null;
}

/** The dev server's token for the subscription socket; empty when it has none. */
async function fetchDevToken(): Promise<string> {
  const url = appConfig.telemetry.devTokenUrl;
  if (!url) return "";
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? (await response.text()).trim() : "";
  } catch {
    return "";
  }
}

/** State and actions of the flight telemetry page: area search, server-side tracking, live positions. */
export function useTelemetry(): TelemetryControls {
  const stores = useMemo(browserStores, []);
  const [settings, setSettings] = useState(() =>
    loadTelemetrySettings(stores, appConfig.telemetry.graphqlUrl, appConfig.telemetry.source),
  );
  const proxied = appConfig.telemetry.proxied && settings.graphqlUrl === appConfig.telemetry.graphqlUrl;
  const [server, setServer] = useState<ServerState>({ state: "idle" });

  const [area, setArea] = useState<AreaQuery | null>(null);
  const [areaResult, setAreaResult] = useState<AreaResult | null>(null);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchId, setSearchId] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [tracks, setTracks] = useState<Tracks>({});
  const [tracked, setTracked] = useState<Record<string, TrackedAircraft>>({});
  const activeIds = useMemo(
    () =>
      Object.entries(tracked)
        .filter(([, t]) => t.active)
        .map(([id]) => id)
        .sort(),
    [tracked],
  );
  const activeKey = activeIds.join(",");
  // liveTelemetry matches ICAO hex (or "*") only; a callsign subscribes once its status names the hex.
  const liveIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of activeIds) {
      const liveId = liveIdOf(id, tracked[id]);
      if (liveId) ids.add(liveId);
    }
    return ids;
  }, [activeIds, tracked]);
  const liveKey = [...liveIds].sort().join(",");
  // Read by the area refresh, which shouldn't restart when tracking changes.
  const activeRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    activeRef.current = liveIds;
  }, [liveIds]);

  const onRetry = useCallback(({ attempt, elapsedMs, lastError }: RetryAttempt) => {
    setServer((s) => ({
      state: "waking",
      since: s.state === "waking" ? s.since : Date.now() - elapsedMs,
      attempt,
      message: describeError(lastError),
    }));
  }, []);

  // A new source, URL or token means a new client (and socket); subscriptions below follow it.
  const { source, graphqlUrl, token } = settings;
  const client = useMemo(
    () =>
      source === "sample"
        ? new MockTelemetryServer()
        : new GraphQLClient(graphqlUrl, {
        getToken: () => token,
        socketToken: proxied ? fetchDevToken : undefined,
        onRetry,
        onSocket: (event) => {
          if (event === "connected") setServer({ state: "ready" });
        },
      }),
    [source, graphqlUrl, token, proxied, onRetry],
  );
  const api = useMemo(() => new TelemetryApi(client), [client]);
  useEffect(() => () => client.dispose(), [client]);

  /** Runs a request and reflects its outcome in the server state. */
  const call = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      const result = await fn();
      setServer({ state: "ready" });
      return result;
    } catch (error) {
      const message = describeError(error);
      if (isUnauthorized(error)) setServer({ state: "unauthorized", message });
      // The server answered, just not with what we asked for: it's awake.
      else setServer((s) => (s.state === "waking" ? { state: "error", message } : s));
      throw error;
    }
  }, []);

  const wake = useCallback(() => {
    setServer({ state: "idle" });
    call(() => client.health()).catch(() => {});
  }, [call, client]);
  // Start waking the server (cold start ≈ 1 min) as soon as the page opens.
  useEffect(wake, [wake]);

  // Each search supersedes earlier requests; a refresh tick is skipped while one is in flight.
  const areaRequest = useRef({ seq: 0, inFlight: false });
  const fetchArea = useCallback(
    async (query: AreaQuery, refresh = false) => {
      const request = areaRequest.current;
      if (refresh && request.inFlight) return;
      const seq = ++request.seq;
      request.inFlight = true;
      setSearching(true);
      try {
        const result = await call(() => api.findAircraft(query));
        if (seq !== request.seq) return;
        setTracks((current) => fromArea(current, result, activeRef.current));
        setAreaResult({
          latitude: result.latitude,
          longitude: result.longitude,
          radiusNm: result.radiusNm,
          fetchedAt: result.fetchedAt,
          count: result.aircraft.length,
        });
        setAreaError(null);
      } catch (error) {
        if (seq === request.seq) setAreaError(describeError(error));
      } finally {
        if (seq === request.seq) {
          request.inFlight = false;
          setSearching(false);
        }
      }
    },
    [api, call],
  );

  const search = useCallback(
    (query: AreaQuery) => {
      setArea(query);
      setSearchId((n) => n + 1);
      void fetchArea(query);
    },
    [fetchArea],
  );

  // Switching between the live API and sample data: nothing carries over, but keep the searched area.
  const [shownSource, setShownSource] = useState(source);
  useEffect(() => {
    if (source === shownSource) return;
    setShownSource(source);
    setTracks({});
    setTracked({});
    setAreaResult(null);
    setAreaError(null);
    if (area) void fetchArea(area);
  }, [source, shownSource, area, fetchArea]);

  // Periodic position update for everything in the area, tracked or not.
  useEffect(() => {
    if (!area || !autoRefresh) return;
    const timer = setInterval(() => void fetchArea(area, true), AREA_REFRESH_MS);
    return () => clearInterval(timer);
  }, [area, autoRefresh, fetchArea]);

  const patchTracked = useCallback((id: string, patch: Partial<TrackedAircraft>) => {
    setTracked((all) => ({ ...all, [id]: { ...(all[id] ?? { active: false, pending: false }), ...patch } }));
  }, []);

  const track = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        patchTracked(id, { pending: true, error: undefined });
        void (async () => {
          let status: TrackingStatus;
          try {
            status = await call(() => api.startTracking(id, area ?? undefined));
            patchTracked(id, { active: true, pending: false, status, error: status.lastError ?? undefined });
          } catch (error) {
            patchTracked(id, { pending: false, error: describeError(error) });
            return;
          }
          // A callsign's ICAO hex may not be known yet; then live telemetry alone fills the trail.
          const hex = liveIdOf(id, { active: true, pending: false, status });
          if (!hex || hex === "*") return;
          // Best effort: the trail so far, and flight details when the API knows the flight.
          try {
            const since = new Date(Date.now() - BACKFILL_MS).toISOString();
            const { flight, telemetryHistory } = await api.getFlight(hex, since);
            setTracks((current) => withFlight(current, hex, flight, telemetryHistory));
          } catch {
            // No history yet; live telemetry fills the trail.
          }
        })();
      }
    },
    [api, area, call, patchTracked],
  );

  const stop = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        patchTracked(id, { pending: true, error: undefined });
        void call(() => api.stopTracking(id)).then(
          (status) => patchTracked(id, { active: false, pending: false, status }),
          (error) => patchTracked(id, { pending: false, error: describeError(error) }),
        );
      }
    },
    [api, call, patchTracked],
  );

  // One live subscription per tracked aircraft, multiplexed over the client's socket.
  useEffect(() => {
    if (!liveKey) return;
    const disposers = liveKey.split(",").map((liveId) =>
      api.subscribeLive(
        liveId,
        (batch) => setTracks((current) => mergeTelemetry(current, batch)),
        (error) => {
          let message = describeError(error);
          // 4504: the server never acknowledged connection_init, which it does when the token is missing or wrong.
          if (error instanceof SocketClosedError && [4401, 4403, 4504].includes(error.code)) {
            message = "Live connection refused: API token missing or invalid";
            setServer({ state: "unauthorized", message });
          }
          setTracked((all) => {
            const id = Object.keys(all).find((key) => all[key].active && liveIdOf(key, all[key]) === liveId);
            return id ? { ...all, [id]: { ...all[id], error: message } } : all;
          });
        },
      ),
    );
    return () => disposers.forEach((dispose) => dispose());
  }, [api, liveKey]);

  // Tracking status of every active id.
  useEffect(() => {
    if (!activeKey) return;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      await Promise.all(
        activeKey.split(",").map((id) =>
          api.trackingStatus(id).then(
            (status) => patchTracked(id, { status, error: status.lastError ?? undefined }),
            (error) => patchTracked(id, { error: describeError(error) }),
          ),
        ),
      );
      polling = false;
    };
    // Right away too: a callsign's ICAO hex (needed for its live subscription) arrives with its status.
    void poll();
    const timer = setInterval(() => void poll(), STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [api, activeKey, patchTracked]);

  const save = useCallback(
    (next: TelemetrySettings) => {
      saveTelemetrySettings(stores, next);
      setSettings(next);
    },
    [stores],
  );

  const forgetToken = useCallback(() => {
    clearTelemetrySettings(stores);
    setSettings((s) => ({ ...s, token: "", remember: false }));
  }, [stores]);

  return {
    settings,
    proxied,
    saveSettings: save,
    forgetToken,
    server,
    wake,
    area,
    areaResult,
    areaError,
    searching,
    searchId,
    search,
    autoRefresh,
    setAutoRefresh,
    tracks,
    tracked,
    liveIds,
    track,
    stop,
  };
}
