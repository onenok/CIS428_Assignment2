/**
 * Layer 1 — voxel coordinate conversions.
 */

import { assertClose, assertDeepEqual, assertEqual, assertFalse, assertThrows, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import {
  CHUNK_SIZE,
  chunkKey,
  chunkToVoxel,
  floorDiv,
  isWithinEditableRegion,
  isWithinWorldHeight,
  positiveMod,
  voxelCenter,
  voxelKey,
  voxelToChunk,
  voxelToWorld,
  worldToVoxel,
  WORLD_MAX_Y,
  WORLD_MIN_Y,
} from '../../src/voxel/coords.js';

describe('coords: floorDiv / positiveMod', () => {
  it('floors towards negative infinity', () => {
    assertEqual(floorDiv(7, 16), 0);
    assertEqual(floorDiv(16, 16), 1);
    assertEqual(floorDiv(-1, 16), -1, '-1 / 16 floors to -1, not 0');
    assertEqual(floorDiv(-16, 16), -1);
    assertEqual(floorDiv(-17, 16), -2);
  });

  it('never returns a negative modulo', () => {
    assertEqual(positiveMod(5, 16), 5);
    assertEqual(positiveMod(-1, 16), 15);
    assertEqual(positiveMod(-16, 16), 0);
    assertEqual(positiveMod(-17, 16), 15);
  });
});

describe('coords: world <-> voxel', () => {
  it('floors world positions into cells', () => {
    assertDeepEqual(worldToVoxel(0, 0, 0), { x: 0, y: 0, z: 0 });
    assertDeepEqual(worldToVoxel(0.9, 0.9, 0.9), { x: 0, y: 0, z: 0 });
    assertDeepEqual(worldToVoxel(1, 1, 1), { x: 1, y: 1, z: 1 });
    assertDeepEqual(worldToVoxel(-0.1, -0.1, -0.1), { x: -1, y: -1, z: -1 }, 'negative positions floor down');
  });

  it('honours a custom voxel size', () => {
    assertDeepEqual(worldToVoxel(1.5, 3, 0, 0.5), { x: 3, y: 6, z: 0 });
    assertDeepEqual(voxelToWorld(3, 6, 0, 0.5), { x: 1.5, y: 3, z: 0 });
  });

  it('rejects a non-positive voxel size', () => {
    assertThrows(() => worldToVoxel(0, 0, 0, 0), 'voxelSize 0 should throw');
    assertThrows(() => worldToVoxel(0, 0, 0, -1), 'negative voxelSize should throw');
  });

  it('round-trips voxel -> world -> voxel', () => {
    for (const value of [-17, -1, 0, 1, 15, 16, 255]) {
      const world = voxelToWorld(value, value, value);
      const back = worldToVoxel(world.x, world.y, world.z);
      assertEqual(back.x, value, `round-trip failed for ${value}`);
    }
  });

  it('places the centre half a voxel in', () => {
    assertDeepEqual(voxelCenter(0, 0, 0), { x: 0.5, y: 0.5, z: 0.5 });
    assertDeepEqual(voxelCenter(2, 3, 4), { x: 2.5, y: 3.5, z: 4.5 });
    assertClose(voxelCenter(0, 0, 0, 0.5).x, 0.25);
  });
});

describe('coords: voxel <-> chunk', () => {
  it('splits positive coordinates', () => {
    assertDeepEqual(voxelToChunk(0, 0, 0), { chunkX: 0, chunkY: 0, chunkZ: 0, localX: 0, localY: 0, localZ: 0 });
    assertDeepEqual(voxelToChunk(15, 15, 15), { chunkX: 0, chunkY: 0, chunkZ: 0, localX: 15, localY: 15, localZ: 15 });
    assertDeepEqual(voxelToChunk(16, 16, 16), { chunkX: 1, chunkY: 1, chunkZ: 1, localX: 0, localY: 0, localZ: 0 });
  });

  it('splits negative coordinates without losing a chunk', () => {
    assertDeepEqual(voxelToChunk(-1, -1, -1), { chunkX: -1, chunkY: -1, chunkZ: -1, localX: 15, localY: 15, localZ: 15 });
    assertDeepEqual(voxelToChunk(-16, -16, -16), { chunkX: -1, chunkY: -1, chunkZ: -1, localX: 0, localY: 0, localZ: 0 });
    assertDeepEqual(voxelToChunk(-17, -17, -17), { chunkX: -2, chunkY: -2, chunkZ: -2, localX: 15, localY: 15, localZ: 15 });
  });

  it('round-trips voxel -> chunk -> voxel', () => {
    for (const value of [-33, -17, -16, -1, 0, 1, 15, 16, 31, 32, 255]) {
      const chunk = voxelToChunk(value, value, value);
      const back = chunkToVoxel(chunk);
      assertEqual(back.x, value, `round-trip failed for ${value}`);
      assertEqual(back.y, value);
      assertEqual(back.z, value);
    }
  });

  it('keeps local coordinates inside the chunk', () => {
    for (let value = -40; value <= 40; value++) {
      const chunk = voxelToChunk(value, value, value);
      assertTrue(chunk.localX >= 0 && chunk.localX < CHUNK_SIZE, `localX out of range for ${value}`);
      assertTrue(chunk.localY >= 0 && chunk.localY < CHUNK_SIZE, `localY out of range for ${value}`);
      assertTrue(chunk.localZ >= 0 && chunk.localZ < CHUNK_SIZE, `localZ out of range for ${value}`);
    }
  });

  it('rejects a non-positive chunk size', () => {
    assertThrows(() => voxelToChunk(0, 0, 0, 0));
  });
});

describe('coords: world height limits', () => {
  it('accepts the inclusive range', () => {
    assertTrue(isWithinWorldHeight(WORLD_MIN_Y), 'min Y is placeable');
    assertTrue(isWithinWorldHeight(WORLD_MAX_Y), 'max Y is placeable');
    assertTrue(isWithinWorldHeight(0));
  });

  it('rejects outside the range', () => {
    assertFalse(isWithinWorldHeight(WORLD_MIN_Y - 1));
    assertFalse(isWithinWorldHeight(WORLD_MAX_Y + 1));
  });

  it('matches the documented bounds', () => {
      assertEqual(WORLD_MIN_Y, 0);
    assertEqual(WORLD_MAX_Y, 255);
    assertEqual(CHUNK_SIZE, 16);
  });
});

describe('coords: editable region', () => {
  it('accepts the centre chunk', () => {
    assertTrue(isWithinEditableRegion(0, 0, 0));
    assertTrue(isWithinEditableRegion(15, 0, 15));
  });

  it('rejects the neighbours of the centre chunk when radius is 0', () => {
    // `-16` used to pass: the limit was `(radius + 1) * CHUNK_SIZE` applied to
    // both ends, so radius 0 reached into chunk -1 as well.
    assertFalse(isWithinEditableRegion(-1, 0, -1));
    assertFalse(isWithinEditableRegion(-16, 0, -16));
    assertFalse(isWithinEditableRegion(16, 0, 0));
    assertFalse(isWithinEditableRegion(0, 0, -17));
  });

  it('expands with the radius', () => {
    assertTrue(isWithinEditableRegion(-16, 0, -16, 1), 'radius 1 reaches chunk -1');
    assertTrue(isWithinEditableRegion(31, 0, 31, 1), 'radius 1 reaches chunk 1');
    assertFalse(isWithinEditableRegion(32, 0, 32, 1), 'radius 1 stops before chunk 2');
    assertFalse(isWithinEditableRegion(-17, 0, -17, 1), 'radius 1 stops before chunk -2');
  });

  it('rejects out-of-range heights regardless of XZ', () => {
    assertFalse(isWithinEditableRegion(0, WORLD_MAX_Y + 1, 0));
    assertFalse(isWithinEditableRegion(0, WORLD_MIN_Y - 1, 0));
  });
});

describe('coords: keys', () => {
  it('produces distinct voxel keys', () => {
    assertEqual(voxelKey(1, 2, 3), '1,2,3');
    assertEqual(voxelKey(-1, -2, -3), '-1,-2,-3');
    assertEqual(voxelKey(1, 2, 3), voxelKey(1, 2, 3));
  });

  it('produces distinct chunk keys', () => {
    assertEqual(chunkKey(0, 0, 0), '0,0,0');
    assertEqual(chunkKey(-1, 2, -3), '-1,2,-3');
  });
});