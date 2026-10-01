import {
  Cartesian2,
  Cartesian3,
  Color,
  HeadingPitchRoll,
  LabelStyle,
  Math as CesiumMath,
  Rectangle,
  Transforms,
  VerticalOrigin,
} from "cesium";
import { memo, useMemo } from "react";
import { CameraFlyTo, Entity, Viewer } from "resium";
import { appConfig } from "../../config/appConfig";
import type { AreaQuery } from "../../telemetry/operations";
import { NM_TO_M, toMeters, type AircraftTrack, type Tracks } from "../../telemetry/telemetryState";
import "./ion";

interface TelemetryMapProps {
  area: AreaQuery | null;
  /** Changes per search, so the camera flies to the area once per search rather than per refresh. */
  searchId: number;
  tracks: Tracks;
  /** Ids with an active server-side tracker. */
  trackedIds: ReadonlySet<string>;
}

// Shared graphics: new objects on re-render would make Cesium rebuild them.
const MODEL = { uri: appConfig.aircraftModel, minimumPixelSize: 48, maximumScale: 20_000 };
const AREA_FILL = Color.CYAN.withAlpha(0.06);
const LIVE_COLOR = Color.ORANGE;
const AREA_COLOR = Color.WHITE;

/** Multiple aircraft around an area, positioned from the area query and live telemetry. */
export function TelemetryMap({ area, searchId, tracks, trackedIds }: TelemetryMapProps) {
  const areaGraphics = useMemo(() => {
    if (!area) return null;
    const radiusM = area.radiusNm * NM_TO_M;
    // Degrees of latitude/longitude spanned by the radius, plus a margin.
    const dLat = (area.radiusNm / 60) * 1.3;
    const dLon = dLat / Math.max(Math.cos(CesiumMath.toRadians(area.latitude)), 0.1);
    return {
      center: Cartesian3.fromDegrees(area.longitude, area.latitude),
      ellipse: {
        semiMajorAxis: radiusM,
        semiMinorAxis: radiusM,
        height: 0,
        material: AREA_FILL,
        outline: true,
        outlineColor: Color.CYAN,
      },
      view: Rectangle.fromDegrees(
        area.longitude - dLon,
        area.latitude - dLat,
        area.longitude + dLon,
        area.latitude + dLat,
      ),
    };
  }, [area]);

  return (
    <Viewer full timeline={false} animation={false}>
      {areaGraphics && (
        <>
          <CameraFlyTo key={searchId} destination={areaGraphics.view} duration={2} once />
          <Entity name="Search area" position={areaGraphics.center} ellipse={areaGraphics.ellipse} />
        </>
      )}
      {Object.values(tracks).map((aircraft) => (
        <AircraftEntity key={aircraft.id} aircraft={aircraft} tracked={trackedIds.has(aircraft.id) || aircraft.live} />
      ))}
    </Viewer>
  );
}

const AircraftEntity = memo(function AircraftEntity({ aircraft, tracked }: { aircraft: AircraftTrack; tracked: boolean }) {
  const { id, callsign, latitude, longitude, altitudeFt, track, history } = aircraft;
  const name = callsign || id;

  const position = useMemo(
    () => Cartesian3.fromDegrees(longitude, latitude, toMeters(altitudeFt)),
    [longitude, latitude, altitudeFt],
  );
  // The model's nose is +X, which points east at heading 0; ADS-B track is clockwise from north.
  const orientation = useMemo(
    () => Transforms.headingPitchRollQuaternion(position, new HeadingPitchRoll(CesiumMath.toRadians(track - 90), 0, 0)),
    [position, track],
  );
  const label = useMemo(
    () => ({
      text: name,
      font: "12px sans-serif",
      fillColor: tracked ? LIVE_COLOR : AREA_COLOR,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -28),
    }),
    [name, tracked],
  );
  const trail = useMemo(
    () =>
      history.length < 2
        ? undefined
        : {
            positions: history.map((p) => Cartesian3.fromDegrees(p.longitude, p.latitude, toMeters(p.altitudeFt))),
            width: tracked ? 3 : 1.5,
            material: tracked ? LIVE_COLOR : AREA_COLOR.withAlpha(0.5),
          },
    [history, tracked],
  );

  return (
    <Entity
      id={`aircraft-${id}`}
      name={name}
      position={position}
      orientation={orientation}
      model={MODEL}
      label={label}
      polyline={trail}
      description={describe(aircraft)}
    />
  );
});

function describe(a: AircraftTrack): string {
  const rows: [string, string][] = [
    ["ICAO hex / id", a.id],
    ["Callsign", a.callsign ?? "—"],
    ["Altitude", `${Math.round(a.altitudeFt).toLocaleString("en-US")} ft`],
    ["Ground speed", `${Math.round(a.groundSpeed)} kt`],
    ["Track", `${Math.round(a.track)}°`],
    ["Distance", a.distanceNm == null ? "—" : `${a.distanceNm.toFixed(1)} nm`],
    ["Updated", a.updatedAt ? new Date(a.updatedAt).toLocaleTimeString() : "—"],
    ["Source", a.live ? "live telemetry" : "area query"],
  ];
  if (a.flight) rows.push(["Route", `${a.flight.origin} → ${a.flight.destination}`]);
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<table class="cesium-infoBox-defaultTable"><tbody>${rows
    .map(([k, v]) => `<tr><th>${escape(k)}</th><td>${escape(v)}</td></tr>`)
    .join("")}</tbody></table>`;
}
