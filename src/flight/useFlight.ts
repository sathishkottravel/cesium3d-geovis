import { useCallback, useRef, useState } from "react";
import type { Waypoint } from "../navigation/types";
import type { FlightPlan } from "./flightPlan";

/** Waypoints along the current route, as fetched from the data source. */
export type RouteWaypoints =
  | { status: "loading" }
  | { status: "ready"; waypoints: Waypoint[] }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export interface FlightControls {
  plan: FlightPlan | null;
  playing: boolean;
  speed: number;
  follow: boolean;
  /** Seconds since departure, reported by the map's clock. */
  elapsed: number;
  routeWaypoints: RouteWaypoints | null;
  /** Starts a new route; returns its id for setRouteWaypoints. */
  start(plan: FlightPlan): number;
  restart(): void;
  clear(): void;
  setPlaying(playing: boolean): void;
  setSpeed(speed: number): void;
  setFollow(follow: boolean): void;
  setElapsed(seconds: number): void;
  /** Ignored when `routeId` is no longer the current route (a newer flight started meanwhile). */
  setRouteWaypoints(routeId: number, value: RouteWaypoints): void;
}

/** State shared by the flight controls (panel) and the flight layer (map). */
export function useFlight(): FlightControls {
  const [plan, setPlan] = useState<FlightPlan | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [routeWaypoints, setRouteWaypointsState] = useState<RouteWaypoints | null>(null);
  const routeId = useRef(0);

  const start = useCallback((next: FlightPlan) => {
    setPlan(next);
    setElapsed(0);
    setPlaying(true);
    setRouteWaypointsState({ status: "loading" });
    return ++routeId.current;
  }, []);
  const setRouteWaypoints = useCallback((id: number, value: RouteWaypoints) => {
    if (id === routeId.current) setRouteWaypointsState(value);
  }, []);
  const restart = useCallback(() => {
    // A copy of the plan is a new object, so the map rebuilds its clock from departure.
    setPlan((current) => (current ? { ...current } : current));
    setElapsed(0);
    setPlaying(true);
  }, []);
  // Restart keeps the route and its waypoints; clear drops both.
  const clear = useCallback(() => {
    routeId.current++;
    setPlan(null);
    setRouteWaypointsState(null);
  }, []);

  return {
    plan,
    playing,
    speed,
    follow,
    elapsed,
    routeWaypoints,
    start,
    restart,
    clear,
    setPlaying,
    setSpeed,
    setFollow,
    setElapsed,
    setRouteWaypoints,
  };
}
