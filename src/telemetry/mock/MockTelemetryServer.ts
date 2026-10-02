import type { Sink, Variables } from "../graphqlClient";
import type {
  AircraftInAreaResult,
  AreaQuery,
  FlightByIdResult,
  LiveTelemetryResult,
  StartTrackingResult,
  StopTrackingResult,
  Telemetry,
  TrackableAircraft,
  TrackingStatus,
  TrackingStatusResult,
} from "../operations";
import { SAMPLE_AIRCRAFT, SAMPLE_CENTER, SAMPLE_FETCHED_AT, type SampleAircraft } from "./sampleAircraft";

type Center = Pick<AreaQuery, "latitude" | "longitude">;

/** Where an aircraft is at a moment, relative to the area center. */
export interface SamplePosition {
  latitude: number;
  longitude: number;
  /** Degrees true. */
  track: number;
  /** Knots. */
  groundSpeed: number;
  distanceNm: number;
}

interface SimulatedAircraft {
  sample: SampleAircraft;
  /** Bearing of the orbit center from the area center, radians. */
  bearing: number;
  orbitNm: number;
  speedKt: number;
  phase: number;
  /** 1 = clockwise, -1 = counter-clockwise. */
  direction: 1 | -1;
}

const EPOCH = Date.parse(SAMPLE_FETCHED_AT);
const DEFAULT_RADIUS_NM = 100;
const HISTORY_STEP_MS = 30_000;
const HISTORY_LIMIT = 40;

/** Deterministic 0…1 from a string (FNV-1a), so every run shows the same traffic. */
export function unitHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

function simulate(sample: SampleAircraft): SimulatedAircraft {
  const h = (salt: string) => unitHash(sample.icaoHex + salt);
  const onGround = sample.altitude <= 0;
  const speedKt = onGround ? 12 : sample.altitude < 10_000 ? 220 : sample.altitude < 25_000 ? 350 : 460;
  return {
    sample,
    bearing: h("bearing") * 2 * Math.PI,
    // Ground traffic taxis in a small loop; airborne traffic flies a 3–12 nm circle.
    orbitNm: onGround ? 0.25 : 3 + h("orbit") * 9,
    speedKt,
    phase: h("phase") * 2 * Math.PI,
    direction: h("direction") < 0.5 ? 1 : -1,
  };
}

const SIMULATED = SAMPLE_AIRCRAFT.map(simulate);
const BY_ID = new Map(SIMULATED.map((s) => [s.sample.icaoHex, s]));

/** Like the API: tracking accepts an ICAO hex or a callsign, case-insensitively. */
function resolve(id: string): SimulatedAircraft | undefined {
  const key = id.trim().toLowerCase();
  return BY_ID.get(key) ?? SIMULATED.find((s) => s.sample.callsign.toLowerCase() === key);
}

/**
 * Sample aircraft position: it keeps its real distance from the area center (on a fixed bearing) and
 * circles there at a plausible speed, so positions change smoothly and trails look like flight paths.
 */
export function samplePosition(aircraft: SimulatedAircraft, center: Center, time: number): SamplePosition {
  const hours = (time - EPOCH) / 3_600_000;
  const angle = aircraft.phase + (aircraft.direction * aircraft.speedKt * hours) / aircraft.orbitNm;
  const north = aircraft.sample.distanceNm * Math.cos(aircraft.bearing) + aircraft.orbitNm * Math.cos(angle);
  const east = aircraft.sample.distanceNm * Math.sin(aircraft.bearing) + aircraft.orbitNm * Math.sin(angle);
  // Velocity is the derivative of the orbit offset: direction × (−sin, cos) in (north, east).
  const track = (Math.atan2(aircraft.direction * Math.cos(angle), -aircraft.direction * Math.sin(angle)) * 180) / Math.PI;
  const cosLat = Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01);
  return {
    latitude: center.latitude + north / 60,
    longitude: center.longitude + east / (60 * cosLat),
    track: (track + 360) % 360,
    groundSpeed: aircraft.speedKt,
    distanceNm: Math.round(Math.hypot(north, east) * 1000) / 1000,
  };
}

