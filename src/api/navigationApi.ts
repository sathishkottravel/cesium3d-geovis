import type { Airport, Coordinates, Waypoint } from "../navigation/types";
import { ApiError, type ApiClient } from "./client";

export interface NavigationApi {
  health(): Promise<void>;
  getAirport(ident: string): Promise<Airport | null>;
  searchWaypoints(query: string, near?: Coordinates): Promise<Waypoint[]>;
}

export function createNavigationApi(client: ApiClient): NavigationApi {
  return {
    async health() {
      await client.get("health");
    },
    async getAirport(ident) {
      try {
        return await client.get<Airport>(`airports/${encodeURIComponent(ident)}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    searchWaypoints(query, near) {
      return client.get<Waypoint[]>("waypoints", {
        q: query,
        lat: near?.latitude,
        lon: near?.longitude,
      });
    },
  };
}
