/**
 * Layer 2 — engine voxel node.
 *
 * Verifies the engine's own `VoxelMeshNode` behaves as the build system expects:
 * it can be created headless, accepts programmatic voxel data, and rebuilds its
 * mesh on demand. This is the fallback path if the custom `VoxelChunkNode` is
 * not ready yet.
 */

import * as ENGINE from '@gnsx/genesys.js';

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { addAndBeginPlay, createHeadlessWorld } from '../world/headlessWorld.js';

describe('VoxelMeshNode: headless creation', () => {
  it('creates a node without a renderer', async () => {
    const handle = await createHeadlessWorld();
    try {
      const node = ENGINE.VoxelMeshNode.create({ name: 'Voxel' });
      assertTrue(node instanceof ENGINE.VoxelMeshNode, 'node should be a VoxelMeshNode');
    } finally {
      handle.dispose();
    }
  });

  it('accepts programmatic voxel data', async () => {
    const handle = await createHeadlessWorld();
    try {
      const node = ENGINE.VoxelMeshNode.create({ name: 'Voxel' });
      addAndBeginPlay(handle.world, node);

      node.initializeVoxel(4, 4, 4, 1, { 1: 0xff0000 });
      const state = node.getVoxelState();

      assertTrue(state != null, 'voxel state should exist after initializeVoxel');
      assertEqual(state!.sizeX, 4);
      assertEqual(state!.sizeY, 4);
      assertEqual(state!.sizeZ, 4);
      assertEqual(state!.voxels.length, 64);
    } finally {
      handle.dispose();
    }
  });

  it('reads back written voxels', async () => {
    const handle = await createHeadlessWorld();
    try {
      const node = ENGINE.VoxelMeshNode.create({ name: 'Voxel' });
      addAndBeginPlay(handle.world, node);
      node.initializeVoxel(4, 4, 4, 1, { 1: 0xff0000, 2: 0x00ff00 });

      node.setVoxel(1, 2, 3, 2);
      assertEqual(node.getVoxel(1, 2, 3), 2, 'written voxel should read back');
      assertEqual(node.getVoxel(0, 0, 0), 0, 'untouched voxel stays empty');
    } finally {
      handle.dispose();
    }
  });

  it('builds a mesh with geometry', async () => {
    const handle = await createHeadlessWorld();
    try {
      const node = ENGINE.VoxelMeshNode.create({ name: 'Voxel' });
      addAndBeginPlay(handle.world, node);
      node.initializeVoxel(2, 2, 2, 1, { 1: 0xff0000 });
      node.setVoxel(0, 0, 0, 1);
      node.buildMesh();

      const mesh = node.getMesh();
      assertTrue(mesh != null, 'mesh should exist after buildMesh');
      assertTrue(mesh!.geometry != null, 'mesh should have geometry');
      assertTrue(mesh!.geometry.getAttribute('position').count > 0, 'geometry should have vertices');
    } finally {
      handle.dispose();
    }
  });

  it('produces six faces for a single voxel', async () => {
    const handle = await createHeadlessWorld();
    try {
      const node = ENGINE.VoxelMeshNode.create({ name: 'Voxel' });
      addAndBeginPlay(handle.world, node);
      node.initializeVoxel(3, 3, 3, 1, { 1: 0xff0000 });
      node.setVoxel(1, 1, 1, 1);
      node.buildMesh();

      const mesh = node.getMesh();
      const positions = mesh!.geometry.getAttribute('position');
      // Six quads, two triangles each, three vertices per triangle.
      assertEqual(positions.count, 36, 'a single voxel should produce 36 vertices');
    } finally {
      handle.dispose();
    }
  });

  it('culls interior faces of a solid cube', async () => {
    const handle = await createHeadlessWorld();
    try {
      const node = ENGINE.VoxelMeshNode.create({ name: 'Voxel' });
      addAndBeginPlay(handle.world, node);
      node.initializeVoxel(3, 3, 3, 1, { 1: 0xff0000 });

      for (let z = 0; z < 3; z++) {
        for (let y = 0; y < 3; y++) {
          for (let x = 0; x < 3; x++) {
            node.setVoxel(x, y, z, 1);
          }
        }
      }
      node.buildMesh();

      const positions = node.getMesh()!.geometry.getAttribute('position');
      // Six merged 3x3 quads = 6 quads x 6 vertices.
      assertEqual(positions.count, 36, 'a solid cube should merge into six quads');
    } finally {
      handle.dispose();
    }
  });
});