import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { distanceNm } from "../../src/flight/flightPlan";
import { lookupIdent } from "../../src/navigation/lookup";
import { NavigationDataInterface } from "../../src/navigation/NavigationDataInterface";
import { StandaloneTransport } from "../../src/navigation/transports/StandaloneTransport";
import { servePublicDir } from "../helpers";

const MOCK_WASM = "/wasm/standalone/mock/standalone_navigation_data_interface.wasm";

describe("lookupIdent against the mock WASM database", () => {
  let nav: NavigationDataInterface;

  beforeAll(async () => {
    servePublicDir();
    nav = new NavigationDataInterface(new StandaloneTransport(MOCK_WASM));
    await nav.connect();
  });

  afterAll(async () => {
    await nav.disconnect();
  });

  it("finds the COSTA waypoint south of Guatemala City", async () => {
    const result = await lookupIdent(nav, "costa");
    expect(result.message).toBe("Found 1 waypoint");
    expect(result.airport).toBeNull();
    const [costa] = result.waypoints;
    expect(costa).toMatchObject({ ident: "COSTA", region: "MG" });
    const mggt = (await nav.getAirport("MGGT"))!;
    expect(distanceNm(costa.location, mggt.location)).toBeLessThan(30);
  });

  it("returns every match for a shared ident (D114K near Cancún and San Salvador)", async () => {
    const result = await lookupIdent(nav, "D114K");
    expect(result.message).toBe("Found 2 waypoints");
    expect(result.waypoints.map((w) => w.region).sort()).toEqual(["MM", "MS"]);
    for (const w of result.waypoints) {
      expect(Number.isFinite(w.location.latitude) && Number.isFinite(w.location.longitude)).toBe(true);
    }
  });

  it("finds an airport", async () => {
    const result = await lookupIdent(nav, "MGGT");
    expect(result.airport?.ident).toBe("MGGT");
    expect(result.message).toMatch(/^Found airport MGGT/);
  });

  it("reports an unknown ident", async () => {
    await expect(lookupIdent(nav, "ZZZZZ")).resolves.toEqual({
      airport: null,
      waypoints: [],
      message: "No airport or waypoint found for ZZZZZ",
    });
  });
});
