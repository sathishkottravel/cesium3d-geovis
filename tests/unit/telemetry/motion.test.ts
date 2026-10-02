import { describe, expect, it } from "vitest";
import {
  AircraftMotion,
  BLEND_MS,
  lerpAngle,
  MAX_EXTRAPOLATION_MS,
  project,
  type MotionState,
} from "../../../src/telemetry/motion";

const T0 = Date.parse("2026-10-01T20:00:00Z");

function state(patch: Partial<MotionState> = {}): MotionState {
  return { time: T0, latitude: 51.5, longitude: -0.45, altitudeFt: 10_000, groundSpeed: 360, track: 0, ...patch };
}

/** Distance in nm between two states (flat-earth). */
function nm(a: MotionState, b: MotionState): number {
  const dLat = (a.latitude - b.latitude) * 60;
  const dLon = (a.longitude - b.longitude) * 60 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

describe("project", () => {
  it("moves along the track at ground speed", () => {
    // 360 kt for 10 s = 1 nm.
    const north = project(state({ track: 0 }), T0 + 10_000);
    expect(north.latitude - 51.5).toBeCloseTo(1 / 60, 6);
    expect(north.longitude).toBeCloseTo(-0.45, 9);
    const east = project(state({ track: 90 }), T0 + 10_000);
    expect(nm(east, state())).toBeCloseTo(1, 3);
    expect(east.longitude).toBeGreaterThan(-0.45);
  });

  it("doesn't move backwards in time or beyond the extrapolation limit", () => {
    expect(project(state(), T0 - 5_000)).toMatchObject({ latitude: 51.5, longitude: -0.45 });
    const far = project(state(), T0 + 10 * MAX_EXTRAPOLATION_MS);
    expect(far).toMatchObject({ latitude: project(state(), T0 + MAX_EXTRAPOLATION_MS).latitude });
  });

  it("keeps a parked aircraft in place", () => {
    expect(project(state({ groundSpeed: 0 }), T0 + 20_000)).toMatchObject({ latitude: 51.5, longitude: -0.45 });
  });
});

describe("lerpAngle", () => {
  it("turns the short way round", () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 9);
    expect(lerpAngle(10, 350, 0.25)).toBeCloseTo(5, 9);
    expect(lerpAngle(90, 180, 0.5)).toBeCloseTo(135, 9);
  });
});

describe("AircraftMotion", () => {
  it("keeps moving between reports", () => {
    const motion = new AircraftMotion(state());
    const a = motion.stateAt(T0 + 1_000);
    const b = motion.stateAt(T0 + 2_000);
    expect(nm(a, b)).toBeCloseTo(0.1, 3);
  });

  it("blends a correction in instead of jumping", () => {
    const motion = new AircraftMotion(state());
    const received = T0 + 10_000;
    const drawnBefore = motion.stateAt(received);
    // The report says the aircraft is 0.5 nm east of where it was projected, now heading east.
    const report = state({ time: received, latitude: drawnBefore.latitude, longitude: drawnBefore.longitude + 0.5 / 60 / Math.cos((51.5 * Math.PI) / 180), track: 90 });
    motion.update(report, received);

    // No jump at the moment of the update…
    expect(nm(motion.stateAt(received), drawnBefore)).toBeLessThan(1e-6);
    // …small steps while blending (each 50 ms frame moves far less than the 0.5 nm correction)…
    let previous = motion.stateAt(received);
    for (let t = received + 50; t <= received + BLEND_MS; t += 50) {
      const next = motion.stateAt(t);
      expect(nm(previous, next)).toBeLessThan(0.1);
      previous = next;
    }
    // …and on the reported path afterwards.
    const after = received + BLEND_MS + 1_000;
    expect(nm(motion.stateAt(after), project(report, after))).toBeLessThan(1e-9);
    expect(motion.stateAt(after).track).toBe(90);
  });

  it("ignores reports that aren't newer", () => {
    const motion = new AircraftMotion(state());
    motion.update(state({ time: T0, latitude: 0 }), T0 + 1_000);
    motion.update(state({ time: T0 - 1, latitude: 0 }), T0 + 1_000);
    expect(motion.latest.latitude).toBe(51.5);
  });
});
