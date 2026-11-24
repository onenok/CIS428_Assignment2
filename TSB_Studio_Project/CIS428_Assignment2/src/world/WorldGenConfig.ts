/**
 * World generation configuration.
 *
 * The world is a flat voxel plane split into three concentric regions:
 *
 *   editable  - the 16x16 chunk the player may build in (full height)
 *   solid     - a ring of chunks around it, also full height, so the player
 *               never sees the void from inside the build area
 *   playable  - one extra ring of chunks that only gets a single surface layer,
 *               purely so the horizon does not end abruptly
 *
 * Everything outside `playable` is left empty and hidden by fog.
 *
 * All radii are measured in chunks (16 voxels), not voxels, because that is the
 * unit the chunk grid works in.
 */

import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../voxel/coords.js';

export interface WorldGenConfig {
  /** Edge length of one chunk, in voxels. */
  readonly chunkSize: number;
  /** Radius of the editable region, in chunks. 0 = a single chunk. */
  readonly editableRadius: number;
  /** Radius of the full-height solid region, in chunks. Must be >= editableRadius. */
  readonly solidRadius: number;
  /** Radius of the surface-only region, in chunks. Must be >= solidRadius. */
  readonly playableRadius: number;
  /** Voxel layer that the flat surface sits on. */
  readonly surfaceY: number;
  /** Lowest generated voxel layer. */
  readonly minY: number;
  /** Highest generated voxel layer. */
  readonly maxY: number;
  /** Block id used for the surface layer. */
  readonly surfaceBlock: number;
  /** Block id used for everything below the surface. */
  readonly subSurfaceBlock: number;
    /**
     * How many voxel layers to carve out of the editable chunk, in voxels.
     *
     * `0` means "no pit" — the editable chunk is a normal flat surface. A positive
     * value removes everything above `surfaceY - carveCenterDepth` and lays one
     * layer of bedrock at that floor, which is the central pit the build mechanic
     * happens inside.
     *
     * Defaults must stay `0`: the pit is a gameplay decision made by
     * `GAMEPLAY_WORLD_GEN_CONFIG`, not by the world-generation baseline.
     */
    readonly carveCenterDepth: number;
}

/**
 * Defaults matching the design brief:
 *   - one editable chunk (16x16)
 *   - one solid ring around it (3x3 chunks = 48x48)
 *   - one surface-only ring around that (5x5 chunks = 80x80)
 *   - flat ground at y = 10, world spans y = 0 .. 255
 *
  * `surfaceY` is 10 rather than 0 so the ground has ten layers of sub-surface
 * blocks beneath it. With `minY = 0` a surface at 0 would leave a single-layer
 * floor with void underneath, which the player could dig straight through.
 */
export const DEFAULT_WORLD_GEN_CONFIG: WorldGenConfig = {
  chunkSize: CHUNK_SIZE,
  editableRadius: 0,
  solidRadius: 1,
  playableRadius: 2,
   surfaceY: 10,
  minY: WORLD_MIN_Y,
  maxY: WORLD_MAX_Y,
  surfaceBlock: 1,
  subSurfaceBlock: 2,
    carveCenterDepth: 0,
};

/**
 * World-space Y of the top face of the ground.
 *
 * `surfaceY` is the *voxel layer* that holds the surface block, and a voxel
 * occupies `[y, y + 1)`. So the walkable surface is one metre above the layer
 * index, not at it. Anything that places something on the ground — the player
 * spawn, the Loomkeeper, a preview block — must start from this value.
 */
export const GROUND_SURFACE_Y = DEFAULT_WORLD_GEN_CONFIG.surfaceY + 1;

/**
 * Voxel layer that holds the bedrock floor of the central pit.
 *
 * Meaningless when {@link hasCarvedCenter} is false; callers must check that
 * first (this returns `surfaceY` for a depth of 0, which would put bedrock in
 * the surface layer).
 */
export function carvedFloorY(config: WorldGenConfig): number {
  return config.surfaceY - config.carveCenterDepth;
}

/** True when the config asks for a pit in the editable chunk. */
export function hasCarvedCenter(config: WorldGenConfig): boolean {
  return config.carveCenterDepth > 0;
}

/** Throws when the radii are not monotonically increasing. */
export function validateWorldGenConfig(config: WorldGenConfig): void {
  if (config.chunkSize <= 0) {
    throw new Error(`WorldGenConfig: chunkSize must be positive, got ${config.chunkSize}`);
  }
  if (config.editableRadius < 0) {
    throw new Error(`WorldGenConfig: editableRadius must be >= 0, got ${config.editableRadius}`);
  }
  if (config.solidRadius < config.editableRadius) {
    throw new Error(
      `WorldGenConfig: solidRadius (${config.solidRadius}) must be >= editableRadius (${config.editableRadius})`,
    );
  }
  if (config.playableRadius < config.solidRadius) {
    throw new Error(
      `WorldGenConfig: playableRadius (${config.playableRadius}) must be >= solidRadius (${config.solidRadius})`,
    );
  }
  if (config.minY > config.surfaceY) {
    throw new Error(`WorldGenConfig: minY (${config.minY}) must be <= surfaceY (${config.surfaceY})`);
  }
  if (config.maxY < config.surfaceY) {
    throw new Error(`WorldGenConfig: maxY (${config.maxY}) must be >= surfaceY (${config.surfaceY})`);
  }
    if (!Number.isInteger(config.carveCenterDepth) || config.carveCenterDepth < 0) {
      throw new Error(
        `WorldGenConfig: carveCenterDepth must be a non-negative integer, got ${config.carveCenterDepth}`,
      );
    }
    if (carvedFloorY(config) < config.minY) {
      throw new Error(
        `WorldGenConfig: carveCenterDepth (${config.carveCenterDepth}) digs below minY (${config.minY})`,
      );
    }
}