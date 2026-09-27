import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NavigationDataInterface } from "../../src/navigation/NavigationDataInterface";
import { NavigraphWasmHost } from "../../src/navigation/navigraph/NavigraphWasmHost";
import type { NavigraphDatabaseInfo } from "../../src/navigation/navigraph/types";
import { StandaloneTransport } from "../../src/navigation/transports/StandaloneTransport";
import { servePublicDir } from "../helpers";

const MOCK_WASM = "/wasm/standalone/mock/standalone_navigation_data_interface.wasm";

describe("standalone transport against the mock WASM build", () => {
  let nav: NavigationDataInterface;

  beforeEach(async () => {
    servePublicDir();
    nav = new NavigationDataInterface(new StandaloneTransport(MOCK_WASM));
    await nav.connect();
  });

  afterEach(async () => {
    await nav.disconnect();
  });

  it("connects", () => {
    expect(nav.connectionState).toBe("connected");
    expect(nav.transportKind).toBe("standalone");
  });

  it.each(["MGGT", "MMUN", "MSLP"])("finds airport %s in the mock database", async (ident) => {
    const airport = await nav.getAirport(ident.toLowerCase());
    expect(airport).not.toBeNull();
    expect(airport!.ident).toBe(ident);
    expect(airport!.name).toBeTruthy();
    // Mock data covers Mexico and Central America.
    expect(airport!.location.latitude).toBeGreaterThan(5);
    expect(airport!.location.latitude).toBeLessThan(33);
    expect(airport!.location.longitude).toBeGreaterThan(-118);
    expect(airport!.location.longitude).toBeLessThan(-77);
  });

  it("returns null for an airport outside the mock database", async () => {
    await expect(nav.getAirport("EGLL")).resolves.toBeNull();
  });

  it("returns an array from a waypoint search", async () => {
    const waypoints = await nav.searchWaypoints("zzzzz");
    expect(Array.isArray(waypoints)).toBe(true);
  });
});

describe("NavigraphWasmHost against the mock WASM build", () => {
  it("reports AIRAC cycle 2401", async () => {
    servePublicDir();
    const host = await NavigraphWasmHost.load(MOCK_WASM);
    try {
      const info = await host.call<NavigraphDatabaseInfo>("GetDatabaseInfo");
      expect(info.airac_cycle).toBe("2401");
    } finally {
      host.dispose();
    }
  });

  it("rejects pending calls on dispose", async () => {
    servePublicDir();
    const host = await NavigraphWasmHost.load(MOCK_WASM);
    const call = host.call("GetDatabaseInfo");
    host.dispose();
    await expect(call).rejects.toThrow(/disposed/);
  });
});
