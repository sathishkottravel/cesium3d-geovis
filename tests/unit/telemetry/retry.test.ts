import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/api/client";
import {
  backoffMs,
  describeError,
  GraphQLRequestError,
  isColdStartError,
  isUnauthorized,
  shortenMessage,
  withColdStartRetry,
} from "../../../src/telemetry/retry";

/** A clock that advances only when the retry loop sleeps. */
function fakeClock() {
  let now = 0;
  return {
    now: () => now,
    sleep: vi.fn(async (ms: number) => {
      now += ms;
    }),
  };
}

const timeout = () => Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });

describe("isColdStartError", () => {
  it.each([
    ["HTTP 502", new ApiError("x", 502)],
    ["HTTP 503", new ApiError("x", 503)],
    ["HTTP 504", new ApiError("x", 504)],
    ["network failure", new TypeError("Failed to fetch")],
    ["request timeout", timeout()],
    ["cold ADS-B producer", new GraphQLRequestError(["ADS-B producer unavailable: <!DOCTYPE html><title>502</title>"])],
  ])("retries %s", (_label, error) => {
    expect(isColdStartError(error)).toBe(true);
  });

  it.each([
    ["HTTP 401", new ApiError("x", 401)],
    ["HTTP 400", new ApiError("x", 400)],
    ["HTTP 500", new ApiError("x", 500)],
    ["other GraphQL error", new GraphQLRequestError(["Unknown aircraft"])],
    ["plain error", new Error("boom")],
  ])("does not retry %s", (_label, error) => {
    expect(isColdStartError(error)).toBe(false);
  });
});

describe("withColdStartRetry", () => {
  it("returns the first success", async () => {
    const clock = fakeClock();
    const fn = vi.fn().mockRejectedValueOnce(new ApiError("x", 502)).mockResolvedValue("ok");
    await expect(withColdStartRetry(fn, clock)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("backs off 2, 4, 8, then 10 s and reports each attempt", async () => {
    const clock = fakeClock();
    const onAttempt = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new ApiError("x", 503))
      .mockRejectedValueOnce(timeout())
      .mockRejectedValueOnce(new GraphQLRequestError(["ADS-B producer unavailable"]))
      .mockResolvedValue("ok");
    await withColdStartRetry(fn, { ...clock, onAttempt });
    expect(clock.sleep.mock.calls.map(([ms]) => ms)).toEqual([2_000, 4_000, 8_000, 10_000]);
    expect(onAttempt.mock.calls.map(([a]) => [a.attempt, a.elapsedMs])).toEqual([
      [1, 0],
      [2, 2_000],
      [3, 6_000],
      [4, 14_000],
    ]);
  });

  it("fails immediately on errors a waking server doesn't cause", async () => {
    const clock = fakeClock();
    const fn = vi.fn().mockRejectedValue(new ApiError("x", 401));
    await expect(withColdStartRetry(fn, clock)).rejects.toMatchObject({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it("gives up with the last error once the budget runs out", async () => {
    const clock = fakeClock();
    const fn = vi.fn().mockRejectedValue(new ApiError("x", 502));
    await expect(withColdStartRetry(fn, { ...clock, budgetMs: 30_000 })).rejects.toMatchObject({ status: 502 });
    // 2 + 4 + 8 + 10 = 24 s; another 10 s would exceed 30 s.
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("uses 10 s steps after the third retry", () => {
    expect([1, 2, 3, 4, 9].map(backoffMs)).toEqual([2_000, 4_000, 8_000, 10_000, 10_000]);
  });
});

describe("isUnauthorized", () => {
  it.each([
    ["HTTP 401", new ApiError("x", 401), true],
    ["HTTP 403", new ApiError("x", 403), true],
    ["mutation refused by a PUBLIC_READ API", new GraphQLRequestError(["API token required to start or stop tracking"]), true],
    ["HTTP 502", new ApiError("x", 502), false],
    ["other GraphQL error", new GraphQLRequestError(["Unknown aircraft"]), false],
  ])("%s → %s", (_label, error, expected) => {
    expect(isUnauthorized(error)).toBe(expected);
  });
});

describe("messages", () => {
  it("reduces an embedded HTML error page to its title", () => {
    const html = "ADS-B producer unavailable: <!DOCTYPE html>\n<html><head><title>502</title><style>";
    expect(shortenMessage(html)).toBe("ADS-B producer unavailable (502)");
    expect(new GraphQLRequestError([html]).message).toBe("ADS-B producer unavailable (502)");
  });

  it("names a rejected token without echoing request details", () => {
    expect(describeError(new ApiError("GraphQL request failed with 401", 401))).toBe("API token missing or invalid");
  });

  it("explains a network failure", () => {
    expect(describeError(new TypeError("Failed to fetch"))).toMatch(/server unreachable/);
  });
});