interface Tracker {
  startedAt: string;
  publishedCount: number;
  lastPositionAt: string | null;
}

export interface MockTelemetryOptions {
  now?(): number;
  /** Live telemetry interval. */
  intervalMs?: number;
  /** Simulated network latency per request. */
  latencyMs?: number;
}

/**
 * Answers the telemetry GraphQL operations in-process from sample data (no network), for testing and
 * demos while the API or its ADS-B producer is unavailable. Same surface as GraphQLClient, and the same
 * documented behaviour: ids are an ICAO hex or a callsign (or "*"), and liveTelemetry sends the latest
 * position of every matching flight on subscribe and then periodically.
 */
export class MockTelemetryServer {
  private center: Center = SAMPLE_CENTER;
  private radiusNm = DEFAULT_RADIUS_NM;
  /** Keyed by ICAO hex, or "*". */
  private readonly trackers = new Map<string, Tracker>();
  private readonly timers = new Set<ReturnType<typeof setInterval>>();

  constructor(private readonly options: MockTelemetryOptions = {}) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  async health(): Promise<void> {}

  async request<T>(query: string, variables: Variables = {}): Promise<T> {
    const latency = this.options.latencyMs ?? 150;
    if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
    const operation = /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
    const id = String(variables.aircraftId ?? variables.flightId ?? "");
    switch (operation) {
      case "AircraftInArea":
        return this.area(variables) as T;
      case "FlightById":
        return this.flightById(id, variables.since as string | null | undefined) as T;
      case "StartTracking":
        return this.startTracking(id, variables) as T;
      case "StopTracking":
        return this.stopTracking(id) as T;
      case "TrackingStatus":
        return { trackingStatus: this.status(id) } satisfies TrackingStatusResult as T;
      default:
        throw new Error(`Sample data has no answer for operation ${operation ?? "(unnamed)"}`);
    }
  }

  /** `liveTelemetry`: on subscribe, then every interval: one flight (an ICAO hex) or every tracked flight ("*"). */
  subscribe<T>(_query: string, variables: Variables, sink: Sink<T>): () => void {
    const flightId = String(variables.flightId ?? "*").toLowerCase();
    const send = () => {
      const batch = this.liveBatch(flightId);
      if (batch.length > 0) sink.next({ liveTelemetry: batch } satisfies LiveTelemetryResult as T);
    };
    const first = setTimeout(send, 0);
    const timer = setInterval(send, this.options.intervalMs ?? 2_000);
    this.timers.add(first);
    this.timers.add(timer);
    return () => {
      for (const t of [first, timer]) {
        clearTimeout(t);
        this.timers.delete(t);
      }
    };
  }

  dispose(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.clear();
  }

  private setArea(variables: Variables): void {
    const { latitude, longitude, radiusNm } = variables;
    if (typeof latitude === "number" && typeof longitude === "number") this.center = { latitude, longitude };
    if (typeof radiusNm === "number") this.radiusNm = radiusNm;
  }

  private inArea(time: number): { aircraft: SimulatedAircraft; position: SamplePosition }[] {
    return SIMULATED.map((aircraft) => ({ aircraft, position: samplePosition(aircraft, this.center, time) }))
      .filter(({ position }) => position.distanceNm <= this.radiusNm)
      .sort((a, b) => a.position.distanceNm - b.position.distanceNm);
  }

  private isTracked(hex: string): boolean {
    return this.trackers.has(hex) || (this.trackers.has("*") && BY_ID.has(hex));
  }

  private area(variables: Variables): AircraftInAreaResult {
    this.setArea(variables);
    const time = this.now();
    const aircraft: TrackableAircraft[] = this.inArea(time).map(({ aircraft: { sample }, position }) => ({
      icaoHex: sample.icaoHex,
      callsign: sample.callsign,
      latitude: position.latitude,
      longitude: position.longitude,
      altitude: sample.altitude,
      groundSpeed: position.groundSpeed,
      track: position.track,
      distanceNm: position.distanceNm,
      tracked: this.isTracked(sample.icaoHex),
    }));
    return {
      trackableAircraft: {
        fetchedAt: new Date(time).toISOString(),
        ...this.center,
        radiusNm: this.radiusNm,
        aircraft,
      },
    };
  }

