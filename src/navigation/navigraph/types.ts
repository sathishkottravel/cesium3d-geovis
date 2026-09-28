// Subset of the Navigraph navigation data interface types
// (github.com/Navigraph/msfs-navigation-data-interface, src/ts/types).

export interface NavigraphCoordinates {
  lat: number;
  long: number;
}

export interface NavigraphAirport {
  ident: string;
  icao_code: string;
  area_code: string;
  name: string;
  location: NavigraphCoordinates;
  elevation: number;
  city?: string;
  country?: string;
  iata_ident?: string;
}

export interface NavigraphWaypoint {
  ident: string;
  icao_code: string;
  area_code: string;
  name?: string;
  location: NavigraphCoordinates;
  /** Only on terminal waypoints. */
  airport_ident?: string;
}

export interface NavigraphDatabaseInfo {
  airac_cycle: string;
  effective_from_to: [string, string];
}

export interface NavigraphFunctionResult {
  id: string;
  status: "Success" | "Error";
  data: unknown;
}

export interface NavigraphEvent {
  event: string;
  data: unknown;
}
