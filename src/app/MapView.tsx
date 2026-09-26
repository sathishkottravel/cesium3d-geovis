import { useState } from "react";
import { CesiumMap } from "../components/CesiumMap/CesiumMap";
import { FlightPanel } from "../components/FlightPanel/FlightPanel";
import { NavigationPanel } from "../components/NavigationPanel/NavigationPanel";
import type { Airport } from "../navigation/types";

export function MapView() {
  const [airport, setAirport] = useState<Airport | null>(null);
  return (
    <>
      <CesiumMap airport={airport} />
      <aside className="sidebar">
        <FlightPanel />
        <NavigationPanel onAirport={setAirport} />
      </aside>
    </>
  );
}
