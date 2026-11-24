/**
 * World generation for the actual game.
 *
 * Kept out of `MyGameMode` so it can be imported by unit tests without pulling in
 * the engine: that file imports `@gnsx/genesys.js`, which needs a scene and a
 * renderer, while this one is pure data.
 *
 * Identical to {@link DEFAULT_WORLD_GEN_CONFIG} except for the central pit. The
 * pit is what the assignment asks the player to build inside, so it belongs to
 * the game and not to the world-generation baseline (whose tests assume flat
 * ground).
 */

import {
  DEFAULT_WORLD_GEN_CONFIG,
  carvedFloorY,
  type WorldGenConfig,
} from './WorldGenConfig.js';

/**
 * Voxel layer that holds the pit floor, i.e. the bedrock the player stands on.
 *
 * The brief says the bedrock belongs at `y = 0`, the bottom of the world. The
 * pit is therefore as deep as the sub-surface is thick: the floor is dug out
 * down to `minY` rather than stopping short of it.
 */
export const PIT_FLOOR_Y = DEFAULT_WORLD_GEN_CONFIG.minY;

export const GAMEPLAY_WORLD_GEN_CONFIG: WorldGenConfig = {
  ...DEFAULT_WORLD_GEN_CONFIG,
  // surfaceY (10) - minY (0) = 10 layers of dirt above a floor at y = 0.
  carveCenterDepth: DEFAULT_WORLD_GEN_CONFIG.surfaceY - PIT_FLOOR_Y,
};

/**
 * Sanity check for the one invariant that matters visually: the bedrock slab is
 * the bottom of the world, so there is no air pocket under it for the player to
 * fall through.
 */
export function pitFloorIsWorldFloor(config: WorldGenConfig = GAMEPLAY_WORLD_GEN_CONFIG): boolean {
  return carvedFloorY(config) === config.minY;
}