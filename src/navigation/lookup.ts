import type { NavigationDataInterface } from "./NavigationDataInterface";
import type { Airport, Waypoint } from "./types";

export interface LookupResult {
  airport: Airport | null;
  waypoints: Waypoint[];
  /** What was found, or that nothing was. */
  message: string;
  /** Set only when both lookups failed. */
  error?: string;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const reason = (result: PromiseRejectedResult) =>
  result.reason instanceof Error ? result.reason.message : String(result.reason);

/**
 * Looks an identifier up as an airport and as waypoints at the same time. Waypoint idents are not
 * unique, so every match is returned. One failing lookup (e.g. msfs has no waypoint search) does not
 * hide the other's result.
 */
export async function lookupIdent(
  nav: Pick<NavigationDataInterface, "getAirport" | "searchWaypoints">,
  ident: string,
): Promise<LookupResult> {
  const name = ident.trim().toUpperCase();
  const [airport, waypoints] = await Promise.allSettled([nav.getAirport(name), nav.searchWaypoints(name)]);

  if (airport.status === "rejected" && waypoints.status === "rejected") {
    return { airport: null, waypoints: [], message: `Lookup of ${name} failed`, error: reason(airport) };
  }
  const found = {
    airport: airport.status === "fulfilled" ? airport.value : null,
    waypoints: waypoints.status === "fulfilled" ? waypoints.value : [],
  };
  const parts = [
    found.airport && `airport ${found.airport.ident}`,
    found.waypoints.length > 0 && plural(found.waypoints.length, "waypoint"),
  ].filter(Boolean);
  const message = parts.length ? `Found ${parts.join(" and ")}` : `No airport or waypoint found for ${name}`;
  return { ...found, message };
}
