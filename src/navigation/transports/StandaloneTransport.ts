import { NavigraphWasmHost } from "../navigraph/NavigraphWasmHost";
import type {
  NavigraphAirport,
  NavigraphCoordinates,
  NavigraphDatabaseInfo,
  NavigraphWaypoint,
} from "../navigraph/types";
import type { Airport, Coordinates, NavigationTransport, Waypoint } from "../types";

const toCoordinates = ({ lat, long }: NavigraphCoordinates): Coordinates => ({
  latitude: lat,
  longitude: long,
});

export interface StandaloneTransportOptions {
  kind?: "standalone" | "standalone_remote";
  /**
   * Resolves a signed Navigraph navigation data package URL. Required by the remote data build,
   * which has no navigation data until the package is downloaded into it on connect.
   */
  getNavdataUrl?: () => Promise<string>;
}

/** Navigation data via a standalone Navigraph WASM module (mock or remote build). */
export class StandaloneTransport implements NavigationTransport {
  readonly kind: "standalone" | "standalone_remote";
  private readonly getNavdataUrl?: () => Promise<string>;
  private host: NavigraphWasmHost | null = null;

  constructor(
    private readonly wasmUrl: string,
    options: StandaloneTransportOptions = {},
  ) {
    this.kind = options.kind ?? "standalone";
    this.getNavdataUrl = options.getNavdataUrl;
  }

  async connect(): Promise<void> {
    this.host ??= await NavigraphWasmHost.load(this.wasmUrl);
    if (this.getNavdataUrl) {
      // The module fetches the package through the host, then installs it.
      await this.host.call("DownloadNavigationData", { url: await this.getNavdataUrl() });
    }
    // Round-trip a cheap call to confirm the module and its database respond.
    await this.host.call<NavigraphDatabaseInfo>("GetDatabaseInfo");
  }

  async disconnect(): Promise<void> {
    this.host?.dispose();
    this.host = null;
  }

  async getAirport(ident: string): Promise<Airport | null> {
    let airport: NavigraphAirport;
    try {
      airport = await this.requireHost().call<NavigraphAirport>("GetAirport", { ident });
    } catch {
      // The module reports a generic error when the ident is not in the database.
      return null;
    }
    return {
      ident: airport.ident,
      name: airport.name,
      location: toCoordinates(airport.location),
      elevationFt: airport.elevation,
    };
  }

  async searchWaypoints(query: string): Promise<Waypoint[]> {
    const waypoints = await this.requireHost().call<NavigraphWaypoint[]>("GetWaypoints", {
      ident: query.toUpperCase(),
    });
    return waypoints.map((wp) => ({
      ident: wp.ident,
      region: wp.icao_code,
      location: toCoordinates(wp.location),
    }));
  }

  private requireHost(): NavigraphWasmHost {
    if (!this.host) throw new Error("standalone transport is not connected");
    return this.host;
  }
}
