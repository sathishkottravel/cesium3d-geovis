import { Cartesian3, Color, Ion } from "cesium";
import { CameraFlyTo, Entity, Viewer } from "resium";
import { appConfig } from "../../config/appConfig";
import type { Airport, Waypoint } from "../../navigation/types";
import { FlightLayer, type FlightLayerProps } from "./FlightLayer";
import { WaypointsLayer } from "./WaypointsLayer";

if (appConfig.cesiumIonToken) {
  Ion.defaultAccessToken = appConfig.cesiumIonToken;
}

interface CesiumMapProps {
  airport?: Airport | null;
  /** Search results: the camera moves to them. */
  waypoints?: Waypoint[];
  /** Waypoints along the planned flight: shown without moving the camera. */
  routeWaypoints?: Waypoint[];
  flight?: FlightLayerProps | null;
}

const NONE: Waypoint[] = [];

export function CesiumMap({ airport, waypoints = NONE, routeWaypoints = NONE, flight }: CesiumMapProps) {
  return (
    <Viewer full timeline={false} animation={false}>
      {airport && (
        <CameraFlyTo
          key={airport.ident}
          destination={Cartesian3.fromDegrees(
            airport.location.longitude,
            airport.location.latitude,
            50_000,
          )}
          duration={2}
          once
        />
      )}
      {airport && (
        <Entity
          name={`${airport.ident} — ${airport.name}`}
          position={Cartesian3.fromDegrees(airport.location.longitude, airport.location.latitude)}
          point={{ pixelSize: 12, color: Color.ORANGE }}
          description={airport.name}
        />
      )}
      <WaypointsLayer waypoints={waypoints} flyTo={!airport} />
      <WaypointsLayer waypoints={routeWaypoints} flyTo={false} declutter />
      {flight && <FlightLayer {...flight} />}
    </Viewer>
  );
}
