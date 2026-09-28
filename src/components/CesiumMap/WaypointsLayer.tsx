import { Cartesian2, Cartesian3, Color, DistanceDisplayCondition, LabelStyle, Rectangle, VerticalOrigin } from "cesium";
import { useMemo } from "react";
import { CameraFlyTo, Entity } from "resium";
import type { Waypoint } from "../../navigation/types";

// Styles are module constants: new graphics objects on every render would make Cesium rebuild them.
const POINT = { pixelSize: 9, color: Color.CYAN, outlineColor: Color.BLACK, outlineWidth: 1 };
const LABEL = {
  font: "13px sans-serif",
  fillColor: Color.WHITE,
  outlineColor: Color.BLACK,
  outlineWidth: 3,
  style: LabelStyle.FILL_AND_OUTLINE,
  verticalOrigin: VerticalOrigin.BOTTOM,
  pixelOffset: new Cartesian2(0, -10),
};
/** Labels hidden when the camera is over 1,000 km away, where neighbouring labels overlap. */
const DECLUTTERED_LABEL = { ...LABEL, distanceDisplayCondition: new DistanceDisplayCondition(0, 1_000_000) };

interface WaypointsLayerProps {
  waypoints: Waypoint[];
  /** Move the camera to the waypoints (off when an airport is shown). */
  flyTo: boolean;
  /** Hide labels when zoomed far out (for dense sets, e.g. along a route). */
  declutter?: boolean;
}

/** Marks waypoints on the globe; several may share an ident. */
export function WaypointsLayer({ waypoints, flyTo, declutter = false }: WaypointsLayerProps) {
  const items = useMemo(
    () =>
      waypoints.map((w, i) => {
        const text = w.region ? `${w.ident} (${w.region})` : w.ident;
        return {
          key: `${text}-${i}`,
          name: text,
          position: Cartesian3.fromDegrees(w.location.longitude, w.location.latitude),
          label: { ...(declutter ? DECLUTTERED_LABEL : LABEL), text },
        };
      }),
    [waypoints, declutter],
  );

  const destination = useMemo(() => {
    if (waypoints.length === 0) return null;
    if (waypoints.length === 1) {
      const { latitude, longitude } = waypoints[0].location;
      return Cartesian3.fromDegrees(longitude, latitude, 50_000);
    }
    const lats = waypoints.map((w) => w.location.latitude);
    const lons = waypoints.map((w) => w.location.longitude);
    const pad = 1; // degrees
    return Rectangle.fromDegrees(
      Math.min(...lons) - pad,
      Math.min(...lats) - pad,
      Math.max(...lons) + pad,
      Math.max(...lats) + pad,
    );
  }, [waypoints]);

  return (
    <>
      {flyTo && destination && (
        <CameraFlyTo key={items.map((i) => i.key).join("|")} destination={destination} duration={2} once />
      )}
      {items.map((item) => (
        <Entity key={item.key} name={item.name} position={item.position} point={POINT} label={item.label} />
      ))}
    </>
  );
}
