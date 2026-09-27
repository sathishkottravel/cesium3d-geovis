import { useCallback, useState } from "react";
import type { FlightPlan } from "./flightPlan";

export interface FlightControls {
  plan: FlightPlan | null;
  playing: boolean;
  speed: number;
  follow: boolean;
  /** Seconds since departure, reported by the map's clock. */
  elapsed: number;
  start(plan: FlightPlan): void;
  restart(): void;
  clear(): void;
  setPlaying(playing: boolean): void;
  setSpeed(speed: number): void;
  setFollow(follow: boolean): void;
  setElapsed(seconds: number): void;
}

/** State shared by the flight controls (panel) and the flight layer (map). */
export function useFlight(): FlightControls {
  const [plan, setPlan] = useState<FlightPlan | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const start = useCallback((next: FlightPlan) => {
    setPlan(next);
    setElapsed(0);
    setPlaying(true);
  }, []);
  const restart = useCallback(() => {
    // A copy of the plan is a new object, so the map rebuilds its clock from departure.
    setPlan((current) => (current ? { ...current } : current));
    setElapsed(0);
    setPlaying(true);
  }, []);
  const clear = useCallback(() => setPlan(null), []);

  return {
    plan,
    playing,
    speed,
    follow,
    elapsed,
    start,
    restart,
    clear,
    setPlaying,
    setSpeed,
    setFollow,
    setElapsed,
  };
}
