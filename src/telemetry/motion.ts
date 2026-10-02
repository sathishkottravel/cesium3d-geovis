/**
 * Smooth aircraft motion between position updates (dead reckoning with projective velocity blending).
 *
 * Between updates an aircraft keeps moving along its reported track at its reported ground speed. When a
 * new report arrives, the drawn position doesn't jump: for BLEND_MS it moves from the old projected path
 * to the new one, both still advancing, so speed and heading change gradually.
 */

export interface MotionState {
  /** Epoch ms the state is valid at. */
  time: number;
  latitude: number;
  longitude: number;
  altitudeFt: number;
  /** Knots. */
  groundSpeed: number;
  /** Degrees true. */
  track: number;
}

/** How long a correction is blended in. */
export const BLEND_MS = 1_500;
/** Stop projecting this long after the last report, so a lost aircraft doesn't fly on forever. */
export const MAX_EXTRAPOLATION_MS = 30_000;

const NM_PER_DEG_LAT = 60;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Moves `state` along its track to `time` (flat-earth approximation; fine over a few nm). */
export function project(state: MotionState, time: number): MotionState {
  const dt = Math.min(Math.max(time - state.time, 0), MAX_EXTRAPOLATION_MS);
  const distanceNm = (state.groundSpeed * dt) / 3_600_000;
  const track = toRad(state.track);
  const cosLat = Math.max(Math.cos(toRad(state.latitude)), 0.01);
  return {
    ...state,
    time,
    latitude: state.latitude + (distanceNm * Math.cos(track)) / NM_PER_DEG_LAT,
    longitude: state.longitude + (distanceNm * Math.sin(track)) / (NM_PER_DEG_LAT * cosLat),
  };
}

/** Shortest-way interpolation between two headings, in degrees [0, 360). */
export function lerpAngle(from: number, to: number, t: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

function blend(a: MotionState, b: MotionState, t: number): MotionState {
  return {
    time: b.time,
    latitude: lerp(a.latitude, b.latitude, t),
    longitude: lerp(a.longitude, b.longitude, t),
    altitudeFt: lerp(a.altitudeFt, b.altitudeFt, t),
    groundSpeed: lerp(a.groundSpeed, b.groundSpeed, t),
    track: lerpAngle(a.track, b.track, t),
  };
}

/** Motion of one aircraft. Mutable on purpose: Cesium reads it every frame through a callback property. */
export class AircraftMotion {
  private target: MotionState;
  /** The path drawn when the latest report arrived, blended out over BLEND_MS. */
  private previous: MotionState | null = null;
  private blendStart = 0;

  constructor(initial: MotionState) {
    this.target = initial;
  }

  /** The latest report. */
  get latest(): MotionState {
    return this.target;
  }

  /** Takes a new report; older or duplicate reports are ignored. `now` is when it was received. */
  update(report: MotionState, now: number): void {
    if (report.time <= this.target.time) return;
    this.previous = this.stateAt(now);
    this.blendStart = now;
    this.target = report;
  }

  /** Where to draw the aircraft at `time` (epoch ms). */
  stateAt(time: number): MotionState {
    const current = project(this.target, time);
    if (!this.previous) return current;
    const t = (time - this.blendStart) / BLEND_MS;
    if (t >= 1) {
      this.previous = null;
      return current;
    }
    if (t <= 0) return project(this.previous, time);
    return blend(project(this.previous, time), current, smoothstep(t));
  }
}
