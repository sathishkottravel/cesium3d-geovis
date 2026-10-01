import type { FlightInfo, TelemetryPoint, Telemetry, TrackableArea } from "./operations";

export const FT_TO_M = 0.3048;
export const NM_TO_M = 1852;
/** Points kept per aircraft trail. */
export const HISTORY_LIMIT = 300;

export interface TrackPoint {
  /** Epoch milliseconds. */
  time: number;
  latitude: number;
  longitude: number;
  altitudeFt: number;
}

/** One aircraft on the map, keyed by its id (ICAO hex from the area query = flightId of its telemetry). */
export interface AircraftTrack {
  id: string;
  callsign: string | null;
  latitude: number;
  longitude: number;
  altitudeFt: number;
  /** Knots. */
  groundSpeed: number;
  /** Degrees true. */
  track: number;
  distanceNm: number | null;
  /** Epoch ms of the latest position. */
  updatedAt: number;
  /** Listed by the latest area query. */
  inArea: boolean;
  /** Has received live telemetry. */
  live: boolean;
  history: TrackPoint[];
  flight?: FlightInfo | null;
}

export type Tracks = Readonly<Record<string, AircraftTrack>>;

export const toMeters = (feet: number) => feet * FT_TO_M;

/** "abc, def  ghi;abc" → ["abc", "def", "ghi"]. */
export function parseIds(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((id) => id.trim()).filter(Boolean))];
}

function withPoint(history: TrackPoint[], point: TrackPoint): TrackPoint[] {
  const last = history.at(-1);
  if (last && point.time <= last.time) return history;
  const next = [...history, point];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function blank(id: string): AircraftTrack {
  return {
    id,
    callsign: null,
    latitude: 0,
    longitude: 0,
    altitudeFt: 0,
    groundSpeed: 0,
    track: 0,
    distanceNm: null,
    updatedAt: 0,
    inArea: false,
    live: false,
    history: [],
  };
}

/**
 * Applies an area query result: upserts listed aircraft and drops the ones that left the area,
 * except those in `keep` (tracked ids, which live telemetry still updates).
 */
export function fromArea(tracks: Tracks, area: TrackableArea, keep: ReadonlySet<string> = new Set()): Tracks {
  const time = Date.parse(area.fetchedAt) || Date.now();
  const next: Record<string, AircraftTrack> = {};
  for (const [id, track] of Object.entries(tracks)) {
    if (keep.has(id) || track.live) next[id] = { ...track, inArea: false, distanceNm: null };
  }
  for (const a of area.aircraft) {
    const current = next[a.icaoHex] ?? tracks[a.icaoHex] ?? blank(a.icaoHex);
    // Live telemetry is fresher than the area snapshot; only refresh the listing fields then.
    const stale = current.updatedAt > time;
    next[a.icaoHex] = {
      ...current,
      callsign: a.callsign?.trim() || current.callsign,
      distanceNm: a.distanceNm,
      inArea: true,
      ...(stale
        ? {}
        : {
            latitude: a.latitude,
            longitude: a.longitude,
            altitudeFt: a.altitude,
            groundSpeed: a.groundSpeed,
            track: a.track,
            updatedAt: time,
            history: withPoint(current.history, { time, latitude: a.latitude, longitude: a.longitude, altitudeFt: a.altitude }),
          }),
    };
  }
  return next;
}

/** Upserts positions by flightId, in time order; points not newer than an aircraft's latest are ignored. */
export function mergeTelemetry(tracks: Tracks, batch: readonly Telemetry[]): Tracks {
  if (batch.length === 0) return tracks;
  const next: Record<string, AircraftTrack> = { ...tracks };
  const sorted = [...batch].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (const t of sorted) {
    const time = Date.parse(t.timestamp);
    if (Number.isNaN(time)) continue;
    const current = next[t.flightId] ?? blank(t.flightId);
    if (time <= current.updatedAt) continue;
    next[t.flightId] = {
      ...current,
      callsign: t.callsign?.trim() || current.callsign,
      latitude: t.latitude,
      longitude: t.longitude,
      altitudeFt: t.altitude,
      groundSpeed: t.groundSpeed,
      track: t.track,
      updatedAt: time,
      live: true,
      history: withPoint(current.history, { time, latitude: t.latitude, longitude: t.longitude, altitudeFt: t.altitude }),
    };
  }
  return next;
}

/** Adds a flight's details and its earlier positions (FlightById), e.g. to backfill the trail when tracking starts. */
export function withFlight(
  tracks: Tracks,
  id: string,
  flight: FlightInfo | null,
  history: readonly TelemetryPoint[],
): Tracks {
  const merged = mergeTelemetry(
    tracks,
    history.map((p) => ({ ...p, flightId: id })),
  );
  const current = merged[id];
  if (!current) return merged;
  return {
    ...merged,
    [id]: { ...current, flight, callsign: current.callsign ?? flight?.callsign ?? null },
  };
}
