/**
 * A real `trackableAircraft` response (default area, 2026-10-01T19:22:40Z), used to generate sample
 * traffic. Positions, speeds and tracks aren't in it; the mock server derives them (see MockTelemetryServer).
 * Negative altitudes are aircraft on the ground reporting barometric altitude below sea level.
 */
export interface SampleAircraft {
  icaoHex: string;
  callsign: string;
  distanceNm: number;
  /** Feet. */
  altitude: number;
}

export const SAMPLE_FETCHED_AT = "2026-10-01T19:22:40.002000+00:00";

/** Center of the API's default area (Stockholm Arlanda), used when a query gives no coordinates. */
export const SAMPLE_CENTER = { latitude: 59.65, longitude: 17.93 };

export const SAMPLE_AIRCRAFT: readonly SampleAircraft[] = [
  { icaoHex: "490d02", callsign: "NJE632N", distanceNm: 4.155, altitude: -425 },
  { icaoHex: "440d92", callsign: "TAY2KU", distanceNm: 12.846, altitude: 38000 },
  { icaoHex: "781fc4", callsign: "CAO1006", distanceNm: 13.305, altitude: 35000 },
  { icaoHex: "4cad96", callsign: "SAS40G", distanceNm: 16.83, altitude: 10025 },
  { icaoHex: "4cae27", callsign: "BCS4VA", distanceNm: 17.938, altitude: 5950 },
  { icaoHex: "4cae75", callsign: "SAS2142", distanceNm: 22.02, altitude: -25 },
  { icaoHex: "47a097", callsign: "NSZ9MC", distanceNm: 26.378, altitude: 17175 },
  { icaoHex: "4aca85", callsign: "NSZ1KM", distanceNm: 26.459, altitude: 10750 },
  { icaoHex: "4caf7e", callsign: "SAS169", distanceNm: 26.879, altitude: 21450 },
  { icaoHex: "4ab5d5", callsign: "SAS1128", distanceNm: 30.437, altitude: 2225 },
  { icaoHex: "4cad91", callsign: "SAS528", distanceNm: 36.241, altitude: 11100 },
  { icaoHex: "4ab347", callsign: "SELZG", distanceNm: 49.808, altitude: 2450 },
  { icaoHex: "459a66", callsign: "FRO687", distanceNm: 55.749, altitude: 22800 },
  { icaoHex: "78228c", callsign: "CBJ670", distanceNm: 58.736, altitude: 35000 },
  { icaoHex: "461f63", callsign: "FIN7FG", distanceNm: 61.254, altitude: 35000 },
  { icaoHex: "461f9d", callsign: "FIN5DA", distanceNm: 64.24, altitude: 35000 },
  { icaoHex: "461f64", callsign: "FIN4BV", distanceNm: 68.017, altitude: 36925 },
  { icaoHex: "461f56", callsign: "FIN4CE", distanceNm: 72.967, altitude: 40950 },
  { icaoHex: "461f67", callsign: "FIN1LP", distanceNm: 83.461, altitude: 37000 },
  { icaoHex: "461f39", callsign: "FIN5G", distanceNm: 84.833, altitude: 39025 },
  { icaoHex: "4aa6a4", callsign: "SEIUD", distanceNm: 86.176, altitude: 2100 },
  { icaoHex: "a3c68c", callsign: "UPS291", distanceNm: 87.36, altitude: 34025 },
  { icaoHex: "461f6c", callsign: "FIN8DN", distanceNm: 90.131, altitude: 39000 },
  { icaoHex: "461e1c", callsign: "FIN26V", distanceNm: 98.477, altitude: 39000 },
  { icaoHex: "461f35", callsign: "FIN78Y", distanceNm: 99.047, altitude: 39025 },
];
