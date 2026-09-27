import type { NavigraphAirport, NavigraphWaypoint } from "../../src/navigation/navigraph/types";

/** MGGT as returned by the mock standalone module and the standalone-demo API (`GET /api/mock/airports/MGGT`). */
export const MGGT_NAVIGRAPH = {
  airport_type: "C",
  area_code: "LAM",
  city: "GUATEMALA CITY",
  continent: "SOUTH AMERICA",
  country: "GUATEMALA",
  country_3letter: "GTM",
  elevation: 4952,
  iata_ident: "GUA",
  icao_code: "MG",
  ident: "MGGT",
  ifr_capability: "Y",
  location: { lat: 14.583272222222222, long: -90.52747222222222 },
  longest_runway_surface_code: "H",
  magnetic_variation: 0,
  name: "LA AURORA INTL",
  speed_limit: 250,
  speed_limit_altitude: 10000,
  transition_altitude: 19000,
  transition_level: 20000,
} satisfies NavigraphAirport & Record<string, unknown>;

export const MGGT_APP = {
  ident: "MGGT",
  name: "LA AURORA INTL",
  location: { latitude: 14.583272222222222, longitude: -90.52747222222222 },
  elevationFt: 4952,
};

export const COSTA_NAVIGRAPH: NavigraphWaypoint = {
  ident: "COSTA",
  icao_code: "MM",
  area_code: "LAM",
  location: { lat: 21.1, long: -86.9 },
};

export const COSTA_APP = { ident: "COSTA", region: "MM", location: { latitude: 21.1, longitude: -86.9 } };
