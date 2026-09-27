import { describe, expect, it } from "vitest";
import {
  distanceNm,
  formatDuration,
  interpolate,
  planFlight,
  sampleAt,
  SPEEDS,
} from "../../../src/flight/flightPlan";
import type { Airport } from "../../../src/navigation/types";

const airport = (ident: string, latitude: number, longitude: number, elevationFt?: number): Airport => ({
  ident,
  name: ident,
  location: { latitude, longitude },
  elevationFt,
});

// Coordinates from the mock database.
const MMUN = airport("MMUN", 21.042741666666668, -86.8732, 22);
const MGGT = airport("MGGT", 14.583272222222222, -90.52747222222222, 4952);

describe("distanceNm", () => {
  it("is zero for the same point", () => {
    expect(distanceNm(MMUN.location, MMUN.location)).toBe(0);
  });

  it("is 60 nm per degree of latitude along a meridian", () => {
    expect(distanceNm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(60.04, 1);
  });

  it("measures Cancún to Guatemala City (about 441 nm)", () => {
    expect(distanceNm(MMUN.location, MGGT.location)).toBeCloseTo(441, -1);
  });
});

describe("interpolate", () => {
  it("returns the endpoints at 0 and 1", () => {
    const start = interpolate(MMUN.location, MGGT.location, 0);
    const end = interpolate(MMUN.location, MGGT.location, 1);
    expect(start.latitude).toBeCloseTo(MMUN.location.latitude, 9);
    expect(start.longitude).toBeCloseTo(MMUN.location.longitude, 9);
    expect(end.latitude).toBeCloseTo(MGGT.location.latitude, 9);
    expect(end.longitude).toBeCloseTo(MGGT.location.longitude, 9);
  });

  it("puts the midpoint halfway along the route", () => {
    const mid = interpolate(MMUN.location, MGGT.location, 0.5);
    const total = distanceNm(MMUN.location, MGGT.location);
    expect(distanceNm(MMUN.location, mid)).toBeCloseTo(total / 2, 6);
    expect(distanceNm(mid, MGGT.location)).toBeCloseTo(total / 2, 6);
  });

  it("follows the great circle, north of the straight lat/long line for an east-west route", () => {
    const mid = interpolate({ latitude: 50, longitude: -60 }, { latitude: 50, longitude: 0 }, 0.5);
    expect(mid.latitude).toBeGreaterThan(50);
    expect(mid.longitude).toBeCloseTo(-30, 6);
  });
});

describe("planFlight", () => {
  const plan = planFlight(MMUN, MGGT);

  it("flies at the default 450 kt", () => {
    expect(plan.distanceNm).toBeCloseTo(441, -1);
    expect(plan.durationSec).toBeCloseTo((plan.distanceNm / 450) * 3600, 6);
  });

  it("uses the given ground speed", () => {
    expect(planFlight(MMUN, MGGT, { groundSpeedKt: 225 }).durationSec).toBeCloseTo(plan.durationSec * 2, 6);
  });

  it("samples the route from departure to arrival with increasing time", () => {
    expect(plan.samples).toHaveLength(65);
    expect(plan.samples[0]).toMatchObject({ t: 0, altitudeFt: 22 });
    const last = plan.samples.at(-1)!;
    expect(last.t).toBeCloseTo(plan.durationSec, 6);
    expect(last.latitude).toBeCloseTo(MGGT.location.latitude, 6);
    expect(last.longitude).toBeCloseTo(MGGT.location.longitude, 6);
    expect(last.altitudeFt).toBeCloseTo(4952, 6);
    for (let i = 1; i < plan.samples.length; i++) {
      expect(plan.samples[i].t).toBeGreaterThan(plan.samples[i - 1].t);
    }
  });

  it("climbs to cruise, holds it, then descends", () => {
    const altitudes = plan.samples.map((s) => s.altitudeFt);
    const peak = Math.max(...altitudes);
    expect(peak).toBe(35_000);
    const firstCruise = altitudes.indexOf(peak);
    const lastCruise = altitudes.lastIndexOf(peak);
    for (let i = 1; i <= firstCruise; i++) expect(altitudes[i]).toBeGreaterThanOrEqual(altitudes[i - 1]);
    for (let i = lastCruise + 1; i < altitudes.length; i++) expect(altitudes[i]).toBeLessThanOrEqual(altitudes[i - 1]);
  });

  it("stays below cruise on a short hop", () => {
    const hop = planFlight(airport("A", 0, 0), airport("B", 0, 1)); // 60 nm
    expect(Math.max(...hop.samples.map((s) => s.altitudeFt))).toBeLessThan(35_000);
    expect(Math.max(...hop.samples.map((s) => s.altitudeFt))).toBeCloseTo(300 * 30, -2);
  });

  it("treats a missing elevation as sea level", () => {
    const flight = planFlight(airport("A", 0, 0), airport("B", 0, 1));
    expect(flight.samples[0].altitudeFt).toBe(0);
    expect(flight.samples.at(-1)!.altitudeFt).toBeCloseTo(0, 6);
  });

  it("rejects a flight to the same airport", () => {
    expect(() => planFlight(MMUN, MMUN)).toThrow("Departure and arrival must be different airports");
  });
});

describe("sampleAt", () => {
  const plan = planFlight(MMUN, MGGT);

  it("clamps to departure and arrival", () => {
    expect(sampleAt(plan, -5)).toBe(plan.samples[0]);
    expect(sampleAt(plan, plan.durationSec + 100)).toBe(plan.samples.at(-1));
  });

  it("returns the sample at or before the elapsed time", () => {
    const s = sampleAt(plan, plan.durationSec / 2);
    expect(s.t).toBeLessThanOrEqual(plan.durationSec / 2);
    expect(s).toBe(plan.samples[32]);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0m 00s"],
    [59.6, "1m 00s"],
    [250, "4m 10s"],
    [3600, "1h 00m"],
    [3725, "1h 02m"],
    [-3, "0m 00s"],
  ])("%s s → %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe("SPEEDS", () => {
  it("starts at real time and increases", () => {
    expect(SPEEDS[0]).toBe(1);
    expect([...SPEEDS]).toEqual([...SPEEDS].sort((a, b) => a - b));
  });
});
