import { createClient, type Client } from "graphql-ws";
import { ApiError } from "../api/client";
import { toWebSocketUrl } from "../config/appConfig";
import { backoffMs, GraphQLRequestError, withColdStartRetry, type RetryAttempt, type RetryOptions } from "./retry";

export type Variables = Record<string, unknown>;

export type SocketEvent = "connecting" | "connected" | "closed";

/** The subscription socket closed with an error code (e.g. 4403 when the token is rejected). */
export class SocketClosedError extends Error {
  constructor(
    readonly code: number,
    reason: string,
  ) {
    super(`Live connection closed (${code}${reason ? `: ${reason}` : ""})`);
  }
}

export interface GraphQLClientOptions {
  /** Read on every request and socket (re)connect, so an edited token applies without a new client. Empty: no header. */
  getToken(): string;
  /**
   * Token for the subscription socket when `getToken()` is empty. The API reads it only from the
   * `connection_init` payload, so a proxy can't add it; in dev it comes from the Vite dev server.
   */
  socketToken?(): Promise<string>;
  /** Each retryable failure while the server wakes up. */
  onRetry?(attempt: RetryAttempt): void;
  onSocket?(event: SocketEvent): void;
  /** Per-attempt request timeout. */
  timeoutMs?: number;
  retry?: Pick<RetryOptions, "budgetMs" | "sleep" | "now">;
}

export interface Sink<T> {
  next(data: T): void;
  error(error: Error): void;
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: { message: string }[];
}

/** GraphQL over HTTP (queries, mutations) and graphql-ws (subscriptions), with cold-start retries. */
export class GraphQLClient {
  private ws: Client | null = null;

  constructor(
    readonly url: string,
    private readonly options: GraphQLClientOptions,
  ) {}

  private authHeader(): Record<string, string> {
    const token = this.options.getToken().trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private retrying<T>(fn: () => Promise<T>): Promise<T> {
    return withColdStartRetry(fn, { ...this.options.retry, onAttempt: this.options.onRetry });
  }

  private signal(): AbortSignal {
    return AbortSignal.timeout(this.options.timeoutMs ?? 20_000);
  }

  request<T>(query: string, variables: Variables = {}): Promise<T> {
    return this.retrying(async () => {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...this.authHeader() },
        body: JSON.stringify({ query, variables }),
        signal: this.signal(),
      });
      if (!response.ok) {
        throw new ApiError(`GraphQL request failed with ${response.status}`, response.status);
      }
      const body = (await response.json()) as GraphQLResponse<T>;
      if (body.errors?.length) throw new GraphQLRequestError(body.errors.map((e) => e.message));
      if (!body.data) throw new GraphQLRequestError(["Empty GraphQL response"]);
      return body.data;
    });
  }

  /** `GET <base>/health` next to the GraphQL endpoint; starts waking the server before the user asks for data. */
  health(): Promise<void> {
    const url = this.url.replace(/\/graphql\/?$/, "/health");
    return this.retrying(async () => {
      const response = await fetch(url, { headers: this.authHeader(), signal: this.signal() });
      if (!response.ok) throw new ApiError(`Health check failed with ${response.status}`, response.status);
    });
  }

  /** Starts a subscription on the shared socket; returns a function that ends it. */
  subscribe<T>(query: string, variables: Variables, sink: Sink<T>): () => void {
    return this.socket().subscribe<T>(
      { query, variables },
      {
        next: (result) => {
          if (result.errors?.length) sink.error(new GraphQLRequestError(result.errors.map((e) => e.message)));
          else if (result.data) sink.next(result.data);
        },
        error: (error) => sink.error(toError(error)),
        complete: () => {},
      },
    );
  }

  dispose(): void {
    void this.ws?.dispose();
    this.ws = null;
  }

  private socket(): Client {
    if (this.ws) return this.ws;
    const { onSocket } = this.options;
    this.ws = createClient({
      url: toWebSocketUrl(this.url, globalThis.location?.href),
      lazy: true,
      // A function, so reconnects send the current token. The server reads it from connection_init only.
      connectionParams: async () => {
        const token = this.options.getToken().trim() || (await this.options.socketToken?.()) || "";
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      // Without a valid token the server never acknowledges; fail (and retry) instead of hanging.
      connectionAckWaitTimeout: 15_000,
      retryAttempts: 10,
      retryWait: (retries) => new Promise((resolve) => setTimeout(resolve, backoffMs(retries + 1))),
      on: {
        connecting: () => onSocket?.("connecting"),
        connected: () => onSocket?.("connected"),
        closed: () => onSocket?.("closed"),
      },
    });
    return this.ws;
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (Array.isArray(error)) return new GraphQLRequestError(error.map((e) => String(e?.message ?? e)));
  if (error && typeof error === "object" && "code" in error) {
    const { code, reason } = error as { code: number; reason?: string };
    return new SocketClosedError(code, reason ?? "");
  }
  return new Error(String(error));
}
