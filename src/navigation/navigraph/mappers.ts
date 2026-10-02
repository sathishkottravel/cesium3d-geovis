import type { Airport, Coordinates, Waypoint } from "../types";
import type { NavigraphAirport, NavigraphCoordinates, NavigraphWaypoint } from "./types";

// Navigraph records (from the standalone WASM module or the standalone-demo HTTP API) → app model.

export function toCoordinates(location: NavigraphCoordinates | undefined): Coordinates {
  const { lat, long } = location ?? {};
  // Fail loudly on an unexpected shape rather than handing NaN to Cesium.
  if (!Number.isFinite(lat) || !Number.isFinite(long)) {
    throw new Error("Unexpected navigation data: missing location");
  }
  return { latitude: lat as number, longitude: long as number };
}

export function toAirport(airport: NavigraphAirport): Airport {
  return {
    ident: airport.ident,
    name: airport.name,
    location: toCoordinates(airport.location),
    elevationFt: airport.elevation,
  };
}

export function toWaypoint(waypoint: NavigraphWaypoint): Waypoint {
  const result: Waypoint = {
    ident: waypoint.ident,
    region: waypoint.icao_code,
    location: toCoordinates(waypoint.location),
  };
  if (waypoint.airport_ident) result.airportIdent = waypoint.airport_ident;
  return result;
}
