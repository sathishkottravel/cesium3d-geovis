import { describe, expect, it } from "vitest";
import type { Telemetry, TrackableAircraft, TrackableArea } from "../../../src/telemetry/operations";
import {
  fromArea,
  HISTORY_LIMIT,
  mergeTelemetry,
  parseIds,
  SILENT_MS,
  withFlight,
} from "../../../src/telemetry/telemetryState";

const T0 = Date.parse("2026-10-01T12:00:00Z");
const iso = (secondsAfterT0: number) => new Date(T0 + secondsAfterT0 * 1000).toISOString();

function aircraft(icaoHex: string, patch: Partial<TrackableAircraft> = {}): TrackableAircraft {
  return {
    icaoHex,
    callsign: `CS${icaoHex}`,
    latitude: 51.5,
    longitude: -0.4,
    altitude: 10_000,
    groundSpeed: 300,
    track: 90,
    distanceNm: 5,
    tracked: false,
    ...patch,
  };
}

function area(fetchedAt: number, list: TrackableAircraft[]): TrackableArea {
  return { fetchedAt: iso(fetchedAt), latitude: 51.47, longitude: -0.45, radiusNm: 40, aircraft: list };
}

function point(flightId: string, at: number, patch: Partial<Telemetry> = {}): Telemetry {
  return {
    flightId,
    timestamp: iso(at),
    latitude: 51 + at / 1000,
    longitude: -0.5,
    altitude: 12_000,
    groundSpeed: 320,
    track: 45,
    callsign: null,
    ...patch,
  };
}

describe("parseIds", () => {
  it("splits on commas, semicolons and whitespace and drops duplicates", () => {
    expect(parseIds(" 4ca7b5, 400f01;  4ca7b5\n*  ")).toEqual(["4ca7b5", "400f01", "*"]);
    expect(parseIds(" , ")).toEqual([]);
  });
});

describe("fromArea", () => {
  it("seeds aircraft with a first trail point", () => {
    const tracks = fromArea({}, area(0, [aircraft("a"), aircraft("b", { callsign: null })]));
    expect(Object.keys(tracks)).toEqual(["a", "b"]);
    expect(tracks.a).toMatchObject({ callsign: "CSa", altitudeFt: 10_000, inArea: true, live: false, updatedAt: T0 });
    expect(tracks.a.history).toHaveLength(1);
    expect(tracks.b.callsign).toBeNull();
  });

  it("extends trails on refresh and drops aircraft that left, unless tracked", () => {
    const first = fromArea({}, area(0, [aircraft("a"), aircraft("b"), aircraft("c")]));
    const next = fromArea(first, area(15, [aircraft("a", { latitude: 51.6 })]), new Set(["c"]));
    expect(Object.keys(next).sort()).toEqual(["a", "c"]);
    expect(next.a.history.map((p) => p.latitude)).toEqual([51.5, 51.6]);
    expect(next.c).toMatchObject({ inArea: false, distanceNm: null });
  });

  it("drops live aircraft silent for longer than the API keeps them", () => {
    const live = mergeTelemetry({}, [point("a", 0), point("b", 0)]);
    const later = (SILENT_MS + 60_000) / 1000;
    const next = fromArea(mergeTelemetry(live, [point("b", later - 10)]), area(later, []), new Set(["a", "b"]));
    expect(Object.keys(next)).toEqual(["b"]);
  });

  it("doesn't move an aircraft back to an older area snapshot than its live position", () => {
    const live = mergeTelemetry({}, [point("a", 30)]);
    const next = fromArea(live, area(15, [aircraft("a", { distanceNm: 9 })]));
    expect(next.a).toMatchObject({ latitude: live.a.latitude, updatedAt: T0 + 30_000, inArea: true, distanceNm: 9 });
  });
});

describe("mergeTelemetry", () => {
  it("upserts by flightId in time order and marks aircraft live", () => {
    const tracks = mergeTelemetry({}, [point("a", 20), point("a", 10), point("b", 5, { callsign: "BAW1 " })]);
    expect(tracks.a.history.map((p) => p.time)).toEqual([T0 + 10_000, T0 + 20_000]);
    expect(tracks.a).toMatchObject({ updatedAt: T0 + 20_000, live: true });
    expect(tracks.b.callsign).toBe("BAW1");
  });

  it("ignores points that aren't newer", () => {
    const tracks = mergeTelemetry({}, [point("a", 20)]);
    const next = mergeTelemetry(tracks, [point("a", 20), point("a", 10)]);
    expect(next.a).toBe(tracks.a);
  });

  it("keeps the trail at HISTORY_LIMIT points", () => {
    const batch = Array.from({ length: HISTORY_LIMIT + 50 }, (_, i) => point("a", i));
    const tracks = mergeTelemetry({}, batch);
    expect(tracks.a.history).toHaveLength(HISTORY_LIMIT);
    expect(tracks.a.history[0].time).toBe(T0 + 50_000);
  });

  it("returns the same object for an empty batch", () => {
    const tracks = mergeTelemetry({}, [point("a", 1)]);
    expect(mergeTelemetry(tracks, [])).toBe(tracks);
  });
});

describe("withFlight", () => {
  it("backfills the trail and adds flight details", () => {
    const flight = { flightId: "a", callsign: "BAW123", origin: "EGLL", destination: "KJFK" };
    const { flightId: _, ...history } = point("a", 1);
    const tracks = withFlight({}, "a", flight, [history]);
    expect(tracks.a).toMatchObject({ flight, callsign: "BAW123" });
    expect(tracks.a.history).toHaveLength(1);
  });

  it("leaves tracks alone when there is nothing to show", () => {
    const tracks = {};
    expect(withFlight(tracks, "a", null, [])).toEqual({});
  });
});
