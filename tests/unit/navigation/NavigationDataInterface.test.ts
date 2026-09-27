import { describe, expect, it, vi } from "vitest";
import { NavigationDataInterface } from "../../../src/navigation/NavigationDataInterface";
import type { NavigationTransport } from "../../../src/navigation/types";

function fakeTransport(overrides: Partial<NavigationTransport> = {}): NavigationTransport {
  return {
    kind: "standalone",
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getAirport: vi.fn(async () => null),
    searchWaypoints: vi.fn(async () => []),
    ...overrides,
  };
}

describe("NavigationDataInterface", () => {
  it("exposes the transport kind and starts disconnected", () => {
    const nav = new NavigationDataInterface(fakeTransport({ kind: "msfs" }));
    expect(nav.transportKind).toBe("msfs");
    expect(nav.connectionState).toBe("disconnected");
    expect(nav.error).toBeNull();
  });

  it("is connecting while the transport connects, then connected", async () => {
    let finish!: () => void;
    const transport = fakeTransport({ connect: () => new Promise<void>((r) => (finish = r)) });
    const nav = new NavigationDataInterface(transport);

    const connecting = nav.connect();
    expect(nav.connectionState).toBe("connecting");
    finish();
    await connecting;
    expect(nav.connectionState).toBe("connected");
  });

  it("records and rethrows connect errors", async () => {
    const nav = new NavigationDataInterface(
      fakeTransport({ connect: vi.fn().mockRejectedValue(new Error("boom")) }),
    );
    await expect(nav.connect()).rejects.toThrow("boom");
    expect(nav.connectionState).toBe("error");
    expect(nav.error?.message).toBe("boom");
  });

  it("wraps non-Error rejections", async () => {
    const nav = new NavigationDataInterface(fakeTransport({ connect: vi.fn().mockRejectedValue("nope") }));
    await expect(nav.connect()).rejects.toBeInstanceOf(Error);
    expect(nav.error?.message).toBe("nope");
  });

  it("clears the error after a successful reconnect", async () => {
    const connect = vi.fn().mockRejectedValueOnce(new Error("first")).mockResolvedValueOnce(undefined);
    const nav = new NavigationDataInterface(fakeTransport({ connect }));
    await expect(nav.connect()).rejects.toThrow();
    await nav.connect();
    expect(nav.connectionState).toBe("connected");
    expect(nav.error).toBeNull();
  });

  it("disconnects", async () => {
    const transport = fakeTransport();
    const nav = new NavigationDataInterface(transport);
    await nav.connect();
    await nav.disconnect();
    expect(transport.disconnect).toHaveBeenCalledOnce();
    expect(nav.connectionState).toBe("disconnected");
  });

  it("normalizes airport idents to trimmed upper case", async () => {
    const transport = fakeTransport();
    await new NavigationDataInterface(transport).getAirport("  mggt ");
    expect(transport.getAirport).toHaveBeenCalledWith("MGGT");
  });

  it("trims waypoint queries and forwards the reference position", async () => {
    const transport = fakeTransport();
    const near = { latitude: 14.58, longitude: -90.52 };
    await new NavigationDataInterface(transport).searchWaypoints("  abc ", near);
    expect(transport.searchWaypoints).toHaveBeenCalledWith("abc", near);
  });
});
