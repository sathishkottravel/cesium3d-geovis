import { ApiClient } from "../../api/client";
import { createNavigationApi, type NavigationApi } from "../../api/navigationApi";
import type { Airport, Coordinates, NavigationTransport, Waypoint } from "../types";

/** Remote navigation data served by an HTTP backend. */
export class ApiTransport implements NavigationTransport {
  readonly kind = "api" as const;
  private readonly api: NavigationApi;

  constructor(baseUrl: string) {
    this.api = createNavigationApi(new ApiClient(baseUrl));
  }

  async connect(): Promise<void> {
    await this.api.health();
  }

  async disconnect(): Promise<void> {}

  getAirport(ident: string): Promise<Airport | null> {
    return this.api.getAirport(ident);
  }

  searchWaypoints(query: string, near?: Coordinates): Promise<Waypoint[]> {
    return this.api.searchWaypoints(query, near);
  }
}
