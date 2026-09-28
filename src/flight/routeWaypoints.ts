import type { NavigationDataInterface } from "../navigation/NavigationDataInterface";
import type { Coordinates, Waypoint } from "../navigation/types";
import { distanceNm, interpolate, type FlightPlan } from "./flightPlan";

/** Default half-width of the corridor around the route, in nm. */
export const ROUTE_CORRIDOR_NM = 15;

const EARTH_RADIUS_NM = 3440.065;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Initial great-circle bearing from `a` to `b`, in radians. */
function bearing(a: Coordinates, b: Coordinates): number {
  const [lat1, lat2] = [toRad(a.latitude), toRad(b.latitude)];
  const dLon = toRad(b.longitude - a.longitude);
  return Math.atan2(
    Math.sin(dLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon),
  );
}

/** Distance of `p` from the great circle through `from` → `to`, and how far along it p lies (both nm). */
export function routeOffset(from: Coordinates, to: Coordinates, p: Coordinates): { crossNm: number; alongNm: number } {
  const angle = distanceNm(from, p) / EARTH_RADIUS_NM;
  const turn = bearing(from, p) - bearing(from, to);
  const cross = Math.asin(Math.sin(angle) * Math.sin(turn));
  const along = Math.acos(Math.min(1, Math.cos(angle) / Math.cos(cross))) * Math.sign(Math.cos(turn) || 1);
  return { crossNm: Math.abs(cross) * EARTH_RADIUS_NM, alongNm: along * EARTH_RADIUS_NM };
}

/**
 * Circles that together cover the corridor: centres at most 2 × corridor apart along the route,
 * radius corridor × √2 (reaches the corridor edge halfway between two centres).
 */
export function routeQueryCircles(plan: FlightPlan, corridorNm: number): { center: Coordinates; rangeNm: number }[] {
  const segments = Math.max(1, Math.ceil(plan.distanceNm / (2 * corridorNm)));
  const rangeNm = corridorNm * Math.SQRT2;
  return Array.from({ length: segments + 1 }, (_, i) => ({
    center: interpolate(plan.from.location, plan.to.location, i / segments),
    rangeNm,
  }));
}

/** En-route waypoints within the corridor, without duplicates, ordered from departure to arrival. */
export function alongRoute(waypoints: Waypoint[], plan: FlightPlan, corridorNm: number): Waypoint[] {
  const seen = new Set<string>();
  const kept: { waypoint: Waypoint; alongNm: number }[] = [];
  for (const waypoint of waypoints) {
    // Terminal (procedure) waypoints cluster at the airports and would hide them.
    if (waypoint.airportIdent) continue;
    const { latitude, longitude } = waypoint.location;
    const key = `${waypoint.ident}|${waypoint.region ?? ""}|${latitude.toFixed(4)}|${longitude.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { crossNm, alongNm } = routeOffset(plan.from.location, plan.to.location, waypoint.location);
    if (crossNm <= corridorNm && alongNm >= 0 && alongNm <= plan.distanceNm) kept.push({ waypoint, alongNm });
  }
  return kept.sort((a, b) => a.alongNm - b.alongNm).map((k) => k.waypoint);
}

/** Waypoints from the data source along a planned flight. */
export async function waypointsAlongRoute(
  nav: Pick<NavigationDataInterface, "getWaypointsInRange">,
  plan: FlightPlan,
  corridorNm = ROUTE_CORRIDOR_NM,
): Promise<Waypoint[]> {
  const circles = routeQueryCircles(plan, corridorNm);
  const results = await Promise.all(circles.map((c) => nav.getWaypointsInRange(c.center, c.rangeNm)));
  return alongRoute(results.flat(), plan, corridorNm);
}
