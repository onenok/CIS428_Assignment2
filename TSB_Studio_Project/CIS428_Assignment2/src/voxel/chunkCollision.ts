/**
 * Voxel collision data for a chunk.
 *
 * The chunk mesh is only a visual. Without a collider the player falls straight
 * through the ground and the build raycast has nothing to hit, so every chunk
 * also needs a physics body.
 *
 * The engine's `CollisionMeshType.Voxels` takes a flat `Int32Array` of grid
 * coordinates — three integers per solid voxel — plus a `voxelSize` and an
 * `offset` that place the grid in the node's local space. That is a much better
 * fit than a trimesh: it is cheap to build, exact for axis-aligned cubes, and it
 * can be rebuilt whenever the player edits a block.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z, chunkIndex } from './chunkMath.js';
import { EMPTY, type VoxelVolume } from './mesher.js';

/**
 * Builds the flat grid-coordinate array the engine's voxel collider expects.
 *
 * Only solid voxels are emitted. A chunk is 16 x 256 x 16, so the worst case is
 * 68k voxels — a 204k-entry `Int32Array`, about 800 KB. That only happens for a
 * fully solid chunk; the surface-only ring chunks emit a single layer.
 */
export function buildVoxelCollisionCoordinates(volume: VoxelVolume): Int32Array {
  const voxels = volume.voxels;

  let solidCount = 0;
  for (let i = 0; i < voxels.length; i++) {
    if (voxels[i] !== EMPTY) solidCount++;
  }

  const coordinates = new Int32Array(solidCount * 3);
  let cursor = 0;

  for (let z = 0; z < CHUNK_SIZE_Z; z++) {
    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        if (voxels[chunkIndex(x, y, z)] === EMPTY) continue;
        coordinates[cursor++] = x;
        coordinates[cursor++] = y;
        coordinates[cursor++] = z;
      }
    }
  }

  return coordinates;
}

/**
 * Physics options for a chunk's collider.
 *
 * Rapier's voxel collider takes *signed grid coordinates*: voxel `(x, y, z)`
 * occupies `[x * voxelSize, (x + 1) * voxelSize)` on each axis. Our voxel data
 * uses exactly the same convention — grid cell `(0, 0, 0)` covers local
 * `[0, 1) x [0, 1) x [0, 1)` — so the grid needs **no** translation.
 *
 * An earlier version passed `offset: (0.5, 0.5, 0.5)`, which shifted every
 * collider half a block along +X/+Y/+Z. That is why the player stood 0.51 above
 * the ground and why the F3+B wireframe was visibly offset from the blocks.
 */
export function buildChunkPhysicsOptions(volume: VoxelVolume): ENGINE.NodePhysicsOptions {
  return {
    enabled: true,
    motionType: ENGINE.PhysicsMotionType.Static,
    collisionMeshType: ENGINE.CollisionMeshType.Voxels,
    collisionData: {
      voxels: {
        voxelSize: new THREE.Vector3(1, 1, 1),
        coordinates: buildVoxelCollisionCoordinates(volume),
      },
    },
  };
}