import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavigraphWasmHost } from "../../../src/navigation/navigraph/NavigraphWasmHost";
import { StandaloneTransport } from "../../../src/navigation/transports/StandaloneTransport";

vi.mock("../../../src/navigation/navigraph/NavigraphWasmHost", () => ({
  NavigraphWasmHost: { load: vi.fn() },
}));

const host = { call: vi.fn(), dispose: vi.fn() };
const load = vi.mocked(NavigraphWasmHost.load);

beforeEach(() => {
  host.call.mockReset().mockResolvedValue({ airac_cycle: "2401" });
  host.dispose.mockReset();
  load.mockReset().mockResolvedValue(host as unknown as NavigraphWasmHost);
});

describe("StandaloneTransport (mock data build)", () => {
  it("defaults to kind standalone", () => {
    expect(new StandaloneTransport("/a.wasm").kind).toBe("standalone");
  });

  it("loads the module and probes the database on connect", async () => {
    await new StandaloneTransport("/wasm/mock.wasm").connect();
    expect(load).toHaveBeenCalledWith("/wasm/mock.wasm");
    expect(host.call.mock.calls.map(([fn]) => fn)).toEqual(["GetDatabaseInfo"]);
  });

  it("reuses the loaded module on reconnect", async () => {
    const transport = new StandaloneTransport("/wasm/mock.wasm");
    await transport.connect();
    await transport.connect();
    expect(load).toHaveBeenCalledOnce();
  });

  it("fails connect when the database probe fails", async () => {
    host.call.mockRejectedValue(new Error("no database"));
    await expect(new StandaloneTransport("/wasm/mock.wasm").connect()).rejects.toThrow("no database");
  });

  it("rejects queries before connect", async () => {
    const transport = new StandaloneTransport("/wasm/mock.wasm");
    // getAirport swallows errors into null, so the guard is observable on searchWaypoints.
    await expect(transport.getAirport("MGGT")).resolves.toBeNull();
    await expect(transport.searchWaypoints("ABC")).rejects.toThrow("standalone transport is not connected");
  });

  it("disposes the host on disconnect and loads a fresh one on the next connect", async () => {
    const transport = new StandaloneTransport("/wasm/mock.wasm");
    await transport.connect();
    await transport.disconnect();
    expect(host.dispose).toHaveBeenCalledOnce();
    await transport.connect();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("maps Navigraph airports to the app model", async () => {
    const transport = new StandaloneTransport("/wasm/mock.wasm");
    await transport.connect();
    host.call.mockResolvedValueOnce({
      ident: "MGGT",
      icao_code: "MG",
      area_code: "SAM",
      name: "LA AURORA",
      location: { lat: 14.583, long: -90.527 },
      elevation: 4952,
    });

    await expect(transport.getAirport("MGGT")).resolves.toEqual({
      ident: "MGGT",
      name: "LA AURORA",
      location: { latitude: 14.583, longitude: -90.527 },
      elevationFt: 4952,
    });
    expect(host.call).toHaveBeenLastCalledWith("GetAirport", { ident: "MGGT" });
  });

  it("returns null when the module errors for an unknown airport", async () => {
    const transport = new StandaloneTransport("/wasm/mock.wasm");
    await transport.connect();
    host.call.mockRejectedValueOnce(new Error("Query returned no rows"));
    await expect(transport.getAirport("ZZZZ")).resolves.toBeNull();
  });

  it("upper-cases waypoint queries and maps results", async () => {
    const transport = new StandaloneTransport("/wasm/mock.wasm");
    await transport.connect();
    host.call.mockResolvedValueOnce([
      { ident: "ABC", icao_code: "MM", area_code: "SAM", location: { lat: 21, long: -86.9 } },
    ]);

    await expect(transport.searchWaypoints("abc")).resolves.toEqual([
      { ident: "ABC", region: "MM", location: { latitude: 21, longitude: -86.9 } },
    ]);
    expect(host.call).toHaveBeenLastCalledWith("GetWaypoints", { ident: "ABC" });
  });
});

describe("StandaloneTransport.getWaypointsInRange", () => {
  it("queries the module by center and range and maps the waypoints", async () => {
    const transport = new StandaloneTransport("/wasm/mock.wasm");
    await transport.connect();
    host.call.mockResolvedValueOnce([
      { ident: "PAULE", icao_code: "MM", area_code: "LAM", location: { lat: 19.8, long: -87.4 } },
      { ident: "UN545", icao_code: "MM", area_code: "LAM", airport_ident: "MMUN", location: { lat: 21.08, long: -86.95 } },
    ]);

    await expect(transport.getWaypointsInRange({ latitude: 20, longitude: -87 }, 21)).resolves.toEqual([
      { ident: "PAULE", region: "MM", location: { latitude: 19.8, longitude: -87.4 } },
      { ident: "UN545", region: "MM", airportIdent: "MMUN", location: { latitude: 21.08, longitude: -86.95 } },
    ]);
    expect(host.call).toHaveBeenLastCalledWith("GetWaypointsInRange", { center: { lat: 20, long: -87 }, range: 21 });
  });

  it("rejects before connect", async () => {
    await expect(
      new StandaloneTransport("/wasm/mock.wasm").getWaypointsInRange({ latitude: 0, longitude: 0 }, 10),
    ).rejects.toThrow("not connected");
  });
});

describe("StandaloneTransport (remote data build)", () => {
  it("uses the given kind", () => {
    expect(new StandaloneTransport("/a.wasm", { kind: "standalone_remote" }).kind).toBe("standalone_remote");
  });

  it("downloads the navigation data package before probing the database", async () => {
    const getNavdataUrl = vi.fn(async () => "https://packages.example.test/nav.zip?sig=1");
    await new StandaloneTransport("/wasm/remote.wasm", { kind: "standalone_remote", getNavdataUrl }).connect();

    expect(host.call.mock.calls).toEqual([
      ["DownloadNavigationData", { url: "https://packages.example.test/nav.zip?sig=1" }],
      ["GetDatabaseInfo"],
    ]);
  });

  it("requests a fresh package URL on every connect", async () => {
    const getNavdataUrl = vi.fn(async () => "https://packages.example.test/nav.zip");
    const transport = new StandaloneTransport("/wasm/remote.wasm", { getNavdataUrl });
    await transport.connect();
    await transport.connect();
    expect(getNavdataUrl).toHaveBeenCalledTimes(2);
  });

  it("fails connect when the backend cannot issue a package URL", async () => {
    const getNavdataUrl = vi.fn().mockRejectedValue(new Error("GET /navdata/package-url failed with 503"));
    const transport = new StandaloneTransport("/wasm/remote.wasm", { getNavdataUrl });
    await expect(transport.connect()).rejects.toThrow("503");
    expect(host.call).not.toHaveBeenCalled();
  });

  it("fails connect when the download fails", async () => {
    host.call.mockRejectedValueOnce(new Error("404 Not Found"));
    const transport = new StandaloneTransport("/wasm/remote.wasm", { getNavdataUrl: async () => "https://x" });
    await expect(transport.connect()).rejects.toThrow("404 Not Found");
  });
});
