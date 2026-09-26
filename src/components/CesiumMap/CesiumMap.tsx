import { Cartesian3, Color, Ion } from "cesium";
import { Entity, Viewer } from "resium";
import { appConfig } from "../../config/appConfig";
import type { Airport } from "../../navigation/types";

if (appConfig.cesiumIonToken) {
  Ion.defaultAccessToken = appConfig.cesiumIonToken;
}

interface CesiumMapProps {
  airport?: Airport | null;
}

export function CesiumMap({ airport }: CesiumMapProps) {
  return (
    <Viewer full timeline={false} animation={false}>
      {airport && (
        <Entity
          name={`${airport.ident} — ${airport.name}`}
          position={Cartesian3.fromDegrees(airport.location.longitude, airport.location.latitude)}
          point={{ pixelSize: 12, color: Color.ORANGE }}
          description={airport.name}
        />
      )}
    </Viewer>
  );
}
