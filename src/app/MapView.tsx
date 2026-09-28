import { useState } from "react";
import { CesiumMap } from "../components/CesiumMap/CesiumMap";
import { FlightPanel } from "../components/FlightPanel/FlightPanel";
import { NavigationPanel } from "../components/NavigationPanel/NavigationPanel";
import { TransportPanel } from "../components/TransportPanel/TransportPanel";
import { useFlight } from "../flight/useFlight";
import type { LookupResult } from "../navigation/lookup";

export function MapView() {
  const [found, setFound] = useState<Pick<LookupResult, "airport" | "waypoints">>({ airport: null, waypoints: [] });
  const flight = useFlight();
  const { plan, playing, speed, follow, setElapsed, routeWaypoints } = flight;
  return (
    <>
      <CesiumMap
        airport={found.airport}
        waypoints={found.waypoints}
        routeWaypoints={plan && routeWaypoints?.status === "ready" ? routeWaypoints.waypoints : undefined}
        flight={plan && { plan, playing, speed, follow, onElapsed: setElapsed }}
      />
      <aside className="sidebar">
        <FlightPanel flight={flight} />
        <TransportPanel />
        <NavigationPanel onResult={setFound} />
      </aside>
    </>
  );
}
