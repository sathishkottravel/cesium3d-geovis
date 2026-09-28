import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "../../../src/api/client";
import { getNavdataPackageUrl } from "../../../src/api/navdataApi";
import { createNavigationApi } from "../../../src/api/navigationApi";
import { ApiTransport } from "../../../src/navigation/transports/ApiTransport";
import { WaypointsUnavailableError } from "../../../src/navigation/types";
import { COSTA_APP, COSTA_NAVIGRAPH, MGGT_APP, MGGT_NAVIGRAPH } from "../../fixtures/navigraph";
import { jsonResponse } from "../../helpers";

function stubFetch(respond: (url: URL) => Response = () => jsonResponse({})) {
  const fetchMock = vi.fn(async (url: URL, _init?: RequestInit) => respond(url));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const requestedUrl = (fetchMock: ReturnType<typeof stubFetch>, call = 0) => String(fetchMock.mock.calls[call][0]);

describe("ApiClient", () => {
  it.each([
    ["https://nav.example.com/api/v1", "health"],
    ["https://nav.example.com/api/v1/", "/health"],
  ])("joins base %j and path %j with a single slash", async (base, path) => {
    const fetchMock = stubFetch();
    await new ApiClient(base).get(path);
    expect(requestedUrl(fetchMock)).toBe("https://nav.example.com/api/v1/health");
  });

  it("sends Accept: application/json", async () => {
    const fetchMock = stubFetch();
    await new ApiClient("https://x.test").get("health");
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Accept: "application/json" } });
  });

  it("sends a bearer token when configured", async () => {
    const fetchMock = stubFetch();
    await new ApiClient("https://x.test", { token: "s3cret" }).get("health");
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Accept: "application/json", Authorization: "Bearer s3cret" },
    });
  });

  it("does not send Authorization for an empty token", async () => {
    const fetchMock = stubFetch();
    await new ApiClient("https://x.test", { token: "" }).get("health");
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Accept: "application/json" } });
  });

  it("does not put the token in error messages", async () => {
    stubFetch(() => new Response(null, { status: 401 }));
    const err = await new ApiClient("https://x.test", { token: "s3cret" }).get("health").catch((e: Error) => e);
    expect((err as Error).message).not.toContain("s3cret");
  });

  it("encodes params and skips undefined ones", async () => {
    const fetchMock = stubFetch();
    await new ApiClient("https://x.test").get("waypoints", { q: "a b", lat: 1.5, lon: undefined });
    expect(requestedUrl(fetchMock)).toBe("https://x.test/waypoints?q=a+b&lat=1.5");
  });

  it("parses JSON bodies", async () => {
    stubFetch(() => jsonResponse({ ok: true }));
    await expect(new ApiClient("https://x.test").get("health")).resolves.toEqual({ ok: true });
  });

  it("throws ApiError with the HTTP status", async () => {
    stubFetch(() => new Response(null, { status: 503 }));
    const err = await new ApiClient("https://x.test/api").get("health").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(503);
    expect((err as ApiError).message).toBe("GET /api/health failed with 503");
  });
});

