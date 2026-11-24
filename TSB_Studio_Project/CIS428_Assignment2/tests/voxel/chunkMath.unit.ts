/**
 * Layer 1 — chunk dimension and index maths.
 *
 * Covers U-V-02 (size constants), U-V-03 (index), U-V<|place_holder_mm_span_0442|>-04 (bounds) and the
 * world-y <-> local-y conversions the chunk node relies on.
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import {
  CHUNK_LOCAL_MAX_Y,
  CHUNK_LOCAL_MIN_Y,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  CHUNK_VOXEL_COUNT,
  chunkInBounds,
  chunkIndex,
  isPlaceableWorldY,
  localYToWorldY,
  worldYToLocalY,
} from '../../src/voxel/chunkMath.js';

describe('chunkMath: dimensions', () => {
  it('is 16 wide and 16 deep', () => {
    assertEqual(CHUNK_SIZE_X, 16);
    assertEqual(CHUNK_SIZE_Z, 16);
  });

  it('covers the whole world height', () => {
      assertEqual(CHUNK_SIZE_Y, 256);
      assertEqual(CHUNK_SIZE_Y, 255 - 0 + 1);
  });

  it('has the expected voxel count', () => {
      assertEqual(CHUNK_VOXEL_COUNT, 16 * 256 * 16);
      assertEqual(CHUNK_VOXEL_COUNT, 65536);
  });

    it('spans local y from 0 to 255', () => {
    assertEqual(CHUNK_LOCAL_MIN_Y, 0);
      assertEqual(CHUNK_LOCAL_MAX_Y, 255);
  });
});

describe('chunkMath: index', () => {
  it('maps the origin to 0', () => {
    assertEqual(chunkIndex(0, 0, 0), 0);
  });

  it('advances by 1 along x', () => {
    assertEqual(chunkIndex(1, 0, 0), 1);
  });

  it('advances by sizeX along y', () => {
    assertEqual(chunkIndex(0, 1, 0), CHUNK_SIZE_X);
  });

  it('advances by sizeX * sizeY along z', () => {
    assertEqual(chunkIndex(0, 0, 1), CHUNK_SIZE_X * CHUNK_SIZE_Y);
  });

  it('is unique for every cell', () => {
    const seen = new Set<number>();
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let y = 0; y < CHUNK_SIZE_Y; y++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          seen.add(chunkIndex(x, y, z));
        }
      }
    }
    assertEqual(seen.size, CHUNK_VOXEL_COUNT);
  });

  it('stays inside the array for the last cell', () => {
    const last = chunkIndex(CHUNK_SIZE_X - 1, CHUNK_SIZE_Y - 1, CHUNK_SIZE_Z - 1);
    assertEqual(last, CHUNK_VOXEL_COUNT - 1);
  });
});

describe('chunkMath: bounds', () => {
  it('accepts the origin', () => {
    assertTrue(chunkInBounds(0, 0, 0));
  });

  it('accepts the far corner', () => {
    assertTrue(chunkInBounds(CHUNK_SIZE_X - 1, CHUNK_SIZE_Y - 1, CHUNK_SIZE_Z - 1));
  });

  it('rejects negative coordinates', () => {
    assertTrue(!chunkInBounds(-1, 0, 0));
    assertTrue(!chunkInBounds(0, -1, 0));
    assertTrue(!chunkInBounds(0, 0, -1));
  });

  it('rejects coordinates past the far corner', () => {
    assertTrue(!chunkInBounds(CHUNK_SIZE_X, 0, 0));
    assertTrue(!chunkInBounds(0, CHUNK_SIZE_Y, 0));
    assertTrue(!chunkInBounds(0, 0, CHUNK_SIZE_Z));
  });
});

describe('chunkMath: world y conversion', () => {
  it('maps world minY to local 0', () => {
    assertEqual(worldYToLocalY(0), 0);
  });

  it('maps world maxY to the last local index', () => {
    assertEqual(worldYToLocalY(255), CHUNK_LOCAL_MAX_Y);
  });

  it('round-trips', () => {
    for (const worldY of [0, 1, 2, 100, 255]) {
      assertEqual(localYToWorldY(worldYToLocalY(worldY)), worldY);
    }
  });

  it('knows the placeable range', () => {
    assertTrue(isPlaceableWorldY(0));
    assertTrue(isPlaceableWorldY(255));
    assertTrue(!isPlaceableWorldY(-1));
    assertTrue(!isPlaceableWorldY(256));
  });
});