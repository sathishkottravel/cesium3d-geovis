import type { Airport, Coordinates, NavigationTransport, TransportKind, Waypoint } from "./types";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

/** Facade the React layer talks to; hides which transport is in use. */
export class NavigationDataInterface {
  private state: ConnectionState = "disconnected";
  private lastError: Error | null = null;

  constructor(private readonly transport: NavigationTransport) {}

  get transportKind(): TransportKind {
    return this.transport.kind;
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  get error(): Error | null {
    return this.lastError;
  }

  async connect(): Promise<void> {
    this.state = "connecting";
    try {
      await this.transport.connect();
      this.state = "connected";
      this.lastError = null;
    } catch (err) {
      this.state = "error";
      this.lastError = err instanceof Error ? err : new Error(String(err));
      throw this.lastError;
    }
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.state = "disconnected";
  }

  getAirport(ident: string): Promise<Airport | null> {
    return this.transport.getAirport(ident.trim().toUpperCase());
  }

  searchWaypoints(query: string, near?: Coordinates): Promise<Waypoint[]> {
    return this.transport.searchWaypoints(query.trim(), near);
  }

  getWaypointsInRange(center: Coordinates, rangeNm: number): Promise<Waypoint[]> {
    return this.transport.getWaypointsInRange(center, rangeNm);
  }
}
