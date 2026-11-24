/**
 * White scroll spawn animation.
 *
 * The ending spawns a white scroll that unrolls in front of the player. The
 * animation is expressed as a pure function of progress so it can be tested and
 * so the visual layer only has to read two numbers per frame: the scroll's
 * vertical scale and its opacity.
 *
 * The scroll unrolls from the top down, which is why the scale pivot is the top
 * edge rather than the centre.
 */

/** Total unroll duration in seconds. */
export const SCROLL_UNROLL_DURATION = 1.6;

/** Final height of the scroll in metres. */
export const SCROLL_HEIGHT = 1.2;

/** Final width of the scroll in metres. */
export const SCROLL_WIDTH = 0.8;

/** Distance in front of the player where the scroll appears. */
export const SCROLL_DISTANCE = 1.1;

/** Height above the player's feet where the scroll hangs. */
export const SCROLL_ELEVATION = 1.0;

/** Visual state of the scroll at one instant. */
export interface ScrollState {
  /** Vertical scale in `[0, 1]`. */
  readonly scaleY: number;
  /** Opacity in `[0, 1]`. */
  readonly opacity: number;
  /** True once the scroll is fully unrolled. */
  readonly complete: boolean;
}

/**
 * Scroll state at `progress` through the unroll.
 *
 * Opacity ramps in over the first 20% so the scroll does not pop into existence,
 * then holds at 1 while the paper unrolls.
 */
export function scrollState(progress: number): ScrollState {
  const clamped = Math.max(0, Math.min(1, progress));
  const opacity = clamped < 0.2 ? clamped / 0.2 : 1;

  return {
    scaleY: clamped,
    opacity,
    complete: clamped >= 1,
  };
}

/** World-space offset of the scroll from the player, given a facing yaw. */
export function scrollOffset(yaw: number): { x: number; y: number; z: number } {
  return {
    x: Math.sin(yaw) * SCROLL_DISTANCE,
    y: SCROLL_ELEVATION,
    z: Math.cos(yaw) * SCROLL_DISTANCE,
  };
}

/** Yaw that makes `from` face `to`, in radians. */
export function yawTowards(
  from: { x: number; z: number },
  to: { x: number; z: number },
): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/**
 * Shortest signed angular difference from `a` to `b`, in `(-PI, PI]`.
 *
 * Used to turn the player and the Loomkeeper towards each other without either
 * spinning the long way round.
 */
export function shortestAngleDelta(a: number, b: number): number {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  if (delta <= -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

/** Interpolates a yaw towards a target by `progress` in `[0, 1]`. */
export function turnTowards(current: number, target: number, progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return current + shortestAngleDelta(current, target) * clamped;
}