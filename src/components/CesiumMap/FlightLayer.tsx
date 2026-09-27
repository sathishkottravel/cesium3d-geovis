import {
  Cartesian3,
  ClockRange,
  Color,
  JulianDate,
  LagrangePolynomialApproximation,
  Rectangle,
  SampledPositionProperty,
  VelocityOrientationProperty,
  type Clock as CesiumClock,
} from "cesium";
import { useEffect, useMemo, useRef } from "react";
import { CameraFlyTo, Clock, Entity } from "resium";
import { appConfig } from "../../config/appConfig";
import type { FlightPlan } from "../../flight/flightPlan";

const FT_TO_M = 0.3048;
/** Wall-clock interval between elapsed-time reports, to keep React updates cheap. */
const REPORT_INTERVAL_MS = 250;

export interface FlightLayerProps {
  plan: FlightPlan;
  playing: boolean;
  /** Clock multiplier: 1 = real time. */
  speed: number;
  follow: boolean;
  onElapsed(seconds: number): void;
}

/** Route line, animated aircraft and the clock that drives it. Rendered inside the Viewer. */
export function FlightLayer({ plan, playing, speed, follow, onElapsed }: FlightLayerProps) {
  // Everything time-based is rebuilt per plan; a new plan object restarts the flight.
  const flight = useMemo(() => {
    const start = JulianDate.now();
    const stop = JulianDate.addSeconds(start, plan.durationSec, new JulianDate());
    const position = new SampledPositionProperty();
    position.setInterpolationOptions({
      interpolationDegree: 2,
      interpolationAlgorithm: LagrangePolynomialApproximation,
    });
    const route: Cartesian3[] = [];
    for (const s of plan.samples) {
      const point = Cartesian3.fromDegrees(s.longitude, s.latitude, s.altitudeFt * FT_TO_M);
      position.addSample(JulianDate.addSeconds(start, s.t, new JulianDate()), point);
      route.push(point);
    }
    const lats = plan.samples.map((s) => s.latitude);
    const lons = plan.samples.map((s) => s.longitude);
    const pad = 1; // degrees around the route
    const overview = Rectangle.fromDegrees(
      Math.min(...lons) - pad,
      Math.min(...lats) - pad,
      Math.max(...lons) + pad,
      Math.max(...lats) + pad,
    );
    // Graphics are created once per plan: new objects on re-render would make Cesium rebuild the
    // geometry, and the Viewer pauses the clock until it is ready (the animation would run slow).
    const graphics = {
      route: { positions: route, width: 2, material: Color.WHITE.withAlpha(0.6) },
      // Stays at least 64 px wide when zoomed out, like Cesium's Sandcastle examples.
      aircraft: { uri: appConfig.aircraftModel, minimumPixelSize: 64, maximumScale: 20_000 },
      trail: { leadTime: 0, trailTime: plan.durationSec, width: 3, material: Color.ORANGE },
    };
    // Points the model's nose along its direction of travel.
    const orientation = new VelocityOrientationProperty(position);
    return { start, stop, position, orientation, overview, graphics };
  }, [plan]);

  // Keep the latest callback without re-binding the Clock's onTick.
  const onElapsedRef = useRef(onElapsed);
  useEffect(() => {
    onElapsedRef.current = onElapsed;
  }, [onElapsed]);
  const lastReport = useRef(0);

  function tick(clock: CesiumClock) {
    const now = performance.now();
    if (now - lastReport.current < REPORT_INTERVAL_MS) return;
    lastReport.current = now;
    onElapsedRef.current(JulianDate.secondsDifference(clock.currentTime, flight.start));
  }

  return (
    <>
      <Clock
        startTime={flight.start}
        stopTime={flight.stop}
        currentTime={flight.start}
        clockRange={ClockRange.CLAMPED}
        multiplier={speed}
        shouldAnimate={playing}
        onTick={tick}
      />
      <CameraFlyTo key={`overview-${flight.start.toString()}`} destination={flight.overview} duration={2} once />
      <Entity name={`${plan.from.ident} → ${plan.to.ident}`} polyline={flight.graphics.route} />
      <Entity
        name="Aircraft"
        position={flight.position}
        orientation={flight.orientation}
        model={flight.graphics.aircraft}
        path={flight.graphics.trail}
        tracked={follow}
      />
    </>
  );
}
