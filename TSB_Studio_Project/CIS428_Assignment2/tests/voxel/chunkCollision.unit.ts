/**
 * Layer 1 — chunk collision data.
 *
 * The chunk mesh is only visual. These tests pin the collider payload that makes
 * the ground walkable and the build raycast hit something.
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { BLOCK_GRASS, BLOCK_STONE } from '../../src/voxel/blockIds.js';
import { buildChunkPhysicsOptions, buildVoxelCollisionCoordinates } from '../../src/voxel/chunkCollision.js';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../../src/voxel/chunkMath.js';
import { createVolume, setVoxel } from '../../src/voxel/mesher.js';

describe('chunkCollision: coordinates', () => {
  it('emits nothing for an empty volume', () => {
    const volume = createVolume(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z);
    assertEqual(buildVoxelCollisionCoordinates(volume).length, 0);
  });

  it('emits three integers per solid voxel', () => {
    const volume = createVolume(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z);
    setVoxel(volume, 2, 3, 4, BLOCK_STONE);
    const coordinates = buildVoxelCollisionCoordinates(volume);
    assertEqual(coordinates.length, 3);
    assertEqual(coordinates[0], 2);
    assertEqual(coordinates[1], 3);
    assertEqual(coordinates[2], 4);
  });

  it('emits every solid voxel of a flat surface layer', () => {
    const volume = createVolume(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z);
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        setVoxel(volume, x, 10, z, BLOCK_GRASS);
      }
    }
    const coordinates = buildVoxelCollisionCoordinates(volume);
    assertEqual(coordinates.length, CHUNK_SIZE_X * CHUNK_SIZE_Z * 3);
  });

  it('skips air voxels between solid ones', () => {
    const volume = createVolume(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z);
    setVoxel(volume, 0, 0, 0, BLOCK_STONE);
    setVoxel(volume, 5, 5, 5, BLOCK_STONE);
    const coordinates = buildVoxelCollisionCoordinates(volume);
    assertEqual(coordinates.length, 6);
  });
});

describe('chunkCollision: physics options', () => {
  it('enables a static voxel collider', () => {
    const volume = createVolume(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z);
    setVoxel(volume, 1, 1, 1, BLOCK_STONE);
    const options = buildChunkPhysicsOptions(volume);
    assertEqual(options.enabled, true);
    assertEqual(options.motionType, 'static');
    assertEqual(options.collisionMeshType, 'voxels');
  });

  it('uses one-metre voxels', () => {
    const volume = createVolume(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z);
    const options = buildChunkPhysicsOptions(volume);
    const size = options.collisionData?.voxels?.voxelSize;
    assertTrue(size !== undefined);
    assertEqual(size!.x, 1);
    assertEqual(size!.y, 1);
    assertEqual(size!.z, 1);
  });

  it('leaves the grid untranslated so cell 0 covers [0, 1)', () => {
      // Rapier's voxel collider takes signed grid coordinates: voxel (x, y, z)
      // occupies [x, x+1) on each axis. Our voxel data uses the same convention,
      // so any offset would shift every collider away from its rendered block.
      const volume = createVolume(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z);
      const options = buildChunkPhysicsOptions(volume);
      const offset = options.collisionData?.voxels?.offset;
      assertTrue(offset === undefined, 'voxel grid must not be translated');
  });

  it('carries the coordinates through unchanged', () => {
    const volume = createVolume(CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z);
    setVoxel(volume, 7, 8, 9, BLOCK_STONE);
    const options = buildChunkPhysicsOptions(volume);
    const coordinates = options.collisionData?.voxels?.coordinates;
    assertTrue(coordinates !== undefined);
    assertEqual(coordinates!.length, 3);
    assertEqual(coordinates![0], 7);
    assertEqual(coordinates![1], 8);
    assertEqual(coordinates![2], 9);
  });
});