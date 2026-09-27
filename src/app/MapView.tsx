import { useState } from "react";
import { CesiumMap } from "../components/CesiumMap/CesiumMap";
import { FlightPanel } from "../components/FlightPanel/FlightPanel";
import { NavigationPanel } from "../components/NavigationPanel/NavigationPanel";
import { TransportPanel } from "../components/TransportPanel/TransportPanel";
import type { Airport } from "../navigation/types";

export function MapView() {
  const [airport, setAirport] = useState<Airport | null>(null);
  return (
    <>
      <CesiumMap airport={airport} />
      <aside className="sidebar">
        <FlightPanel />
        <TransportPanel />
        <NavigationPanel onAirport={setAirport} />
      </aside>
    </>
  );
}
