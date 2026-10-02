import { describe, expect, it, vi } from "vitest";
import { lookupIdent } from "../../../src/navigation/lookup";
import type { Airport, Waypoint } from "../../../src/navigation/types";

const MGGT: Airport = { ident: "MGGT", name: "LA AURORA INTL", location: { latitude: 14.58, longitude: -90.53 } };
const waypoint = (ident: string, region: string, latitude: number, longitude: number): Waypoint => ({
  ident,
  region,
  location: { latitude, longitude },
});
const COSTA = waypoint("COSTA", "MG", 14.3, -90.5);

function fakeNav(airport: Airport | null | Error, waypoints: Waypoint[] | Error) {
  return {
    getAirport: vi.fn(async () => {
      if (airport instanceof Error) throw airport;
      return airport;
    }),
    searchWaypoints: vi.fn(async () => {
      if (waypoints instanceof Error) throw waypoints;
      return waypoints;
    }),
  };
}

describe("lookupIdent", () => {
  it("queries both with the trimmed, upper-cased ident", async () => {
    const nav = fakeNav(null, []);
    await lookupIdent(nav, "  costa ");
    expect(nav.getAirport).toHaveBeenCalledWith("COSTA");
    expect(nav.searchWaypoints).toHaveBeenCalledWith("COSTA");
  });

  it("finds an airport only", async () => {
    await expect(lookupIdent(fakeNav(MGGT, []), "mggt")).resolves.toEqual({
      airport: MGGT,
      waypoints: [],
      message: "Found airport MGGT",
    });
  });

  it("finds a waypoint only", async () => {
    await expect(lookupIdent(fakeNav(null, [COSTA]), "costa")).resolves.toEqual({
      airport: null,
      waypoints: [COSTA],
      message: "Found 1 waypoint",
    });
  });

  it("finds both, with every waypoint match", async () => {
    const other = waypoint("MGGT", "XX", 10, -80);
    const result = await lookupIdent(fakeNav(MGGT, [COSTA, other]), "MGGT");
    expect(result.waypoints).toEqual([COSTA, other]);
    expect(result.message).toBe("Found airport MGGT and 2 waypoints");
  });

  it("reports when nothing matches", async () => {
    await expect(lookupIdent(fakeNav(null, []), " zzzzz")).resolves.toEqual({
      airport: null,
      waypoints: [],
      message: "No airport or waypoint found for ZZZZZ",
    });
  });

  it("keeps the airport when the waypoint search fails (e.g. msfs)", async () => {
    const result = await lookupIdent(fakeNav(MGGT, new Error("msfs: searchWaypoints is not implemented yet")), "MGGT");
    expect(result).toEqual({ airport: MGGT, waypoints: [], message: "Found airport MGGT" });
  });

  it("keeps the waypoints when the airport lookup fails", async () => {
    const result = await lookupIdent(fakeNav(new Error("boom"), [COSTA]), "COSTA");
    expect(result).toEqual({ airport: null, waypoints: [COSTA], message: "Found 1 waypoint" });
  });

  it("reports an error only when both fail", async () => {
    const result = await lookupIdent(fakeNav(new Error("Failed to fetch"), new Error("also failed")), "mggt");
    expect(result).toEqual({ airport: null, waypoints: [], message: "Lookup of MGGT failed", error: "Failed to fetch" });
  });
});
