import { useState } from "react";
import { CesiumMap } from "../components/CesiumMap/CesiumMap";
import { FlightPanel } from "../components/FlightPanel/FlightPanel";
import { NavigationPanel } from "../components/NavigationPanel/NavigationPanel";
import { TransportPanel } from "../components/TransportPanel/TransportPanel";
import { useFlight } from "../flight/useFlight";
import type { Airport } from "../navigation/types";

export function MapView() {
  const [airport, setAirport] = useState<Airport | null>(null);
  const flight = useFlight();
  const { plan, playing, speed, follow, setElapsed } = flight;
  return (
    <>
      <CesiumMap airport={airport} flight={plan && { plan, playing, speed, follow, onElapsed: setElapsed }} />
      <aside className="sidebar">
        <FlightPanel flight={flight} />
        <TransportPanel />
        <NavigationPanel onAirport={setAirport} />
      </aside>
    </>
  );
}