  private telemetry(aircraft: SimulatedAircraft, time: number): Telemetry {
    const position = samplePosition(aircraft, this.center, time);
    return {
      flightId: aircraft.sample.icaoHex,
      callsign: aircraft.sample.callsign,
      timestamp: new Date(time).toISOString(),
      latitude: position.latitude,
      longitude: position.longitude,
      altitude: aircraft.sample.altitude,
      groundSpeed: position.groundSpeed,
      track: position.track,
    };
  }

  private flightById(id: string, since: string | null | undefined): FlightByIdResult {
    const aircraft = BY_ID.get(id.toLowerCase());
    if (!aircraft) return { flight: null, telemetryHistory: [] };
    const now = this.now();
    const from = Math.max(since ? Date.parse(since) : now - 10 * 60_000, now - HISTORY_LIMIT * HISTORY_STEP_MS);
    const telemetryHistory = [];
    for (let time = from; time < now; time += HISTORY_STEP_MS) {
      const { flightId: _, ...point } = this.telemetry(aircraft, time);
      telemetryHistory.push(point);
    }
    // ADS-B-only traffic: the API knows no flight plan for it.
    return { flight: null, telemetryHistory };
  }

  /** The tracker key ("*" or ICAO hex) for an id, or null when the sample has no such aircraft. */
  private key(id: string): string | null {
    return id === "*" ? "*" : (resolve(id)?.sample.icaoHex ?? null);
  }

  private startTracking(id: string, variables: Variables): StartTrackingResult {
    this.setArea(variables);
    const aircraftId = id.trim().toLowerCase();
    const key = this.key(id);
    if (!key) {
      return {
        startTracking: { aircraftId, icaoHex: null, running: false, lastError: `Aircraft ${id} not in sample data` },
      };
    }
    if (!this.trackers.has(key)) {
      this.trackers.set(key, { startedAt: new Date(this.now()).toISOString(), publishedCount: 0, lastPositionAt: null });
    }
    return { startTracking: { aircraftId, icaoHex: key === "*" ? null : key, running: true, lastError: null } };
  }

  private stopTracking(id: string): StopTrackingResult {
    const key = this.key(id);
    const tracker = key ? this.trackers.get(key) : undefined;
    if (key) this.trackers.delete(key);
    return {
      stopTracking: {
        aircraftId: id.trim().toLowerCase(),
        icaoHex: key === "*" ? null : key,
        running: false,
        publishedCount: tracker?.publishedCount ?? 0,
      },
    };
  }

  private status(id: string): TrackingStatus {
    const key = this.key(id);
    const tracker = key ? this.trackers.get(key) : undefined;
    const inArea = key === "*" ? true : this.inArea(this.now()).some(({ aircraft }) => aircraft.sample.icaoHex === key);
    return {
      aircraftId: id.trim().toLowerCase(),
      icaoHex: key === "*" ? null : key,
      running: tracker !== undefined,
      inArea,
      lastPositionAt: tracker?.lastPositionAt ?? null,
      publishedCount: tracker?.publishedCount ?? 0,
      lastError: null,
    };
  }

  private liveBatch(flightId: string): Telemetry[] {
    const time = this.now();
    let aircraft: SimulatedAircraft[];
    if (flightId === "*") {
      // Every tracked flight: the whole area when "*" is tracked.
      aircraft = this.trackers.has("*")
        ? this.inArea(time).map((a) => a.aircraft)
        : SIMULATED.filter((a) => this.trackers.has(a.sample.icaoHex));
    } else {
      const one = BY_ID.get(flightId);
      aircraft = one && this.isTracked(flightId) ? [one] : [];
    }
    const batch = aircraft.map((a) => this.telemetry(a, time));
    for (const point of batch) {
      for (const id of [point.flightId, "*"]) {
        const tracker = this.trackers.get(id);
        if (tracker) {
          tracker.publishedCount++;
          tracker.lastPositionAt = point.timestamp;
        }
      }
    }
    return batch;
  }
}
