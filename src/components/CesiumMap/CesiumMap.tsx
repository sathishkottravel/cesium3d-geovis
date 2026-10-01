import { Cartesian3, Color } from "cesium";
import { CameraFlyTo, Entity, Viewer } from "resium";
import type { Airport } from "../../navigation/types";
import { FlightLayer, type FlightLayerProps } from "./FlightLayer";
import "./ion";

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
