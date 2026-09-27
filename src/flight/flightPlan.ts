import type { Airport, Coordinates } from "../navigation/types";

/** Playback speed multipliers offered in the UI (1 = real time). */
export const SPEEDS = [1, 10, 60, 600] as const;

export interface FlightSample {
  /** Seconds since departure. */
  t: number;
  latitude: number;
  longitude: number;
  altitudeFt: number;
}

export interface FlightPlan {
  from: Airport;
  to: Airport;
  distanceNm: number;
  durationSec: number;
  samples: FlightSample[];
}

export interface FlightOptions {
  groundSpeedKt?: number;
  cruiseFt?: number;
  /** Number of segments along the route. */
  samples?: number;
}

const EARTH_RADIUS_NM = 3440.065;
/** Roughly a 3° climb / descent gradient. */
const CLIMB_FT_PER_NM = 300;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle central angle between two points, in radians (haversine). */
function centralAngle(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceNm(a: Coordinates, b: Coordinates): number {
  return centralAngle(a, b) * EARTH_RADIUS_NM;
}

/** Point at `fraction` (0..1) along the great circle from `a` to `b`. */
export function interpolate(a: Coordinates, b: Coordinates, fraction: number): Coordinates {
  const angle = centralAngle(a, b);
  if (angle === 0) return { ...a };
  const wa = Math.sin((1 - fraction) * angle) / Math.sin(angle);
  const wb = Math.sin(fraction * angle) / Math.sin(angle);
  const [lat1, lon1, lat2, lon2] = [a.latitude, a.longitude, b.latitude, b.longitude].map(toRad);
  const x = wa * Math.cos(lat1) * Math.cos(lon1) + wb * Math.cos(lat2) * Math.cos(lon2);
  const y = wa * Math.cos(lat1) * Math.sin(lon1) + wb * Math.cos(lat2) * Math.sin(lon2);
  const z = wa * Math.sin(lat1) + wb * Math.sin(lat2);
  return { latitude: toDeg(Math.atan2(z, Math.hypot(x, y))), longitude: toDeg(Math.atan2(y, x)) };
}

/** Plans a direct flight at constant ground speed with a climb / cruise / descent profile. */
export function planFlight(from: Airport, to: Airport, options: FlightOptions = {}): FlightPlan {
  const { groundSpeedKt = 450, cruiseFt = 35_000, samples = 64 } = options;
  const total = distanceNm(from.location, to.location);
  if (from.ident === to.ident || total < 0.01) {
    throw new Error("Departure and arrival must be different airports");
  }
  const fromElev = from.elevationFt ?? 0;
  const toElev = to.elevationFt ?? 0;
  const durationSec = (total / groundSpeedKt) * 3600;

  const points: FlightSample[] = [];
  for (let i = 0; i <= samples; i++) {
    const fraction = i / samples;
    const flown = fraction * total;
    const { latitude, longitude } = interpolate(from.location, to.location, fraction);
    const altitudeFt = Math.min(
      cruiseFt,
      fromElev + CLIMB_FT_PER_NM * flown,
      toElev + CLIMB_FT_PER_NM * (total - flown),
    );
    points.push({ t: fraction * durationSec, latitude, longitude, altitudeFt });
  }
  return { from, to, distanceNm: total, durationSec, samples: points };
}

/** The sample at or just before `elapsedSec`. */
export function sampleAt(plan: FlightPlan, elapsedSec: number): FlightSample {
  const { samples } = plan;
  const index = Math.floor((Math.min(Math.max(elapsedSec, 0), plan.durationSec) / plan.durationSec) * (samples.length - 1));
  return samples[index];
}

/** `1h 02m` for an hour or more, otherwise `4m 10s`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`;
}
