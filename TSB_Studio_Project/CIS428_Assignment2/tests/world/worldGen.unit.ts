/**
 * Layer 1 — world generation config and region maths.
 *
 * Covers U-W-01 (config defaults), U-W-02 (editable range), U-W-03 (solid ring)
 * and U-W-04 (playable ring).
 */

import { assertDeepEqual, assertEqual, assertThrows, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import {
  DEFAULT_WORLD_GEN_CONFIG,
  carvedFloorY,
  hasCarvedCenter,
  validateWorldGenConfig,
  type WorldGenConfig,
} from '../../src/world/WorldGenConfig.js';
import {
  allGeneratedChunks,
  chunkRangeForRadius,
  chunkRangeToVoxelRange,
  editableChunkRange,
  isEditableChunk,
  isPlayableChunk,
  isSolidChunk,
  playableRingChunks,
  solidRingChunks,
} from '../../src/world/regionMath.js';

describe('WorldGenConfig: defaults', () => {
  it('uses a 16-voxel chunk', () => {
    assertEqual(DEFAULT_WORLD_GEN_CONFIG.chunkSize, 16);
  });

  it('spans the full placeable height', () => {
    assertEqual(DEFAULT_WORLD_GEN_CONFIG.minY, 0);
    assertEqual(DEFAULT_WORLD_GEN_CONFIG.maxY, 255);
  });

  it('puts the surface above the world floor', () => {
      assertEqual(DEFAULT_WORLD_GEN_CONFIG.surfaceY, 10);
      assertTrue(
        DEFAULT_WORLD_GEN_CONFIG.surfaceY > DEFAULT_WORLD_GEN_CONFIG.minY,
        'the ground needs sub-surface layers beneath it',
      );
    });

  it('nests the radii', () => {
    const c = DEFAULT_WORLD_GEN_CONFIG;
    assertTrue(c.editableRadius <= c.solidRadius, 'editable inside solid');
    assertTrue(c.solidRadius <= c.playableRadius, 'solid inside playable');
  });

  it('accepts the default config', () => {
    validateWorldGenConfig(DEFAULT_WORLD_GEN_CONFIG);
  });

  it('rejects a solid radius smaller than the editable radius', () => {
    const bad: WorldGenConfig = { ...DEFAULT_WORLD_GEN_CONFIG, editableRadius: 2, solidRadius: 1 };
    assertThrows(() => validateWorldGenConfig(bad));
  });

  it('rejects a playable radius smaller than the solid radius', () => {
    const bad: WorldGenConfig = { ...DEFAULT_WORLD_GEN_CONFIG, solidRadius: 3, playableRadius: 2 };
    assertThrows(() => validateWorldGenConfig(bad));
  });

  it('rejects a non-positive chunk size', () => {
    const bad: WorldGenConfig = { ...DEFAULT_WORLD_GEN_CONFIG, chunkSize: 0 };
    assertThrows(() => validateWorldGenConfig(bad));
  });

    it('defaults to no pit', () => {
      assertEqual(DEFAULT_WORLD_GEN_CONFIG.carveCenterDepth, 0);
      assertEqual(hasCarvedCenter(DEFAULT_WORLD_GEN_CONFIG), false);
    });

    it('accepts a pit that stays above the world floor', () => {
      const pit: WorldGenConfig = { ...DEFAULT_WORLD_GEN_CONFIG, carveCenterDepth: 8 };
      validateWorldGenConfig(pit);
      assertEqual(hasCarvedCenter(pit), true);
      assertEqual(carvedFloorY(pit), DEFAULT_WORLD_GEN_CONFIG.surfaceY - 8);
    });

    it('rejects a negative pit depth', () => {
      const bad: WorldGenConfig = { ...DEFAULT_WORLD_GEN_CONFIG, carveCenterDepth: -1 };
      assertThrows(() => validateWorldGenConfig(bad));
    });

    it('rejects a fractional pit depth', () => {
      const bad: WorldGenConfig = { ...DEFAULT_WORLD_GEN_CONFIG, carveCenterDepth: 1.5 };
      assertThrows(() => validateWorldGenConfig(bad));
    });

    it('rejects a pit that digs below the world floor', () => {
      const bad: WorldGenConfig = {
        ...DEFAULT_WORLD_GEN_CONFIG,
        carveCenterDepth: DEFAULT_WORLD_GEN_CONFIG.surfaceY - DEFAULT_WORLD_GEN_CONFIG.minY + 1,
      };
      assertThrows(() => validateWorldGenConfig(bad));
    });
});

describe('regionMath: editable range', () => {
  it('radius 0 is a single chunk', () => {
    assertDeepEqual(chunkRangeForRadius(0), { minChunkX: 0, maxChunkX: 0, minChunkZ: 0, maxChunkZ: 0 });
  });

  it('radius 1 is 3x3 chunks', () => {
    assertDeepEqual(chunkRangeForRadius(1), { minChunkX: -1, maxChunkX: 1, minChunkZ: -1, maxChunkZ: 1 });
  });

  it('rejects a negative radius', () => {
    assertThrows(() => chunkRangeForRadius(-1));
  });

  it('maps the default config to the centre chunk', () => {
    assertDeepEqual(editableChunkRange(DEFAULT_WORLD_GEN_CONFIG), {
      minChunkX: 0,
      maxChunkX: 0,
      minChunkZ: 0,
      maxChunkZ: 0,
    });
  });

  it('converts a chunk range to an inclusive voxel range', () => {
    const range = chunkRangeForRadius(0);
    assertDeepEqual(chunkRangeToVoxelRange(range, 16), { minX: 0, maxX: 15, minZ: 0, maxZ: 15 });
  });

  it('converts a negative chunk range correctly', () => {
    const range = chunkRangeForRadius(1);
    assertDeepEqual(chunkRangeToVoxelRange(range, 16), { minX: -16, maxX: 31, minZ: -16, maxZ: 31 });
  });
});

describe('regionMath: solid ring', () => {
  it('excludes the editable chunk', () => {
    const ring = solidRingChunks(DEFAULT_WORLD_GEN_CONFIG);
    assertTrue(
      !ring.some((c) => c.chunkX === 0 && c.chunkZ === 0),
      'the editable chunk must not be in the solid ring',
    );
  });

  it('has 8 chunks for radius 1 around radius 0', () => {
    assertEqual(solidRingChunks(DEFAULT_WORLD_GEN_CONFIG).length, 8);
  });

  it('has 16 chunks for radius 2 around radius 1', () => {
    const config: WorldGenConfig = { ...DEFAULT_WORLD_GEN_CONFIG, editableRadius: 1, solidRadius: 2 };
    assertEqual(solidRingChunks(config).length, 16);
  });

  it('is empty when the radii are equal', () => {
    const config: WorldGenConfig = { ...DEFAULT_WORLD_GEN_CONFIG, editableRadius: 1, solidRadius: 1 };
    assertEqual(solidRingChunks(config).length, 0);
  });
});

describe('regionMath: playable ring', () => {
  it('has 16 chunks for radius 2 around radius 1', () => {
    assertEqual(playableRingChunks(DEFAULT_WORLD_GEN_CONFIG).length, 16);
  });

  it('excludes everything inside the solid radius', () => {
    const ring = playableRingChunks(DEFAULT_WORLD_GEN_CONFIG);
    assertTrue(
      !ring.some((c) => Math.abs(c.chunkX) <= 1 && Math.abs(c.chunkZ) <= 1),
      'the playable ring must not overlap the solid region',
    );
  });

  it('is empty when the radii are equal', () => {
    const config: WorldGenConfig = { ...DEFAULT_WORLD_GEN_CONFIG, solidRadius: 2, playableRadius: 2 };
    assertEqual(playableRingChunks(config).length, 0);
  });
});

describe('regionMath: membership predicates', () => {
  it('recognises the editable chunk', () => {
    assertTrue(isEditableChunk(DEFAULT_WORLD_GEN_CONFIG, 0, 0));
    assertTrue(!isEditableChunk(DEFAULT_WORLD_GEN_CONFIG, 1, 0));
  });

  it('recognises solid chunks', () => {
    assertTrue(isSolidChunk(DEFAULT_WORLD_GEN_CONFIG, 1, 1));
    assertTrue(!isSolidChunk(DEFAULT_WORLD_GEN_CONFIG, 2, 0));
  });

  it('recognises playable chunks', () => {
    assertTrue(isPlayableChunk(DEFAULT_WORLD_GEN_CONFIG, 2, -2));
    assertTrue(!isPlayableChunk(DEFAULT_WORLD_GEN_CONFIG, 3, 0));
  });

  it('enumerates every generated chunk', () => {
    assertEqual(allGeneratedChunks(DEFAULT_WORLD_GEN_CONFIG).length, 25);
  });
});