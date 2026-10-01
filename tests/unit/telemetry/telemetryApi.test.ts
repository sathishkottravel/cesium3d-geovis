import { describe, expect, it, vi } from "vitest";
import type { Sink } from "../../../src/telemetry/graphqlClient";
import {
  AIRCRAFT_IN_AREA,
  FLIGHT_BY_ID,
  LIVE_TELEMETRY,
  START_TRACKING,
  STOP_TRACKING,
  TRACKING_STATUS,
} from "../../../src/telemetry/operations";
import { TelemetryApi } from "../../../src/telemetry/telemetryApi";

function fakeClient(data: unknown = {}) {
  return {
    request: vi.fn(async (_query: string, _variables?: Record<string, unknown>) => data),
    subscribe: vi.fn((_query: string, _variables: Record<string, unknown>, _sink: Sink<unknown>) => () => {}),
  };
}

// The fakes return canned data for any type parameter.
const apiFor = (client: ReturnType<typeof fakeClient>) => new TelemetryApi(client as never);

const area = { latitude: 51.47, longitude: -0.45, radiusNm: 40 };

describe("TelemetryApi", () => {
  it("queries aircraft by area", async () => {
    const client = fakeClient({ trackableAircraft: { aircraft: [] } });
    await expect(apiFor(client).findAircraft(area)).resolves.toEqual({ aircraft: [] });
    expect(client.request).toHaveBeenCalledWith(AIRCRAFT_IN_AREA, area);
  });

  it("queries a flight and its history by id", async () => {
    const client = fakeClient({ flight: null, telemetryHistory: [] });
    const api = apiFor(client);
    await api.getFlight("4ca7b5", "2026-10-01T10:00:00Z");
    expect(client.request).toHaveBeenCalledWith(FLIGHT_BY_ID, { flightId: "4ca7b5", since: "2026-10-01T10:00:00Z" });
    await api.getFlight("4ca7b5");
    expect(client.request).toHaveBeenLastCalledWith(FLIGHT_BY_ID, { flightId: "4ca7b5", since: null });
  });

  it("starts tracking within an area, or unbounded", async () => {
    const client = fakeClient({ startTracking: { aircraftId: "*", running: true } });
    const api = apiFor(client);
    await expect(api.startTracking("*", area)).resolves.toMatchObject({ running: true });
    expect(client.request).toHaveBeenCalledWith(START_TRACKING, { aircraftId: "*", ...area });
    await api.startTracking("4ca7b5");
    expect(client.request).toHaveBeenLastCalledWith(START_TRACKING, {
      aircraftId: "4ca7b5",
      latitude: null,
      longitude: null,
      radiusNm: null,
    });
  });

  it("stops tracking and polls status", async () => {
    const client = fakeClient({ stopTracking: { running: false }, trackingStatus: { running: true } });
    const api = apiFor(client);
    await expect(api.stopTracking("x")).resolves.toEqual({ running: false });
    expect(client.request).toHaveBeenCalledWith(STOP_TRACKING, { aircraftId: "x" });
    await expect(api.trackingStatus("x")).resolves.toEqual({ running: true });
    expect(client.request).toHaveBeenLastCalledWith(TRACKING_STATUS, { aircraftId: "x" });
  });

  it("subscribes to live telemetry and unwraps batches", () => {
    const client = fakeClient();
    const onBatch = vi.fn();
    apiFor(client).subscribeLive("4ca7b5", onBatch, vi.fn());
    const [query, variables, sink] = client.subscribe.mock.calls[0];
    expect(query).toBe(LIVE_TELEMETRY);
    expect(variables).toEqual({ flightId: "4ca7b5" });
    sink.next({ liveTelemetry: [{ flightId: "4ca7b5" }] });
    expect(onBatch).toHaveBeenCalledWith([{ flightId: "4ca7b5" }]);
  });
});
