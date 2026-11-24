/**
 * Layer 2 — world generation.
 *
 * Covers U-W-07 (surface-only outer ring), U-W-08 (world boundary) and U-W-09
 * (fog). The chunk grid itself is exercised through `generateWorld()`.
 */

import * as THREE from 'three';

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { BLOCK_AIR, BLOCK_BEDROCK } from '../../src/voxel/blockIds.js';
import { VoxelChunkNode } from '../../src/voxel/VoxelChunkNode.js';
import { DEFAULT_WORLD_GEN_CONFIG } from '../../src/world/WorldGenConfig.js';
import {
  DEFAULT_FOG_SETTINGS,
  applyFog,
  chunkNodeKey,
  fillChunkData,
  findChunkForVoxel,
  generateWorld,
} from '../../src/world/WorldGenerator.js';
import { createHeadlessWorld } from '../world/headlessWorld.js';

const config = DEFAULT_WORLD_GEN_CONFIG;
const materials = [new THREE.MeshLambertMaterial()];

describe('WorldGenerator: chunk grid', () => {
  it('creates 25 chunks for the default config', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      assertEqual(result.chunks.size, 25);
    } finally {
      handle.dispose();
    }
  });

  it('marks exactly one chunk editable', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      assertEqual(result.editableChunks.length, 1);
      assertEqual(result.editableChunks[0].chunkX, 0);
      assertEqual(result.editableChunks[0].chunkZ, 0);
    } finally {
      handle.dispose();
    }
  });

  it('keys chunks by coordinate', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      assertTrue(result.chunks.has(chunkNodeKey(0, 0)));
      assertTrue(result.chunks.has(chunkNodeKey(-2, 2)));
    } finally {
      handle.dispose();
    }
  });

  it('adds every chunk to the parent', async () => {
    const handle = await createHeadlessWorld();
    try {
      generateWorld(handle.world, config, materials);
      assertEqual(handle.world.getNodes(VoxelChunkNode).length, 25);
    } finally {
      handle.dispose();
    }
  });

  it('finds the chunk owning a voxel', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      const chunk = findChunkForVoxel(result.chunks, 20, -20);
      assertTrue(chunk != null, 'should find a chunk');
      assertEqual(chunk!.chunkX, 1);
      assertEqual(chunk!.chunkZ, -2);
    } finally {
      handle.dispose();
    }
  });

  it('returns null outside the generated grid', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      assertEqual(findChunkForVoxel(result.chunks, 1000, 1000), null);
    } finally {
      handle.dispose();
    }
  });
});

describe('WorldGenerator: terrain', () => {
  it('fills the surface layer in the editable chunk', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      const chunk = result.chunks.get(chunkNodeKey(0, 0))!;
      assertEqual(chunk.getVoxelAtWorld(0, config.surfaceY, 0), config.surfaceBlock);
    } finally {
      handle.dispose();
    }
  });

  it('fills deep layers in the editable chunk', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      const chunk = result.chunks.get(chunkNodeKey(0, 0))!;
      assertEqual(chunk.getVoxelAtWorld(0, config.minY, 0), config.subSurfaceBlock);
    } finally {
      handle.dispose();
    }
  });

  it('leaves air above the surface', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      const chunk = result.chunks.get(chunkNodeKey(0, 0))!;
      assertEqual(chunk.getVoxelAtWorld(0, config.surfaceY + 1, 0), BLOCK_AIR);
    } finally {
      handle.dispose();
    }
  });

  it('fills the solid ring at full height', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      const ring = result.chunks.get(chunkNodeKey(1, 0))!;
      assertEqual(ring.getVoxelAtWorld(16, config.minY, 0), config.subSurfaceBlock);
    } finally {
      handle.dispose();
    }
  });

  it('fills only one layer in the playable ring', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      const outer = result.chunks.get(chunkNodeKey(2, 0))!;
      assertEqual(outer.getVoxelAtWorld(32, config.surfaceY, 0), config.surfaceBlock);
      assertEqual(outer.getVoxelAtWorld(32, config.surfaceY - 1, 0), BLOCK_AIR);
      assertEqual(outer.getVoxelAtWorld(32, config.minY, 0), BLOCK_AIR);
    } finally {
      handle.dispose();
    }
  });

  it('reports a positive voxel count', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      assertTrue(result.voxelCount > 0, 'generation should produce voxels');
    } finally {
      handle.dispose();
    }
  });

  it('counts more voxels for full-height chunks than surface-only ones', async () => {
    const handle = await createHeadlessWorld();
    try {
      const full = VoxelChunkNode.create({ name: 'Full', materials });
      const surface = VoxelChunkNode.create({ name: 'Surface', materials });
      const fullCount = fillChunkData(full, config, false);
      const surfaceCount = fillChunkData(surface, config, true);
      assertTrue(fullCount > surfaceCount, 'full-height chunks hold more voxels');
      assertEqual(surfaceCount, 16 * 16);
    } finally {
      handle.dispose();
    }
  });
});

