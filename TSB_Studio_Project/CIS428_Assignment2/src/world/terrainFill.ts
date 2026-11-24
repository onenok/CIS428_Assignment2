/**
 * Terrain fill rules.
 *
 * These functions decide *which block id* goes into a given voxel layer. They
 * are pure: no engine types, no rendering, no chunk bookkeeping. The chunk node
 * calls them while generating its own voxel array.
 *
 * Layer semantics (all relative to `config.surfaceY`):
 *   y === surfaceY          -> surface block (grass)
 *   minY <= y < surfaceY    -> sub-surface block (dirt / stone)
 *   y > surfaceY            -> air
  *
  * A carved column (the central pit) replaces the top `carveCenterDepth` layers
  * with air and puts bedrock at the bottom of the hole; see
  * {@link blockIdForCarvedColumn}.
 */

import { BLOCK_BEDROCK } from '../voxel/blockIds.js';
import { EMPTY } from '../voxel/mesher.js';
import { carvedFloorY, type WorldGenConfig } from './WorldGenConfig.js';

/**
 * Block id for a voxel inside a full-height region (editable or solid ring).
 *
 * Returns `EMPTY` above the surface so the build area starts with open air.
 */
export function blockIdForFullHeightColumn(config: WorldGenConfig, voxelY: number): number {
  if (voxelY > config.surfaceY) return EMPTY;
  if (voxelY < config.minY) return EMPTY;
  if (voxelY === config.surfaceY) return config.surfaceBlock;
  return config.subSurfaceBlock;
}

/**
 * Block id for a voxel inside a carved (pit) column.
 *
 * Everything above the floor is air — that is the hole. The floor layer itself
 * is bedrock, and everything below it keeps the normal sub-surface block so the
 * pit walls below the bedrock line are still solid rock.
 *
 * A config with no pit falls back to the full-height rules, so callers can pass
 * `carved = true` unconditionally and still get a flat world.
 */
export function blockIdForCarvedColumn(config: WorldGenConfig, voxelY: number): number {
  if (config.carveCenterDepth <= 0) return blockIdForFullHeightColumn(config, voxelY);

  const floorY = carvedFloorY(config);
  if (voxelY > floorY) return EMPTY;
  if (voxelY < config.minY) return EMPTY;
  if (voxelY === floorY) return BLOCK_BEDROCK;
  return config.subSurfaceBlock;
}

/**
 * Block id for a voxel inside the surface-only outer ring.
 *
 * Only the single surface layer is filled; everything else is air. This keeps
 * the horizon from ending abruptly without paying for full-height chunks.
 */
export function blockIdForSurfaceOnlyColumn(config: WorldGenConfig, voxelY: number): number {
  return voxelY === config.surfaceY ? config.surfaceBlock : EMPTY;
}

/**
 * Fills one vertical column of a chunk's voxel array.
 *
 * `write` is called with the local y index and the block id for every layer in
 * `[minY, maxY]`. Passing a callback keeps this function independent of the
 * chunk's storage layout.
 */
export function fillColumn(
  config: WorldGenConfig,
  surfaceOnly: boolean,
  write: (localY: number, blockId: number) => void,
): void {
  const pick = surfaceOnly ? blockIdForSurfaceOnlyColumn : blockIdForFullHeightColumn;
  for (let y = config.minY; y <= config.maxY; y++) {
    write(y, pick(config, y));
  }
}

/**
 * Counts how many voxels a full-height column contributes.
 *
 * Used by tests and by the chunk node to pre-size buffers.
 */
export function fullHeightColumnSolidCount(config: WorldGenConfig): number {
  return config.surfaceY - config.minY + 1;
}

/** Counts how many voxels a surface-only column contributes. */
export function surfaceOnlyColumnSolidCount(config: WorldGenConfig): number {
  return config.surfaceY >= config.minY && config.surfaceY <= config.maxY ? 1 : 0;
}