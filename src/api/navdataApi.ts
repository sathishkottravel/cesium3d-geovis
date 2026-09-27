import type { ApiClient } from "./client";

/** Response of `GET <apiBaseUrl>/navdata/package-url`. */
interface NavdataPackageUrlResponse {
  url: string;
}

/**
 * Asks the backend for a signed Navigraph navigation data package URL.
 * Signed URLs expire and need Navigraph credentials, so the backend issues a fresh one per request.
 */
export async function getNavdataPackageUrl(client: ApiClient): Promise<string> {
  const { url } = await client.get<NavdataPackageUrlResponse>("navdata/package-url");
  if (typeof url !== "string" || !url) throw new Error("Backend returned no navigation data package URL");
  return url;
}
