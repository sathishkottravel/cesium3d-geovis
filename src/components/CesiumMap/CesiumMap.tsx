import { Cartesian3, Color, Ion } from "cesium";
import { CameraFlyTo, Entity, Viewer } from "resium";
import { appConfig } from "../../config/appConfig";
import type { Airport } from "../../navigation/types";
import { FlightLayer, type FlightLayerProps } from "./FlightLayer";

if (appConfig.cesiumIonToken) {
  Ion.defaultAccessToken = appConfig.cesiumIonToken;
}

interface CesiumMapProps {
  airport?: Airport | null;
  flight?: FlightLayerProps | null;
}

export function CesiumMap({ airport, flight }: CesiumMapProps) {
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
      {flight && <FlightLayer {...flight} />}
    </Viewer>
  );
}
