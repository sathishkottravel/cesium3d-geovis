// GraphQL operations of the Aviation Telemetry API, selecting only the fields the UI uses.
// Lifecycle per aircraft: StartTracking → FlightById (trail backfill) → LiveTelemetry (stream)
// → TrackingStatus (poll) → StopTracking. AircraftInArea alone is enough for passive viewing.

/** ISO-8601 timestamp (GraphQL `DateTime`). */
export type DateTime = string;

export interface AreaQuery {
  latitude: number;
  longitude: number;
  radiusNm: number;
}

export interface TrackableAircraft {
  icaoHex: string;
  callsign: string | null;
  latitude: number;
  longitude: number;
  /** Feet. */
  altitude: number;
  /** Knots. */
  groundSpeed: number;
  /** Degrees true. */
  track: number;
  distanceNm: number | null;
  tracked: boolean;
}

export interface TrackableArea extends AreaQuery {
  fetchedAt: DateTime;
  aircraft: TrackableAircraft[];
}

export interface FlightInfo {
  flightId: string;
  callsign: string;
  origin: string;
  destination: string;
}

export interface TelemetryPoint {
  timestamp: DateTime;
  latitude: number;
  longitude: number;
  /** Feet. */
  altitude: number;
  groundSpeed: number;
  track: number;
  callsign: string | null;
}

export interface Telemetry extends TelemetryPoint {
  flightId: string;
}

export interface TrackingStatus {
  aircraftId: string;
  icaoHex: string | null;
  running: boolean;
  inArea?: boolean | null;
  lastPositionAt?: DateTime | null;
  publishedCount?: number;
  lastError?: string | null;
}

export const AIRCRAFT_IN_AREA = /* GraphQL */ `
  query AircraftInArea($latitude: Float!, $longitude: Float!, $radiusNm: Float!) {
    trackableAircraft(latitude: $latitude, longitude: $longitude, radiusNm: $radiusNm) {
      fetchedAt latitude longitude radiusNm
      aircraft { icaoHex callsign latitude longitude altitude groundSpeed track distanceNm tracked }
    }
  }
`;
export type AircraftInAreaResult = { trackableAircraft: TrackableArea };

export const FLIGHT_BY_ID = /* GraphQL */ `
  query FlightById($flightId: ID!, $since: DateTime) {
    flight(flightId: $flightId) { flightId callsign origin destination }
    telemetryHistory(flightId: $flightId, start: $since) {
      timestamp latitude longitude altitude groundSpeed track callsign
    }
  }
`;
export type FlightByIdResult = { flight: FlightInfo | null; telemetryHistory: TelemetryPoint[] };

export const START_TRACKING = /* GraphQL */ `
  mutation StartTracking($aircraftId: ID!, $latitude: Float, $longitude: Float, $radiusNm: Float) {
    startTracking(aircraftId: $aircraftId, latitude: $latitude, longitude: $longitude, radiusNm: $radiusNm) {
      aircraftId icaoHex running lastError
    }
  }
`;
export type StartTrackingResult = { startTracking: TrackingStatus };

export const STOP_TRACKING = /* GraphQL */ `
  mutation StopTracking($aircraftId: ID!) {
    stopTracking(aircraftId: $aircraftId) { aircraftId icaoHex running publishedCount }
  }
`;
export type StopTrackingResult = { stopTracking: TrackingStatus };

export const TRACKING_STATUS = /* GraphQL */ `
  query TrackingStatus($aircraftId: ID!) {
    trackingStatus(aircraftId: $aircraftId) {
      aircraftId icaoHex running inArea lastPositionAt publishedCount lastError
    }
  }
`;
export type TrackingStatusResult = { trackingStatus: TrackingStatus };

export const LIVE_TELEMETRY = /* GraphQL */ `
  subscription LiveTelemetry($flightId: ID!) {
    liveTelemetry(flightId: $flightId) {
      flightId callsign timestamp latitude longitude altitude groundSpeed track
    }
  }
`;
export type LiveTelemetryResult = { liveTelemetry: Telemetry[] };
