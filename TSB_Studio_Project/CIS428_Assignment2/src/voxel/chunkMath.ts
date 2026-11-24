/**
 * Chunk dimension and index maths.
 *
 * A chunk is a fixed-size box of voxels. The vertical extent covers the whole
 * placeable world height (y = 0 .. 255), so a chunk never has to be split
 * vertically and `chunkY` is always 0.
 *
 * Storage layout matches the engine's `VoxelState`:
 *   index = x + sizeX * (y + sizeY * z)
 */

import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from './coords.js';

/** Horizontal edge length of a chunk, in voxels. */
export const CHUNK_SIZE_X = CHUNK_SIZE;

/** Vertical edge length of a chunk, in voxels. Covers the whole world height. */
export const CHUNK_SIZE_Y = WORLD_MAX_Y - WORLD_MIN_Y + 1;

/** Depth of a chunk, in voxels. */
export const CHUNK_SIZE_Z = CHUNK_SIZE;

/** Total voxel count of one chunk. */
export const CHUNK_VOXEL_COUNT = CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z;

/** Local y index of the world's lowest layer inside a chunk. */
export const CHUNK_LOCAL_MIN_Y = 0;

/** Local y index of the world's highest layer inside a chunk. */
export const CHUNK_LOCAL_MAX_Y = CHUNK_SIZE_Y - 1;

/**
 * Flat array index for a local chunk coordinate.
 *
 * Callers must bounds-check first; this function does not clamp.
 */
export function chunkIndex(x: number, y: number, z: number): number {
  return x + CHUNK_SIZE_X * (y + CHUNK_SIZE_Y * z);
}

/** True when the local coordinate lies inside the chunk. */
export function chunkInBounds(x: number, y: number, z: number): boolean {
  return (
    x >= 0 &&
    y >= 0 &&
    z >= 0 &&
    x < CHUNK_SIZE_X &&
    y < CHUNK_SIZE_Y &&
    z < CHUNK_SIZE_Z
  );
}

/** Converts a world voxel y to the local chunk y index. */
export function worldYToLocalY(worldY: number): number {
  return worldY - WORLD_MIN_Y;
}

/** Converts a local chunk y index back to a world voxel y. */
export function localYToWorldY(localY: number): number {
  return localY + WORLD_MIN_Y;
}

/** True when the world voxel y is placeable. */
export function isPlaceableWorldY(worldY: number): boolean {
  return worldY >= WORLD_MIN_Y && worldY <= WORLD_MAX_Y;
}