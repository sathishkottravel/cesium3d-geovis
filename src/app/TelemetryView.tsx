import { TelemetryMap } from "../components/CesiumMap/TelemetryMap";
import { TelemetryPanel } from "../components/TelemetryPanel/TelemetryPanel";
import { useTelemetry } from "../telemetry/useTelemetry";

/** Live aircraft around an area, from the Aviation Telemetry GraphQL API. */
export function TelemetryView() {
  const telemetry = useTelemetry();
  return (
    <>
      <TelemetryMap
        area={telemetry.area}
        searchId={telemetry.searchId}
        tracks={telemetry.tracks}
        trackedIds={telemetry.liveIds}
      />
      <aside className="sidebar">
        <TelemetryPanel telemetry={telemetry} />
      </aside>
    </>
  );
}
