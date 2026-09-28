import { useEffect, useState, type FormEvent } from "react";
import { MODE_LABELS } from "../../config/transportSettings";
import { formatDuration, planFlight, sampleAt, SPEEDS, type FlightPlan } from "../../flight/flightPlan";
import { ROUTE_CORRIDOR_NM, waypointsAlongRoute } from "../../flight/routeWaypoints";
import type { FlightControls, RouteWaypoints } from "../../flight/useFlight";
import { WaypointsUnavailableError } from "../../navigation/types";
import { getRuntime } from "../../runtime/runtime";
import { useNavigation } from "../../services/useNavigation";

interface FlightPanelProps {
  flight: FlightControls;
}

function describeRouteWaypoints(value: RouteWaypoints | null): string {
  switch (value?.status) {
    case "ready":
      return `${value.waypoints.length} within ${ROUTE_CORRIDOR_NM} nm`;
    case "unavailable":
      return "not available for this data source";
    case "error":
      return `failed: ${value.message}`;
    default:
      return "…";
  }
}

/** Session info, and planning / playback of a flight between two airports. */
export function FlightPanel({ flight }: FlightPanelProps) {
  const runtime = getRuntime();
  const { settings, nav, state } = useNavigation();
  const [from, setFrom] = useState("MMUN");
  const [to, setTo] = useState("MGGT");
  const [message, setMessage] = useState<string | null>(null);
  const { plan, elapsed, clear } = flight;

  // A new data source may not know these airports.
  useEffect(() => {
    clear();
    setMessage(null);
  }, [nav, clear]);

  async function start(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const [departure, arrival] = await Promise.all([nav.getAirport(from), nav.getAirport(to)]);
      if (!departure || !arrival) {
        setMessage(`No airport found for ${(departure ? to : from).trim().toUpperCase()}`);
        return;
      }
      const next = planFlight(departure, arrival);
      const routeId = flight.start(next);
      void loadRouteWaypoints(routeId, next);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadRouteWaypoints(routeId: number, next: FlightPlan) {
    try {
      flight.setRouteWaypoints(routeId, { status: "ready", waypoints: await waypointsAlongRoute(nav, next) });
    } catch (err) {
      flight.setRouteWaypoints(
        routeId,
        err instanceof WaypointsUnavailableError
          ? { status: "unavailable" }
          : { status: "error", message: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  const arrived = plan !== null && elapsed >= plan.durationSec - 0.5;
  const current = plan && sampleAt(plan, elapsed);

  return (
    <section className="panel">
      <h2>Session</h2>
      <dl>
        <dt>Runtime</dt>
        <dd>{runtime.describe()}</dd>
        <dt>Transport</dt>
        <dd>
          {MODE_LABELS[settings.mode]} ({nav.transportKind})
        </dd>
      </dl>

      <h2>Flight</h2>
      <form onSubmit={start}>
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" aria-label="Departure ICAO" />
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" aria-label="Arrival ICAO" />
        <button type="submit" disabled={state !== "connected" || !from.trim() || !to.trim()}>
          Start
        </button>
      </form>
      {message && <p className="error">{message}</p>}

      {plan && current && (
        <>
          <div className="controls">
            <button type="button" onClick={() => flight.setPlaying(!flight.playing)} disabled={arrived}>
              {flight.playing ? "Pause" : "Resume"}
            </button>
            <button type="button" onClick={flight.restart}>
              Restart
            </button>
            <label>
              <input type="checkbox" checked={flight.follow} onChange={(e) => flight.setFollow(e.target.checked)} />
              Follow aircraft
            </label>
            <label>
              <input
                type="checkbox"
                checked={flight.showWaypoints}
                onChange={(e) => flight.setShowWaypoints(e.target.checked)}
              />
              Show waypoints
            </label>
          </div>
          <div className="controls" role="group" aria-label="Playback speed">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                className={speed === flight.speed ? "active" : undefined}
                aria-pressed={speed === flight.speed}
                onClick={() => flight.setSpeed(speed)}
              >
                {speed}×
              </button>
            ))}
          </div>
          <dl aria-label="Flight progress">
            <dt>Route</dt>
            <dd>
              {plan.from.ident} → {plan.to.ident}, {Math.round(plan.distanceNm)} nm
            </dd>
            <dt>Time</dt>
            <dd>
              {formatDuration(elapsed)} / {formatDuration(plan.durationSec)}
            </dd>
            <dt>Altitude</dt>
            <dd>{Math.round(current.altitudeFt).toLocaleString("en-US")} ft</dd>
            <dt>Waypoints</dt>
            <dd>{describeRouteWaypoints(flight.routeWaypoints)}</dd>
            <dt>Status</dt>
            <dd>{arrived ? `Arrived at ${plan.to.ident}` : flight.playing ? "En route" : "Paused"}</dd>
          </dl>
        </>
      )}
    </section>
  );
}
