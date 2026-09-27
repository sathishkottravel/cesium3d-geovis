export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  /** Sent as `Authorization: Bearer <token>` when set. */
  token?: string;
}

/** Minimal JSON fetch wrapper for the navigation backend. */
export class ApiClient {
  private readonly headers: Record<string, string>;

  constructor(
    private readonly baseUrl: string,
    { token }: ApiClientOptions = {},
  ) {
    this.headers = { Accept: "application/json" };
    if (token) this.headers.Authorization = `Bearer ${token}`;
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new ApiError(`GET ${url.pathname} failed with ${response.status}`, response.status);
    }
    return (await response.json()) as T;
  }
}