describe("navigation API (standalone-demo backend, Navigraph-shaped responses)", () => {
  const api = () => createNavigationApi(new ApiClient("http://localhost:3000/api/mock"));

  it("maps a Navigraph airport to the app model", async () => {
    const fetchMock = stubFetch(() => jsonResponse(MGGT_NAVIGRAPH));
    await expect(api().getAirport("MGGT")).resolves.toEqual(MGGT_APP);
    expect(requestedUrl(fetchMock)).toBe("http://localhost:3000/api/mock/airports/MGGT");
  });

  it("encodes the airport ident", async () => {
    const fetchMock = stubFetch(() => jsonResponse(MGGT_NAVIGRAPH));
    await api().getAirport("MG/GT");
    expect(requestedUrl(fetchMock)).toBe("http://localhost:3000/api/mock/airports/MG%2FGT");
  });

  it.each([
    [404, "unknown airport"],
    [400, "malformed ident"],
  ])("returns null for %i (%s)", async (status) => {
    stubFetch(() => new Response(null, { status }));
    await expect(api().getAirport("ZZZZ")).resolves.toBeNull();
  });

  it.each([500, 503])("rethrows %i airport errors", async (status) => {
    stubFetch(() => new Response(null, { status }));
    await expect(api().getAirport("MGGT")).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects an app-shaped (non-Navigraph) airport instead of returning NaN coordinates", async () => {
    stubFetch(() => jsonResponse({ ident: "MGGT", name: "X", location: { latitude: 14.5, longitude: -90.5 } }));
    await expect(api().getAirport("MGGT")).rejects.toThrow("Unexpected navigation data: missing location");
  });

  it("looks up waypoints by upper-cased, encoded ident and maps them", async () => {
    const fetchMock = stubFetch(() => jsonResponse([COSTA_NAVIGRAPH]));
    await expect(api().searchWaypoints("costa")).resolves.toEqual([COSTA_APP]);
    expect(requestedUrl(fetchMock)).toBe("http://localhost:3000/api/mock/waypoints/COSTA");
  });

  it("does not send the reference position (the backend has no position filter)", async () => {
    const fetchMock = stubFetch(() => jsonResponse([]));
    await api().searchWaypoints("a b", { latitude: 14.5, longitude: -90.5 });
    expect(requestedUrl(fetchMock)).toBe("http://localhost:3000/api/mock/waypoints/A%20B");
  });

  it.each([404, 400])("returns no waypoints for %i", async (status) => {
    stubFetch(() => new Response(null, { status }));
    await expect(api().searchWaypoints("ZZZZZ")).resolves.toEqual([]);
  });

  it("rethrows other waypoint errors", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    await expect(api().searchWaypoints("COSTA")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("getNavdataPackageUrl (standalone_remote backend)", () => {
  it("returns the signed URL", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ url: "https://packages.test/nav.zip?sig=1" }));
    await expect(getNavdataPackageUrl(new ApiClient("https://x.test/api/v1"))).resolves.toBe(
      "https://packages.test/nav.zip?sig=1",
    );
    expect(requestedUrl(fetchMock)).toBe("https://x.test/api/v1/navdata/package-url");
  });

  it.each([{}, { url: "" }, { url: 42 }])("rejects a malformed response %j", async (body) => {
    stubFetch(() => jsonResponse(body));
    await expect(getNavdataPackageUrl(new ApiClient("https://x.test"))).rejects.toThrow(
      "Backend returned no navigation data package URL",
    );
  });

  it("propagates backend errors", async () => {
    stubFetch(() => new Response(null, { status: 401 }));
    await expect(getNavdataPackageUrl(new ApiClient("https://x.test"))).rejects.toBeInstanceOf(ApiError);
  });
});

describe("ApiTransport", () => {
  it("has kind api", () => {
    expect(new ApiTransport("https://x.test").kind).toBe("api");
  });

  it("passes the token to every request", async () => {
    const fetchMock = stubFetch((url) => jsonResponse(url.pathname.startsWith("/waypoints/") ? [] : {}));
    const transport = new ApiTransport("https://x.test", { token: "tok" });
    await transport.connect();
    await transport.searchWaypoints("ABC");
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer tok" });
    }
  });

  it("reports waypoints in range as unavailable (no such endpoint)", async () => {
    const fetchMock = stubFetch();
    const result = new ApiTransport("https://x.test").getWaypointsInRange({ latitude: 0, longitude: 0 }, 10);
    await expect(result).rejects.toBeInstanceOf(WaypointsUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks backend health on connect", async () => {
    const fetchMock = stubFetch();
    await new ApiTransport("https://x.test/api/v1").connect();
    expect(requestedUrl(fetchMock)).toBe("https://x.test/api/v1/health");
  });

  it("fails connect when the backend is unhealthy", async () => {
    stubFetch(() => new Response(null, { status: 502 }));
    await expect(new ApiTransport("https://x.test").connect()).rejects.toBeInstanceOf(ApiError);
  });

  it("returns app-model airports and waypoints from the backend", async () => {
    stubFetch((url) => jsonResponse(url.pathname.includes("/airports/") ? MGGT_NAVIGRAPH : [COSTA_NAVIGRAPH]));
    const transport = new ApiTransport("http://localhost:3000/api/mock");
    await expect(transport.getAirport("MGGT")).resolves.toEqual(MGGT_APP);
    await expect(transport.searchWaypoints("COSTA")).resolves.toEqual([COSTA_APP]);
  });
});
