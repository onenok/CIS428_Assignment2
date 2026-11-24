/**
 * Layer 1 — terrain fill rules.
 *
 * Covers U-W-05 (flat surface in the editable region) and U-W-06 (deep fill
 * from y = 0 up to the surface).
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { BLOCK_BEDROCK } from '../../src/voxel/blockIds.js';
import { EMPTY } from '../../src/voxel/mesher.js';
import { DEFAULT_WORLD_GEN_CONFIG, type WorldGenConfig } from '../../src/world/WorldGenConfig.js';
import {
  blockIdForCarvedColumn,
  blockIdForFullHeightColumn,
  blockIdForSurfaceOnlyColumn,
  fillColumn,
  fullHeightColumnSolidCount,
  surfaceOnlyColumnSolidCount,
} from '../../src/world/terrainFill.js';

const config = DEFAULT_WORLD_GEN_CONFIG;

/** A config with an eight-layer pit, i.e. what the game actually ships. */
const pitConfig: WorldGenConfig = { ...config, carveCenterDepth: 8 };

describe('terrainFill: full-height column', () => {
  it('puts the surface block at surfaceY', () => {
    assertEqual(blockIdForFullHeightColumn(config, config.surfaceY), config.surfaceBlock);
  });

  it('puts the sub-surface block just below the surface', () => {
    assertEqual(blockIdForFullHeightColumn(config, config.surfaceY - 1), config.subSurfaceBlock);
  });

  it('fills all the way down to minY', () => {
    assertEqual(blockIdForFullHeightColumn(config, config.minY), config.subSurfaceBlock);
  });

  it('leaves air above the surface', () => {
    assertEqual(blockIdForFullHeightColumn(config, config.surfaceY + 1), EMPTY);
    assertEqual(blockIdForFullHeightColumn(config, config.maxY), EMPTY);
  });

  it('leaves air below minY', () => {
    assertEqual(blockIdForFullHeightColumn(config, config.minY - 1), EMPTY);
  });

  it('counts the solid layers', () => {
    assertEqual(fullHeightColumnSolidCount(config), config.surfaceY - config.minY + 1);
    assertEqual(fullHeightColumnSolidCount(config), 11);
  });
});

describe('terrainFill: surface-only column', () => {
  it('fills exactly one layer', () => {
    assertEqual(blockIdForSurfaceOnlyColumn(config, config.surfaceY), config.surfaceBlock);
    assertEqual(surfaceOnlyColumnSolidCount(config), 1);
  });

  it('leaves everything else empty', () => {
    assertEqual(blockIdForSurfaceOnlyColumn(config, config.surfaceY - 1), EMPTY);
    assertEqual(blockIdForSurfaceOnlyColumn(config, config.surfaceY + 1), EMPTY);
    assertEqual(blockIdForSurfaceOnlyColumn(config, config.minY), EMPTY);
  });
});

describe('terrainFill: carved column', () => {
  it('floors the pit with bedrock', () => {
    assertEqual(blockIdForCarvedColumn(pitConfig, pitConfig.surfaceY - 8), BLOCK_BEDROCK);
  });

  it('leaves the whole pit column above the floor empty', () => {
    for (let y = pitConfig.surfaceY - 7; y <= pitConfig.surfaceY; y++) {
      assertEqual(blockIdForCarvedColumn(pitConfig, y), EMPTY, `y = ${y} should be air`);
    }
    assertEqual(blockIdForCarvedColumn(pitConfig, pitConfig.maxY), EMPTY);
  });

  it('keeps rock beneath the pit floor', () => {
    assertEqual(blockIdForCarvedColumn(pitConfig, pitConfig.surfaceY - 9), pitConfig.subSurfaceBlock);
    assertEqual(blockIdForCarvedColumn(pitConfig, pitConfig.minY), pitConfig.subSurfaceBlock);
  });

  it('behaves like a flat column when the depth is zero', () => {
    for (let y = config.minY; y <= config.maxY; y++) {
      assertEqual(
        blockIdForCarvedColumn(config, y),
        blockIdForFullHeightColumn(config, y),
        `y = ${y} must match the flat world`,
      );
    }
  });
});

describe('terrainFill: fillColumn', () => {
  it('visits every layer in range', () => {
    const visited: number[] = [];
    fillColumn(config, false, (localY) => visited.push(localY));
    assertEqual(visited.length, config.maxY - config.minY + 1);
    assertEqual(visited[0], config.minY);
    assertEqual(visited[visited.length - 1], config.maxY);
  });

  it('writes the expected ids for a full-height column', () => {
    const written = new Map<number, number>();
    fillColumn(config, false, (localY, id) => written.set(localY, id));

    assertEqual(written.get(config.surfaceY), config.surfaceBlock);
    assertEqual(written.get(config.surfaceY - 1), config.subSurfaceBlock);
    assertEqual(written.get(config.minY), config.subSurfaceBlock);
    assertEqual(written.get(config.surfaceY + 1), EMPTY);
  });

  it('writes only the surface for a surface-only column', () => {
    const written = new Map<number, number>();
    fillColumn(config, true, (localY, id) => written.set(localY, id));

    let solid = 0;
    for (const id of written.values()) if (id !== EMPTY) solid++;
    assertEqual(solid, 1);
    assertEqual(written.get(config.surfaceY), config.surfaceBlock);
  });

  it('respects a custom surface height', () => {
    const custom: WorldGenConfig = { ...config, surfaceY: 5 };
    assertEqual(blockIdForFullHeightColumn(custom, 5), custom.surfaceBlock);
    assertEqual(blockIdForFullHeightColumn(custom, 4), custom.subSurfaceBlock);
    assertEqual(blockIdForFullHeightColumn(custom, 6), EMPTY);
    assertTrue(fullHeightColumnSolidCount(custom) === 6, 'y = 0..5 is 6 layers');
  });
});