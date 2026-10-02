import type { GraphQLClient } from "./graphqlClient";
import {
  AIRCRAFT_IN_AREA,
  FLIGHT_BY_ID,
  LIVE_TELEMETRY,
  START_TRACKING,
  STOP_TRACKING,
  TRACKING_STATUS,
  type AircraftInAreaResult,
  type AreaQuery,
  type DateTime,
  type FlightByIdResult,
  type LiveTelemetryResult,
  type StartTrackingResult,
  type StopTrackingResult,
  type Telemetry,
  type TrackableArea,
  type TrackingStatus,
  type TrackingStatusResult,
} from "./operations";

type Client = Pick<GraphQLClient, "request" | "subscribe">;

/** Typed wrappers for the telemetry API's operations. */
export class TelemetryApi {
  constructor(private readonly client: Client) {}

  async findAircraft(area: AreaQuery): Promise<TrackableArea> {
    const { latitude, longitude, radiusNm } = area;
    const data = await this.client.request<AircraftInAreaResult>(AIRCRAFT_IN_AREA, { latitude, longitude, radiusNm });
    return data.trackableAircraft;
  }

  /** Flight details (null for ADS-B-only ids) and its telemetry since `since`. */
  getFlight(flightId: string, since?: DateTime): Promise<FlightByIdResult> {
    return this.client.request<FlightByIdResult>(FLIGHT_BY_ID, { flightId, since: since ?? null });
  }

  /** Starts the server-side poller for one aircraft (or "*"), bounded by `area` when given. */
  async startTracking(aircraftId: string, area?: AreaQuery): Promise<TrackingStatus> {
    const data = await this.client.request<StartTrackingResult>(START_TRACKING, {
      aircraftId,
      latitude: area?.latitude ?? null,
      longitude: area?.longitude ?? null,
      radiusNm: area?.radiusNm ?? null,
    });
    return data.startTracking;
  }

  async stopTracking(aircraftId: string): Promise<TrackingStatus> {
    return (await this.client.request<StopTrackingResult>(STOP_TRACKING, { aircraftId })).stopTracking;
  }

  async trackingStatus(aircraftId: string): Promise<TrackingStatus> {
    return (await this.client.request<TrackingStatusResult>(TRACKING_STATUS, { aircraftId })).trackingStatus;
  }

  /** Streams position batches published for `flightId` after tracking starts. Returns an unsubscribe function. */
  subscribeLive(flightId: string, onBatch: (batch: Telemetry[]) => void, onError: (error: Error) => void): () => void {
    return this.client.subscribe<LiveTelemetryResult>(
      LIVE_TELEMETRY,
      { flightId },
      { next: (data) => onBatch(data.liveTelemetry), error: onError },
    );
  }
}
