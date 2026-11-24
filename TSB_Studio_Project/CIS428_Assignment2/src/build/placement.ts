/**
 * Placement and breaking maths.
 *
 * The build system raycasts from the camera, gets a hit point and a hit normal,
 * and derives two voxel cells from them:
 *
 *   break target     - the cell containing the hit point, pulled slightly back
 *                      along the normal so a face hit resolves to the block that
 *                      was hit rather than the empty cell in front of it
 *   placement target - the cell in front of the hit face, i.e. the hit point
 *                      nudged along the normal
 *
 * Both are pure functions of the hit data so they can be unit-tested without a
 * physics engine.
 */

import { isWithinWorldHeight } from '../voxel/coords.js';

/** Minimal shape of a physics raycast hit, so this module stays engine-free. */
export interface HitLike {
  readonly hitLocation: { readonly x: number; readonly y: number; readonly z: number };
  readonly hitNormal: { readonly x: number; readonly y: number; readonly z: number };
}

export interface VoxelCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** How far to nudge along the normal before flooring. Half a voxel is enough. */
const NORMAL_NUDGE = 0.5;

/** The cell that a placement would occupy: hit point plus the face normal. */
export function placementCellFromHit(hit: HitLike): VoxelCell {
  return {
    x: Math.floor(hit.hitLocation.x + hit.hitNormal.x * NORMAL_NUDGE),
    y: Math.floor(hit.hitLocation.y + hit.hitNormal.y * NORMAL_NUDGE),
    z: Math.floor(hit.hitLocation.z + hit.hitNormal.z * NORMAL_NUDGE),
  };
}

/** The cell that a break would remove: hit point minus the face normal. */
export function breakCellFromHit(hit: HitLike): VoxelCell {
  return {
    x: Math.floor(hit.hitLocation.x - hit.hitNormal.x * NORMAL_NUDGE),
    y: Math.floor(hit.hitLocation.y - hit.hitNormal.y * NORMAL_NUDGE),
    z: Math.floor(hit.hitLocation.z - hit.hitNormal.z * NORMAL_NUDGE),
  };
}

/** Horizontal half-extent of the editable region, in voxels. */
export interface BuildBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Builds a bounds object from a chunk radius.
 *
 * The region must be *symmetric* about the origin: radius 0 covers chunk 0
 * exactly (`0..15`), radius 1 covers chunks `-1..1` exactly (`-16..31`). An
 * earlier version used `-limit .. limit - 1` with `limit = (radius + 1) * size`,
 * which for radius 0 produced `-16..15` — chunk 0 **plus the whole of chunk -1**.
 * That silently made chunks `(0,-1)`, `(-1,0)` and `(-1,-1)` editable, so the
 * player could dig the surrounding ring away even though the design says only
 * the centre chunk is editable.
 */
export function buildBoundsForRadius(radiusChunks: number, chunkSize: number): BuildBounds {
  const extent = radiusChunks * chunkSize;
  return {
    minX: -extent,
    maxX: extent + chunkSize - 1,
    minZ: -extent,
    maxZ: extent + chunkSize - 1,
    minY: 0,
    maxY: 255,
  };
}

/** True when the cell is inside the editable region and the world height. */
export function isWithinBuildBounds(bounds: BuildBounds, cell: VoxelCell): boolean {
  if (!isWithinWorldHeight(cell.y)) return false;
  return cell.x >= bounds.minX && cell.x <= bounds.maxX && cell.z >= bounds.minZ && cell.z <= bounds.maxZ;
}

/**
 * Why a placement failed.
 *
 * There is deliberately no "occupied" reason: whether an occupied cell is an
 * error depends on the active `PlaceMode`, which the caller resolves before
 * asking for a failure reason.
 */
export type PlaceFailureReason = 'outOfBounds';

export type PlaceCheckResult = { readonly ok: true } | { readonly ok: false; readonly reason: PlaceFailureReason };

/** Checks whether a cell may be written to at all. */
export function checkPlacement(bounds: BuildBounds, cell: VoxelCell): PlaceCheckResult {
  if (!isWithinBuildBounds(bounds, cell)) {
    return { ok: false, reason: 'outOfBounds' };
  }
  return { ok: true };
}

/**
 * What to do when the target cell already holds a block.
 *
 *   replace - overwrite the existing block
 *   skip    - leave the existing block alone
 */
export type PlaceMode = 'replace' | 'skip';

/**
 * Resolves whether a placement should actually write.
 *
 * Returns `false` when the cell is occupied and the mode is `skip`.
 */
export function shouldWritePlacement(placeMode: PlaceMode, cellOccupied: boolean): boolean {
  if (!cellOccupied) return true;
  return placeMode === 'replace';
}