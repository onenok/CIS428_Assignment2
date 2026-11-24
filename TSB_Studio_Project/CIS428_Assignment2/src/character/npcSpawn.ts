/**
 * Where the Loomkeeper stands.
 *
 * The position comes from a scene marker rather than a constant so the NPC can be
 * moved in the editor without touching code. Two conventions have to be reconciled
 * to do that, and mixing them up is the easy mistake here:
 *
 *   marker  - an empty scene node. Its position *is* the point, so the natural
 *             thing to place is the NPC's feet, i.e. the ground.
 *   pawn    - `MovementPawn`'s world position is the centre of its collision
 *             capsule, so its feet are `CHARACTER_HEIGHT / 2` below that.
 *
 * This module keeps the conversion in one place, engine-free, so it can be
 * unit-tested without a world.
 */

import { GROUND_SURFACE_Y } from '../world/WorldGenConfig.js';

/** Scene node name the NPC reads its spawn point from. */
export const LOOMKEEPER_SPAWN_MARKER = 'LoomkeeperSpawn';

/** Height of the mannequin, matching the engine's own character. */
export const NPC_HEIGHT = 1.8;

/** A point in world space. */
export interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Feet position used when the scene has no marker.
 *
 * The player spawns at the origin facing -Z, so +Z is *behind* them: N3 has the
 * Loomkeeper speak before it is seen, and the player has to turn around. Sitting
 * on the ground (`GROUND_SURFACE_Y`) is what makes the NPC look planted rather
 * than floating.
 */
export const LOOMKEEPER_FALLBACK_FEET: WorldPoint = {
  x: 0,
  y: GROUND_SURFACE_Y,
  z: 4,
};

/** Where a resolver took the spawn point from. */
export type NpcSpawnSource = 'marker' | 'fallback';

export interface ResolvedNpcSpawn {
  /** Feet position, i.e. what a marker should be placed at. */
  readonly feet: WorldPoint;
  /**
   * Value to hand to `setWorldPosition`.
   *
   * Half a body above the feet, because the NPC's collider is a capsule/box centred on
   * its pawn origin — the engine's `MovementPawn` convention. Handing it the feet
   * directly drops the NPC a block into the ground, which is how it behaved when this
   * briefly returned `feet` unchanged.
   */
  readonly pawnOrigin: WorldPoint;
  readonly source: NpcSpawnSource;
}

/**
 * Converts a feet position into the pawn origin a `MovementPawn` expects.
 *
 * `height` is a parameter rather than an engine import so this stays testable.
 */
export function pawnCentreFromFeet(feet: WorldPoint, height: number = NPC_HEIGHT): WorldPoint {
  return { x: feet.x, y: feet.y + height / 2, z: feet.z };
}

/**
 * Picks the spawn point: the marker when there is one, the fallback otherwise.
 *
 * A marker at a non-finite coordinate (a broken scene file, a NaN from a zero
 * scale) is treated as missing rather than teleporting the NPC to NaN, which
 * would remove it from the scene silently.
 */
export function resolveNpcSpawn(
  markerFeet: WorldPoint | null,
  fallbackFeet: WorldPoint = LOOMKEEPER_FALLBACK_FEET,
): ResolvedNpcSpawn {
  const usable = markerFeet !== null && isFinitePoint(markerFeet);
  const feet = usable ? markerFeet : fallbackFeet;
  return {
    feet,
    pawnOrigin: pawnCentreFromFeet(feet),
    source: usable ? 'marker' : 'fallback',
  };
}

/** True when every component is a finite number. */
export function isFinitePoint(point: WorldPoint): boolean {
  return (
    Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
  );
}