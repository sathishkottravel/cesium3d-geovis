export type TransportKind = "standalone" | "standalone_remote" | "msfs" | "api";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Airport {
  ident: string;
  name: string;
  location: Coordinates;
  elevationFt?: number;
}

export interface Waypoint {
  ident: string;
  location: Coordinates;
  region?: string;
  /** Set for terminal (procedure) waypoints: the airport they belong to. Unset for en-route waypoints. */
  airportIdent?: string;
}

/** The transport cannot list waypoints by area (e.g. the HTTP API has no such endpoint). */
export class WaypointsUnavailableError extends Error {}

/** Contract every transport (standalone wasm, msfs wasm, HTTP api) implements. */
export interface NavigationTransport {
  readonly kind: TransportKind;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getAirport(ident: string): Promise<Airport | null>;
  searchWaypoints(query: string, near?: Coordinates): Promise<Waypoint[]>;
  /** Waypoints within `rangeNm` nautical miles of `center`. */
  getWaypointsInRange(center: Coordinates, rangeNm: number): Promise<Waypoint[]>;
}
