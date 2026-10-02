import { afterEach, describe, expect, it, vi } from "vitest";
import { MockTelemetryServer, unitHash } from "../../../src/telemetry/mock/MockTelemetryServer";
import { SAMPLE_AIRCRAFT, SAMPLE_CENTER } from "../../../src/telemetry/mock/sampleAircraft";
import type { Telemetry } from "../../../src/telemetry/operations";
import { TelemetryApi } from "../../../src/telemetry/telemetryApi";

const T0 = Date.parse("2026-10-01T20:00:00Z");
const LONDON = { latitude: 51.47, longitude: -0.45, radiusNm: 40 };

function setup(intervalMs = 1_000) {
  let now = T0;
  const server = new MockTelemetryServer({ now: () => now, latencyMs: 0, intervalMs });
  return {
    server,
    api: new TelemetryApi(server),
    /** Moves the clock, firing timers along the way when they're faked. */
    advance(ms: number) {
      const step = 100;
      for (let elapsed = 0; elapsed < ms; elapsed += step) {
        now += step;
        if (vi.isFakeTimers()) vi.advanceTimersByTime(step);
      }
    },
  };
}

/** Great-circle-ish distance in nm, good enough at these scales. */
function distanceNm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const dLat = (a.latitude - b.latitude) * 60;
  const dLon = (a.longitude - b.longitude) * 60 * Math.cos((b.latitude * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("MockTelemetryServer: area query", () => {
  it("returns the recorded aircraft around the requested area, nearest first", async () => {
    const { api } = setup();
    const area = await api.findAircraft(LONDON);
    expect(area).toMatchObject({ ...LONDON, fetchedAt: new Date(T0).toISOString() });
    expect(area.aircraft.length).toBeGreaterThan(5);
    expect(area.aircraft.length).toBeLessThan(SAMPLE_AIRCRAFT.length);
    const distances = area.aircraft.map((a) => a.distanceNm ?? Infinity);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    for (const a of area.aircraft) {
      expect(a.distanceNm).toBeLessThanOrEqual(LONDON.radiusNm);
      // The reported distance matches the reported position.
      expect(distanceNm(a, LONDON)).toBeCloseTo(a.distanceNm!, 0);
      expect(a.track).toBeGreaterThanOrEqual(0);
      expect(a.track).toBeLessThan(360);
    }
  });

  it("keeps the recorded callsigns and altitudes, including ground aircraft below sea level", async () => {
    const { api } = setup();
    const area = await api.findAircraft({ ...LONDON, radiusNm: 250 });
    expect(area.aircraft).toHaveLength(SAMPLE_AIRCRAFT.length);
    expect(area.aircraft.find((a) => a.icaoHex === "490d02")).toMatchObject({ callsign: "NJE632N", altitude: -425 });
  });

  it("uses the API's default area (Stockholm) when no coordinates are given", async () => {
    const { server } = setup();
    const result = await server.request<{ trackableAircraft: { latitude: number; longitude: number } }>(
      "query AircraftInArea { trackableAircraft { latitude longitude } }",
    );
    expect(result.trackableAircraft).toMatchObject(SAMPLE_CENTER);
  });

  it("moves aircraft smoothly over time, along their reported track", async () => {
    const { api, advance } = setup();
    const before = (await api.findAircraft(LONDON)).aircraft.find((a) => a.icaoHex === "4cad96")!;
    advance(10_000);
    const after = (await api.findAircraft(LONDON)).aircraft.find((a) => a.icaoHex === "4cad96")!;
    // 350 kt for 10 s ≈ 0.97 nm.
    expect(distanceNm(after, before)).toBeCloseTo(0.97, 1);
    const bearing = (Math.atan2(
      (after.longitude - before.longitude) * Math.cos((before.latitude * Math.PI) / 180),
      after.latitude - before.latitude,
    ) * 180) / Math.PI;
    const diff = Math.abs(((bearing - before.track + 540) % 360) - 180);
    expect(diff).toBeLessThan(10);
  });

  it("is deterministic", () => {
    expect(unitHash("4cad96")).toBe(unitHash("4cad96"));
    expect(unitHash("4cad96")).not.toBe(unitHash("4cad91"));
  });
});

describe("MockTelemetryServer: tracking", () => {
  it("starts, reports and stops a tracker", async () => {
    const { api } = setup();
    await api.findAircraft(LONDON);
    await expect(api.startTracking("4cad96", LONDON)).resolves.toMatchObject({ running: true, lastError: null });
    await expect(api.trackingStatus("4cad96")).resolves.toMatchObject({ running: true, publishedCount: 0 });
    expect((await api.findAircraft(LONDON)).aircraft.find((a) => a.icaoHex === "4cad96")?.tracked).toBe(true);
    await expect(api.stopTracking("4cad96")).resolves.toMatchObject({ running: false });
    await expect(api.trackingStatus("4cad96")).resolves.toMatchObject({ running: false });
  });

  it("refuses ids that aren't in the sample", async () => {
    const { api } = setup();
    await expect(api.startTracking("ffffff")).resolves.toMatchObject({ running: false, lastError: expect.any(String) });
  });

  it("backfills a trail up to now", async () => {
    const { api } = setup();
    const { flight, telemetryHistory } = await api.getFlight("4cad96", new Date(T0 - 5 * 60_000).toISOString());
    expect(flight).toBeNull();
    expect(telemetryHistory).toHaveLength(10);
    expect(Date.parse(telemetryHistory.at(-1)!.timestamp)).toBeLessThan(T0);
  });

  it("rejects unknown operations", async () => {
    const { server } = setup();
    await expect(server.request("query Nope { x }")).rejects.toThrow(/Nope/);
  });
});

describe("MockTelemetryServer: liveTelemetry", () => {
  it("streams one flight for a tracked id, starting on subscribe", async () => {
    vi.useFakeTimers();
    const { api, advance } = setup();
    await api.startTracking("4cad96", LONDON);
    const batches: Telemetry[][] = [];
    const unsubscribe = api.subscribeLive("4cad96", (b) => batches.push(b), vi.fn());
    advance(100);
    expect(batches).toHaveLength(1);

    advance(3_000);
    expect(batches).toHaveLength(4);
    expect(batches.every((b) => b.length === 1 && b[0].flightId === "4cad96" && b[0].callsign === "SAS40G")).toBe(true);
    expect(new Set(batches.map((b) => b[0].timestamp)).size).toBe(4);
    await expect(api.trackingStatus("4cad96")).resolves.toMatchObject({ publishedCount: 4 });

    unsubscribe();
    advance(3_000);
    expect(batches).toHaveLength(4);
  });

  it("sends nothing for an untracked id", () => {
    vi.useFakeTimers();
    const { api, advance } = setup();
    const onBatch = vi.fn();
    api.subscribeLive("4cad96", onBatch, vi.fn());
    advance(3_000);
    expect(onBatch).not.toHaveBeenCalled();
  });

  it("sends every tracked flight for '*'", async () => {
    vi.useFakeTimers();
    const { api, advance } = setup();
    await api.findAircraft(LONDON);
    await api.startTracking("4cad96", LONDON);
    await api.startTracking("4cad91", LONDON);
    const batches: Telemetry[][] = [];
    api.subscribeLive("*", (b) => batches.push(b), vi.fn());
    // On subscribe, then every second.
    advance(2_000);
    expect(batches.map((b) => b.map((t) => t.flightId).sort())).toEqual([
      ["4cad91", "4cad96"],
      ["4cad91", "4cad96"],
      ["4cad91", "4cad96"],
    ]);

    await api.startTracking("*", LONDON);
    advance(2_000);
    const inArea = (await api.findAircraft(LONDON)).aircraft.length;
    expect(batches.at(-1)).toHaveLength(inArea);
  });

  it("tracks by callsign, case-insensitively, and reports the ICAO hex to subscribe with", async () => {
    vi.useFakeTimers();
    const { api, advance } = setup();
    await expect(api.startTracking("sas40g", LONDON)).resolves.toMatchObject({
      aircraftId: "sas40g",
      icaoHex: "4cad96",
      running: true,
    });
    await expect(api.trackingStatus("SAS40G")).resolves.toMatchObject({ icaoHex: "4cad96", running: true });
    const onBatch = vi.fn();
    api.subscribeLive("4CAD96", onBatch, vi.fn());
    advance(100);
    expect(onBatch).toHaveBeenCalledWith([expect.objectContaining({ flightId: "4cad96", callsign: "SAS40G" })]);
    await expect(api.stopTracking("SAS40G")).resolves.toMatchObject({ running: false, icaoHex: "4cad96" });
  });

  it("stops all streams on dispose", async () => {
    vi.useFakeTimers();
    const { server, api, advance } = setup();
    await api.startTracking("4cad96");
    const onBatch = vi.fn();
    api.subscribeLive("4cad96", onBatch, vi.fn());
    server.dispose();
    advance(5_000);
    expect(onBatch).not.toHaveBeenCalled();
  });
});
