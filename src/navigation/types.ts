export type TransportKind = "standalone" | "msfs" | "api";

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
}

/** Contract every transport (standalone wasm, msfs wasm, HTTP api) implements. */
export interface NavigationTransport {
  readonly kind: TransportKind;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getAirport(ident: string): Promise<Airport | null>;
  searchWaypoints(query: string, near?: Coordinates): Promise<Waypoint[]>;
}
