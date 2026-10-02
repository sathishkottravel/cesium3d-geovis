import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/api/client";
import { GraphQLClient } from "../../../src/telemetry/graphqlClient";
import { GraphQLRequestError } from "../../../src/telemetry/retry";
import { jsonResponse } from "../../helpers";

const ENDPOINT = "https://telemetry.test/graphql";

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) => responses.shift() ?? jsonResponse({ data: {} }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const noWait = { sleep: async () => {}, now: () => 0 };

function client(token = "s3cret", onRetry = vi.fn()) {
  return new GraphQLClient(ENDPOINT, { getToken: () => token, onRetry, retry: noWait });
}

describe("GraphQLClient.request", () => {
  it("POSTs the query and variables with a bearer token", async () => {
    const fetchMock = stubFetch(jsonResponse({ data: { ok: true } }));
    await expect(client().request("query Q { ok }", { a: 1 })).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json", Authorization: "Bearer s3cret" });
    expect(JSON.parse(String(init?.body))).toEqual({ query: "query Q { ok }", variables: { a: 1 } });
  });

  it("sends no Authorization header without a token (the dev proxy adds it)", async () => {
    const fetchMock = stubFetch(jsonResponse({ data: { ok: true } }));
    await client("").request("{ ok }");
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
  });

  it("throws GraphQL errors", async () => {
    stubFetch(jsonResponse({ data: null, errors: [{ message: "Unknown aircraft" }, { message: "second" }] }));
    const error = await client()
      .request("{ x }")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GraphQLRequestError);
    expect((error as Error).message).toBe("Unknown aircraft; second");
  });

  it("throws ApiError on HTTP errors, without retrying a 401", async () => {
    const fetchMock = stubFetch(jsonResponse({ detail: "Missing or invalid API token" }, 401));
    const error = await client()
      .request("{ x }")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries while the server wakes up and reports the attempts", async () => {
    const onRetry = vi.fn();
    stubFetch(
      new Response("<html>502</html>", { status: 502 }),
      jsonResponse({ data: null, errors: [{ message: "ADS-B producer unavailable: <!DOCTYPE html>" }] }),
      jsonResponse({ data: { ok: true } }),
    );
    await expect(client("t", onRetry).request("{ ok }")).resolves.toEqual({ ok: true });
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("checks health next to the GraphQL endpoint", async () => {
    const fetchMock = stubFetch(jsonResponse({ status: "ok" }));
    await client().health();
    expect(fetchMock.mock.calls[0][0]).toBe("https://telemetry.test/health");
  });
});
