import { describe, expect, it } from "vitest";
import { liveIdOf, type TrackedAircraft } from "../../../src/telemetry/useTelemetry";

const tracked = (icaoHex: string | null): TrackedAircraft => ({
  active: true,
  pending: false,
  status: { aircraftId: "x", icaoHex, running: true },
});

describe("liveIdOf: the id liveTelemetry knows a tracked aircraft by", () => {
  it("keeps '*'", () => {
    expect(liveIdOf("*", undefined)).toBe("*");
  });

  it("uses an ICAO hex as typed, lowercased", () => {
    expect(liveIdOf("4CAD96", undefined)).toBe("4cad96");
  });

  it("waits for the server to resolve a callsign's ICAO hex", () => {
    expect(liveIdOf("DLH423", tracked(null))).toBeNull();
    expect(liveIdOf("DLH423", tracked("3C4AD7"))).toBe("3c4ad7");
  });

  it("prefers the server's ICAO hex", () => {
    expect(liveIdOf("abc123", tracked("4cad96"))).toBe("4cad96");
  });
});
