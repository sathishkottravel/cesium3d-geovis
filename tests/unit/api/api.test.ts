import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "../../../src/api/client";
import { getNavdataPackageUrl } from "../../../src/api/navdataApi";
import { createNavigationApi } from "../../../src/api/navigationApi";
import { ApiTransport } from "../../../src/navigation/transports/ApiTransport";
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

describe("navigation API", () => {
  const api = () => createNavigationApi(new ApiClient("https://x.test"));

  it("fetches airports by encoded ident", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ ident: "MGGT" }));
    await expect(api().getAirport("MG/GT")).resolves.toEqual({ ident: "MGGT" });
    expect(requestedUrl(fetchMock)).toBe("https://x.test/airports/MG%2FGT");
  });

  it("returns null for a 404 airport", async () => {
    stubFetch(() => new Response(null, { status: 404 }));
    await expect(api().getAirport("ZZZZ")).resolves.toBeNull();
  });

  it("rethrows other airport errors", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    await expect(api().getAirport("MGGT")).rejects.toBeInstanceOf(ApiError);
  });

  it("passes the reference position to waypoint search", async () => {
    const fetchMock = stubFetch(() => jsonResponse([]));
    await api().searchWaypoints("ABC", { latitude: 14.5, longitude: -90.5 });
    expect(requestedUrl(fetchMock)).toBe("https://x.test/waypoints?q=ABC&lat=14.5&lon=-90.5");
  });

  it("omits the position when none is given", async () => {
    const fetchMock = stubFetch(() => jsonResponse([]));
    await api().searchWaypoints("ABC");
    expect(requestedUrl(fetchMock)).toBe("https://x.test/waypoints?q=ABC");
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

  it("checks backend health on connect", async () => {
    const fetchMock = stubFetch();
    await new ApiTransport("https://x.test/api/v1").connect();
    expect(requestedUrl(fetchMock)).toBe("https://x.test/api/v1/health");
  });

  it("fails connect when the backend is unhealthy", async () => {
    stubFetch(() => new Response(null, { status: 502 }));
    await expect(new ApiTransport("https://x.test").connect()).rejects.toBeInstanceOf(ApiError);
  });

  it("delegates queries to the backend", async () => {
    const airport = { ident: "MGGT", name: "La Aurora", location: { latitude: 14.58, longitude: -90.53 } };
    stubFetch((url) => jsonResponse(url.pathname.startsWith("/airports/") ? airport : []));
    const transport = new ApiTransport("https://x.test");
    await expect(transport.getAirport("MGGT")).resolves.toEqual(airport);
    await expect(transport.searchWaypoints("ABC")).resolves.toEqual([]);
  });
});
