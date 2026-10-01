import { ApiError } from "../api/client";

/** A GraphQL response carried `errors`; the messages are joined into one. */
export class GraphQLRequestError extends Error {
  readonly messages: string[];

  constructor(messages: string[]) {
    const short = messages.map(shortenMessage);
    super(short.join("; "));
    this.messages = short;
  }
}

/** Upstream errors can embed a whole HTML error page (e.g. "producer unavailable: <!DOCTYPE html>…<title>502</title>"). */
export function shortenMessage(message: string): string {
  const html = message.search(/<(!doctype|html)/i);
  if (html < 0) return message.length > 300 ? `${message.slice(0, 300)}…` : message;
  const title = /<title>([^<]*)<\/title>/i.exec(message)?.[1]?.trim();
  const head = message.slice(0, html).trim().replace(/:$/, "");
  return title ? `${head} (${title})` : head;
}

export interface RetryAttempt {
  /** 1-based number of the attempt that just failed. */
  attempt: number;
  elapsedMs: number;
  lastError: unknown;
}

export interface RetryOptions {
  /** Give up once this much time has passed since the first attempt. */
  budgetMs?: number;
  /** Called after a retryable failure, before waiting for the next attempt. */
  onAttempt?(attempt: RetryAttempt): void;
  /** Injectable for tests. */
  sleep?(ms: number): Promise<void>;
  now?(): number;
}

/** The API and its ADS-B producer run on Render's free tier: about a minute to wake up. */
export const COLD_START_BUDGET_MS = 90_000;
const BACKOFF_MS = [2_000, 4_000, 8_000];
const MAX_BACKOFF_MS = 10_000;

const COLD_START_MESSAGE = /producer unavailable|\b50[234]\b|timed? ?out|bad gateway|service unavailable/i;

export function backoffMs(attempt: number): number {
  return BACKOFF_MS[attempt - 1] ?? MAX_BACKOFF_MS;
}

/** True for failures a waking server produces: network errors, timeouts, 502–504, a cold upstream producer. */
export function isColdStartError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 502 || error.status === 503 || error.status === 504;
  if (error instanceof GraphQLRequestError) return COLD_START_MESSAGE.test(error.message);
  // fetch rejects with a TypeError on network failure; AbortSignal.timeout with a TimeoutError.
  if (error instanceof TypeError) return true;
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `fn`, retrying cold-start failures with backoff until `budgetMs` runs out. Other errors fail at once. */
export async function withColdStartRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { budgetMs = COLD_START_BUDGET_MS, onAttempt, sleep = defaultSleep, now = Date.now } = options;
  const started = now();
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const elapsedMs = now() - started;
      const wait = backoffMs(attempt);
      if (!isColdStartError(error) || elapsedMs + wait > budgetMs) throw error;
      onAttempt?.({ attempt, elapsedMs, lastError: error });
      await sleep(wait);
    }
  }
}

/** A user-facing message for a failed request; never includes request headers or the token. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "API token missing or invalid";
  if (error instanceof ApiError && error.status === 403) return "API token is not allowed to do this";
  if (error instanceof Error && error.name === "TimeoutError") return "Request timed out";
  if (error instanceof TypeError) return "Network error: server unreachable (or blocked by CORS)";
  return error instanceof Error ? error.message : String(error);
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}
