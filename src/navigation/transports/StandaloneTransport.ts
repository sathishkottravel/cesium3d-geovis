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

/** Local navigation data via the standalone Navigraph WASM module. */
export class StandaloneTransport implements NavigationTransport {
  readonly kind = "standalone" as const;
  private host: NavigraphWasmHost | null = null;

  constructor(private readonly wasmUrl: string) {}

  async connect(): Promise<void> {
    this.host ??= await NavigraphWasmHost.load(this.wasmUrl);
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
