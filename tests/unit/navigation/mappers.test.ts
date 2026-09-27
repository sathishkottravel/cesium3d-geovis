import { describe, expect, it } from "vitest";
import { toAirport, toCoordinates, toWaypoint } from "../../../src/navigation/navigraph/mappers";
import type { NavigraphCoordinates } from "../../../src/navigation/navigraph/types";
import { COSTA_APP, COSTA_NAVIGRAPH, MGGT_APP, MGGT_NAVIGRAPH } from "../../fixtures/navigraph";

describe("Navigraph → app mappers", () => {
  it("maps an airport, dropping fields the app does not use", () => {
    expect(toAirport(MGGT_NAVIGRAPH)).toEqual(MGGT_APP);
  });

  it("maps a waypoint, using the ICAO region", () => {
    expect(toWaypoint(COSTA_NAVIGRAPH)).toEqual(COSTA_APP);
  });

  it("keeps zero coordinates", () => {
    expect(toCoordinates({ lat: 0, long: 0 })).toEqual({ latitude: 0, longitude: 0 });
  });

  it.each([
    ["missing", undefined],
    ["app-shaped", { latitude: 1, longitude: 2 }],
    ["string values", { lat: "14.5", long: "-90.5" }],
    ["NaN", { lat: Number.NaN, long: 1 }],
    ["null lat", { lat: null, long: 1 }],
  ])("rejects a %s location", (_label, location) => {
    expect(() => toCoordinates(location as unknown as NavigraphCoordinates)).toThrow(
      "Unexpected navigation data: missing location",
    );
  });

  it("rejects an airport without a usable location", () => {
    expect(() => toAirport({ ...MGGT_NAVIGRAPH, location: undefined as unknown as NavigraphCoordinates })).toThrow(
      /missing location/,
    );
  });
});
