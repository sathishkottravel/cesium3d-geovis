import { toAirport, toWaypoint } from "../navigation/navigraph/mappers";
import type { NavigraphAirport, NavigraphWaypoint } from "../navigation/navigraph/types";
import type { Airport, Coordinates, Waypoint } from "../navigation/types";
import { ApiError, type ApiClient } from "./client";

export interface NavigationApi {
  health(): Promise<void>;
  getAirport(ident: string): Promise<Airport | null>;
  searchWaypoints(query: string, near?: Coordinates): Promise<Waypoint[]>;
}

/** 404: nothing matches; 400: malformed identifier. Both mean "no result" to the app. */
const isNoMatch = (err: unknown) => err instanceof ApiError && (err.status === 404 || err.status === 400);

/**
 * Client for the Navigraph standalone-demo HTTP API (msfs-navigation-data-interface,
 * example/standalone-demo), with the base URL pointing at a data source, e.g. `http://localhost:3000/api/mock`.
 * Responses are raw Navigraph records, mapped to the app model here.
 */
export function createNavigationApi(client: ApiClient): NavigationApi {
  return {
    async health() {
      await client.get("health");
    },
    async getAirport(ident) {
      let airport: NavigraphAirport;
      try {
        airport = await client.get<NavigraphAirport>(`airports/${encodeURIComponent(ident)}`);
      } catch (err) {
        if (isNoMatch(err)) return null;
        throw err;
      }
      return toAirport(airport);
    },
    // The backend has no position filter, so `near` is not sent (the standalone transport ignores it too).
    async searchWaypoints(query) {
      let waypoints: NavigraphWaypoint[];
      try {
        waypoints = await client.get<NavigraphWaypoint[]>(`waypoints/${encodeURIComponent(query.toUpperCase())}`);
      } catch (err) {
        if (isNoMatch(err)) return [];
        throw err;
      }
      return waypoints.map(toWaypoint);
    },
  };
}
