import { describe, expect, it, vi } from "vitest";
import { distanceNm, interpolate, planFlight } from "../../../src/flight/flightPlan";
import {
  alongRoute,
  routeOffset,
  routeQueryCircles,
  waypointsAlongRoute,
} from "../../../src/flight/routeWaypoints";
import type { Airport, Coordinates, Waypoint } from "../../../src/navigation/types";

const airport = (ident: string, latitude: number, longitude: number): Airport => ({
  ident,
  name: ident,
  location: { latitude, longitude },
});
// An east-west route along the equator: 1° of longitude = 60 nm, 1° of latitude = 60 nm off route.
const A = airport("A", 0, 0);
const B = airport("B", 0, 5); // 300 nm
const plan = planFlight(A, B);
const wp = (ident: string, latitude: number, longitude: number, extra: Partial<Waypoint> = {}): Waypoint => ({
  ident,
  region: "XX",
  location: { latitude, longitude },
  ...extra,
});

describe("routeOffset", () => {
  it("measures cross-track and along-track distance", () => {
    const { crossNm, alongNm } = routeOffset(A.location, B.location, { latitude: 0.25, longitude: 2 });
    expect(crossNm).toBeCloseTo(15, 0);
    expect(alongNm).toBeCloseTo(120, 0);
  });

  it("is negative along-track behind the departure", () => {
    expect(routeOffset(A.location, B.location, { latitude: 0, longitude: -1 }).alongNm).toBeLessThan(0);
  });

  it("works on a diagonal route (MMUN → MGGT midpoint is on the route)", () => {
    const mmun = { latitude: 21.04, longitude: -86.87 };
    const mggt = { latitude: 14.58, longitude: -90.53 };
    const mid = interpolate(mmun, mggt, 0.5);
    const { crossNm, alongNm } = routeOffset(mmun, mggt, mid);
    expect(crossNm).toBeLessThan(0.01);
    expect(alongNm).toBeCloseTo(distanceNm(mmun, mggt) / 2, 3);
  });
});

describe("routeQueryCircles", () => {
  it("spaces centres at most 2 × corridor apart from end to end, with radius corridor × √2", () => {
    const circles = routeQueryCircles(plan, 15);
    expect(circles[0].center.longitude).toBeCloseTo(0, 9);
    expect(circles.at(-1)!.center.longitude).toBeCloseTo(5, 9);
    for (let i = 1; i < circles.length; i++) {
      expect(distanceNm(circles[i - 1].center, circles[i].center)).toBeLessThanOrEqual(30 + 1e-6);
    }
    expect(circles.every((c) => c.rangeNm === 15 * Math.SQRT2)).toBe(true);
  });

  it("covers every point of the corridor", () => {
    const circles = routeQueryCircles(plan, 15);
    for (let lon = 0; lon <= 5; lon += 0.05) {
      for (const lat of [-0.25, 0, 0.25]) {
        const p: Coordinates = { latitude: lat, longitude: lon };
        expect(circles.some((c) => distanceNm(c.center, p) <= c.rangeNm + 1e-6), `${lat},${lon}`).toBe(true);
      }
    }
  });

  it("uses at least two circles on a short route", () => {
    expect(routeQueryCircles(planFlight(A, airport("C", 0, 0.1)), 15)).toHaveLength(2);
  });
});

describe("alongRoute", () => {
  it("keeps waypoints within the corridor and drops the rest", () => {
    const near = wp("NEAR", 10 / 60, 2); // 10 nm off
    const far = wp("FAR", 20 / 60, 2); // 20 nm off
    const behind = wp("BEHND", 0, -0.2); // before departure
    const beyond = wp("BEYND", 0, 5.2); // after arrival
    expect(alongRoute([near, far, behind, beyond], plan, 15)).toEqual([near]);
  });

  it("drops terminal (procedure) waypoints", () => {
    expect(alongRoute([wp("FD12R", 0, 0.1, { airportIdent: "A" })], plan, 15)).toEqual([]);
  });

  it("removes duplicates from overlapping query circles", () => {
    const x = wp("X", 0.1, 1);
    expect(alongRoute([x, { ...x }, x], plan, 15)).toEqual([x]);
  });

  it("keeps same-named waypoints at different places", () => {
    const a = wp("D114K", 0.1, 1, { region: "MM" });
    const b = wp("D114K", -0.1, 3, { region: "MS" });
    expect(alongRoute([b, a], plan, 15)).toEqual([a, b]);
  });

  it("orders waypoints from departure to arrival", () => {
    const points = [wp("C", 0, 4), wp("A", 0.1, 1), wp("B", -0.1, 2.5)];
    expect(alongRoute(points, plan, 15).map((w) => w.ident)).toEqual(["A", "B", "C"]);
  });
});

describe("waypointsAlongRoute", () => {
  it("queries each circle and returns the filtered, ordered waypoints", async () => {
    const b = wp("B", 0, 3);
    const a = wp("A", 0, 1);
    const nav = {
      getWaypointsInRange: vi.fn(async (center: Coordinates) => (center.longitude < 2.5 ? [a, wp("OFF", 2, 1)] : [b, a])),
    };
    await expect(waypointsAlongRoute(nav, plan, 15)).resolves.toEqual([a, b]);
    expect(nav.getWaypointsInRange).toHaveBeenCalledTimes(routeQueryCircles(plan, 15).length);
  });

  it("propagates a data source error", async () => {
    const nav = { getWaypointsInRange: vi.fn().mockRejectedValue(new Error("unavailable")) };
    await expect(waypointsAlongRoute(nav, plan)).rejects.toThrow("unavailable");
  });
});