describe('WorldGenerator: central pit', () => {
  const pitConfig = { ...config, carveCenterDepth: 8 };
  const floorY = pitConfig.surfaceY - pitConfig.carveCenterDepth;

  it('digs the pit out of the editable chunk only', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, pitConfig, materials);
      const centre = result.chunks.get(chunkNodeKey(0, 0))!;
      assertEqual(centre.getVoxelAtWorld(0, pitConfig.surfaceY, 0), BLOCK_AIR, 'the grass top is gone');
      assertEqual(centre.getVoxelAtWorld(15, pitConfig.surfaceY, 15), BLOCK_AIR, 'the far corner too');
      assertEqual(centre.getVoxelAtWorld(0, floorY + 1, 0), BLOCK_AIR, 'the pit is open');

      // The rim must stay walkable, otherwise the player has nowhere to stand.
      const ring = result.chunks.get(chunkNodeKey(1, 0))!;
      assertEqual(ring.getVoxelAtWorld(16, pitConfig.surfaceY, 0), pitConfig.surfaceBlock);
    } finally {
      handle.dispose();
    }
  });

  it('floors the pit with bedrock', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, pitConfig, materials);
      const centre = result.chunks.get(chunkNodeKey(0, 0))!;
      assertEqual(centre.getVoxelAtWorld(0, floorY, 0), BLOCK_BEDROCK);
      assertEqual(centre.getVoxelAtWorld(15, floorY, 15), BLOCK_BEDROCK);
      assertEqual(centre.getVoxelAtWorld(0, floorY - 1, 0), pitConfig.subSurfaceBlock);
    } finally {
      handle.dispose();
    }
  });

  it('leaves the default config flat', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, config, materials);
      const centre = result.chunks.get(chunkNodeKey(0, 0))!;
      assertEqual(centre.getVoxelAtWorld(0, config.surfaceY, 0), config.surfaceBlock);
    } finally {
      handle.dispose();
    }
  });
});

describe('WorldGenerator: fog', () => {
  it('attaches fog to the scene', async () => {
    const handle = await createHeadlessWorld();
    try {
      const scene = new THREE.Scene();
      applyFog(scene);
      assertTrue(scene.fog != null, 'scene should have fog');
    } finally {
      handle.dispose();
    }
  });

  it('uses the default settings', async () => {
    const handle = await createHeadlessWorld();
    try {
      const scene = new THREE.Scene();
      const fog = applyFog(scene) as THREE.Fog;
      assertEqual(fog.near, DEFAULT_FOG_SETTINGS.near);
      assertEqual(fog.far, DEFAULT_FOG_SETTINGS.far);
    } finally {
      handle.dispose();
    }
  });

  it('accepts custom settings', async () => {
    const handle = await createHeadlessWorld();
    try {
      const scene = new THREE.Scene();
      const fog = applyFog(scene, { color: 0x112233, near: 5, far: 15 }) as THREE.Fog;
      assertEqual(fog.near, 5);
      assertEqual(fog.far, 15);
    } finally {
      handle.dispose();
    }
  });

  it('fades out before the playable ring ends', async () => {
      const handle = await createHeadlessWorld();
      try {
        // The playable ring spans chunk -2..2, i.e. voxels -32..47. From the
        // centre chunk the far edge is 48 voxels away, so fog must close before
        // that or the player sees the world end.
        const ringEdge = (config.playableRadius + 1) * config.chunkSize;
        assertEqual(ringEdge, 48);
        assertTrue(DEFAULT_FOG_SETTINGS.far <= ringEdge, 'fog should hide the ring edge');
      } finally {
        handle.dispose();
      }
    });
});