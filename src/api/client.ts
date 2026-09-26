export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Minimal JSON fetch wrapper for the navigation backend. */
export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new ApiError(`GET ${url.pathname} failed with ${response.status}`, response.status);
    }
    return (await response.json()) as T;
  }
}
