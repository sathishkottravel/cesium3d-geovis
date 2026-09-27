import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { distanceNm, planFlight } from "../../src/flight/flightPlan";
import { NavigationDataInterface } from "../../src/navigation/NavigationDataInterface";
import { StandaloneTransport } from "../../src/navigation/transports/StandaloneTransport";
import type { Airport } from "../../src/navigation/types";
import { servePublicDir } from "../helpers";

const MOCK_WASM = "/wasm/standalone/mock/standalone_navigation_data_interface.wasm";

describe("flight planning with airports from the mock WASM database", () => {
  let nav: NavigationDataInterface;

  beforeAll(async () => {
    servePublicDir();
    nav = new NavigationDataInterface(new StandaloneTransport(MOCK_WASM));
    await nav.connect();
  });

  afterAll(async () => {
    await nav.disconnect();
  });

  async function airport(ident: string): Promise<Airport> {
    const found = await nav.getAirport(ident);
    expect(found, ident).not.toBeNull();
    return found!;
  }

  it.each([
    // [from, to, approximate distance in nm]
    ["MMUN", "MGGT", 440],
    ["MGGT", "MSLP", 115],
    ["MSLP", "MMUN", 473],
  ])("plans %s → %s (about %i nm)", async (from, to, nm) => {
    const departure = await airport(from);
    const arrival = await airport(to);
    const plan = planFlight(departure, arrival);

    expect(plan.distanceNm).toBeGreaterThan(nm * 0.9);
    expect(plan.distanceNm).toBeLessThan(nm * 1.1);
    expect(plan.durationSec).toBeCloseTo((plan.distanceNm / 450) * 3600, 6);

    // Starts and ends on the airports, at field elevation.
    const first = plan.samples[0];
    const last = plan.samples.at(-1)!;
    expect(distanceNm(first, departure.location)).toBeLessThan(0.01);
    expect(distanceNm(last, arrival.location)).toBeLessThan(0.01);
    expect(first.altitudeFt).toBeCloseTo(departure.elevationFt ?? 0, 6);
    expect(last.altitudeFt).toBeCloseTo(arrival.elevationFt ?? 0, 6);

    // Every sample is a valid position, never below the lower of the two fields.
    const floor = Math.min(departure.elevationFt ?? 0, arrival.elevationFt ?? 0);
    for (const s of plan.samples) {
      expect(Number.isFinite(s.latitude) && Number.isFinite(s.longitude)).toBe(true);
      expect(s.altitudeFt).toBeGreaterThanOrEqual(floor - 1e-6);
      expect(s.altitudeFt).toBeLessThanOrEqual(35_000);
    }
  });

  it("reaches cruise on the longer route but not on the short hop", async () => {
    const long = planFlight(await airport("MMUN"), await airport("MGGT"));
    const short = planFlight(await airport("MGGT"), await airport("MSLP"));
    expect(Math.max(...long.samples.map((s) => s.altitudeFt))).toBe(35_000);
    expect(Math.max(...short.samples.map((s) => s.altitudeFt))).toBeLessThan(35_000);
  });
});
