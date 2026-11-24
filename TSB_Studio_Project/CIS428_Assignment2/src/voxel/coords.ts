/**
 * Voxel coordinate conversions.
 *
 * The build system mixes three coordinate spaces:
 *   - world space   : metres, what the player and physics see
 *   - voxel space   : integer grid cells, unbounded
 *   - chunk space   : (chunkX, chunkY, chunkZ) + local (x, y, z) inside a chunk
 *
 * Getting these wrong produces off-by-one placement bugs that are painful to
 * debug in the editor, so they are pinned down here.
 */

/** Edge length of an editable chunk, in voxels. */
export const CHUNK_SIZE = 16;

/** Lowest placeable voxel layer. */
export const WORLD_MIN_Y = 0;

/** Highest placeable voxel layer. */
export const WORLD_MAX_Y = 255;

/** Default size of one voxel in metres. */
export const DEFAULT_VOXEL_SIZE = 1;

export interface VoxelCoord {
  x: number;
  y: number;
  z: number;
}

export interface ChunkCoord {
  chunkX: number;
  chunkY: number;
  chunkZ: number;
  localX: number;
  localY: number;
  localZ: number;
}

/** Floor division that rounds towards negative infinity (unlike `Math.trunc`). */
export function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

/** Modulo that always returns a non-negative result. */
export function positiveMod(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

/** Converts a world-space position to the voxel cell containing it. */
export function worldToVoxel(worldX: number, worldY: number, worldZ: number, voxelSize = DEFAULT_VOXEL_SIZE): VoxelCoord {
  if (voxelSize <= 0) throw new Error(`worldToVoxel: voxelSize must be positive, got ${voxelSize}`);
  return {
    x: Math.floor(worldX / voxelSize),
    y: Math.floor(worldY / voxelSize),
    z: Math.floor(worldZ / voxelSize),
  };
}

/** Converts a voxel cell to the world-space position of its minimum corner. */
export function voxelToWorld(voxelX: number, voxelY: number, voxelZ: number, voxelSize = DEFAULT_VOXEL_SIZE): VoxelCoord {
  return { x: voxelX * voxelSize, y: voxelY * voxelSize, z: voxelZ * voxelSize };
}

/** Converts a voxel cell to the world-space position of its centre. */
export function voxelCenter(voxelX: number, voxelY: number, voxelZ: number, voxelSize = DEFAULT_VOXEL_SIZE): VoxelCoord {
  const half = voxelSize / 2;
  return { x: voxelX * voxelSize + half, y: voxelY * voxelSize + half, z: voxelZ * voxelSize + half };
}

/** Splits a voxel coordinate into its chunk and in-chunk local coordinate. */
export function voxelToChunk(voxelX: number, voxelY: number, voxelZ: number, chunkSize = CHUNK_SIZE): ChunkCoord {
  if (chunkSize <= 0) throw new Error(`voxelToChunk: chunkSize must be positive, got ${chunkSize}`);
  return {
    chunkX: floorDiv(voxelX, chunkSize),
    chunkY: floorDiv(voxelY, chunkSize),
    chunkZ: floorDiv(voxelZ, chunkSize),
    localX: positiveMod(voxelX, chunkSize),
    localY: positiveMod(voxelY, chunkSize),
    localZ: positiveMod(voxelZ, chunkSize),
  };
}

/** Recombines a chunk coordinate and local offset back into a voxel coordinate. */
export function chunkToVoxel(chunk: ChunkCoord, chunkSize = CHUNK_SIZE): VoxelCoord {
  return {
    x: chunk.chunkX * chunkSize + chunk.localX,
    y: chunk.chunkY * chunkSize + chunk.localY,
    z: chunk.chunkZ * chunkSize + chunk.localZ,
  };
}

/** True when the voxel layer is within the placeable vertical range. */
export function isWithinWorldHeight(voxelY: number): boolean {
  return voxelY >= WORLD_MIN_Y && voxelY <= WORLD_MAX_Y;
}

/**
 * True when the voxel coordinate is inside the editable region.
 *
 * Symmetric about the origin: radius 0 is chunk 0 only (`0..15`), radius 1 is
 * chunks `-1..1` (`-16..31`). Uses the same arithmetic as
 * `buildBoundsForRadius()` so the two can never disagree.
 */
export function isWithinEditableRegion(voxelX: number, voxelY: number, voxelZ: number, editableRadiusChunks = 0): boolean {
  if (!isWithinWorldHeight(voxelY)) return false;
  const extent = editableRadiusChunks * CHUNK_SIZE;
  return voxelX >= -extent && voxelX < extent + CHUNK_SIZE
    && voxelZ >= -extent && voxelZ < extent + CHUNK_SIZE;
}

/** Stable string key for a voxel coordinate, usable as a Map key. */
export function voxelKey(voxelX: number, voxelY: number, voxelZ: number): string {
  return `${voxelX},${voxelY},${voxelZ}`;
}

/** Stable string key for a chunk coordinate. */
export function chunkKey(chunkX: number, chunkY: number, chunkZ: number): string {
  return `${chunkX},${chunkY},${chunkZ}`;
}