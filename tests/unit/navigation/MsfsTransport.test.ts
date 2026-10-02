import { describe, expect, it, vi } from "vitest";
import { MsfsTransport } from "../../../src/navigation/transports/MsfsTransport";
import { WaypointsUnavailableError } from "../../../src/navigation/types";
import { EMPTY_WASM } from "../../helpers";

describe("MsfsTransport", () => {
  it("has kind msfs", () => {
    expect(new MsfsTransport("/wasm/msfs.wasm").kind).toBe("msfs");
  });

  it("rejects queries before connect", async () => {
    const transport = new MsfsTransport("/wasm/msfs.wasm");
    await expect(transport.getAirport("MGGT")).rejects.toThrow("msfs transport is not connected");
    await expect(transport.searchWaypoints("ABC")).rejects.toThrow("msfs transport is not connected");
  });

  it("reports queries as not implemented once connected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(EMPTY_WASM)));
    const transport = new MsfsTransport("/wasm/msfs.wasm");
    await transport.connect();
    await expect(transport.getAirport("MGGT")).rejects.toThrow("msfs: getAirport is not implemented yet");
    await expect(transport.searchWaypoints("ABC")).rejects.toThrow(
      "msfs: searchWaypoints is not implemented yet",
    );
  });

  it("reports waypoints in range as unavailable once connected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(EMPTY_WASM)));
    const transport = new MsfsTransport("/wasm/msfs.wasm");
    await transport.connect();
    await expect(transport.getWaypointsInRange({ latitude: 0, longitude: 0 }, 10)).rejects.toBeInstanceOf(
      WaypointsUnavailableError,
    );
  });

  it("is disconnected again after disconnect", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(EMPTY_WASM)));
    const transport = new MsfsTransport("/wasm/msfs.wasm");
    await transport.connect();
    await transport.disconnect();
    await expect(transport.getAirport("MGGT")).rejects.toThrow("not connected");
  });
});
