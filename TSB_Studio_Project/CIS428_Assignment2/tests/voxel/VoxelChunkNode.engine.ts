/**
 * Layer 2 — VoxelChunkNode.
 *
 * Covers U-V-01 (class skeleton), U-V-05 (setVoxelRaw writes data only),
 * U-V-06 (markDirty flags a rebuild), U-V-12 (rebuildMesh), U-V-13 (throttled
 * rebuild) and U-V-14 (placed block count).
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { BLOCK_AIR, BLOCK_OAK_PLANKS, BLOCK_STONE } from '../../src/voxel/blockIds.js';
import { CHUNK_REBUILD_INTERVAL, VoxelChunkNode } from '../../src/voxel/VoxelChunkNode.js';
import { advanceTicks, addAndBeginPlay, createHeadlessWorld } from '../world/headlessWorld.js';

function makeChunk(chunkX = 0, chunkZ = 0): VoxelChunkNode {
  return VoxelChunkNode.create({
    name: 'TestChunk',
    chunkX,
    chunkZ,
    materials: [new THREE.MeshLambertMaterial()],
  });
}

describe('VoxelChunkNode: skeleton', () => {
  it('is a SceneNode', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      assertTrue(chunk instanceof ENGINE.SceneNode, 'chunk should extend SceneNode');
    } finally {
      handle.dispose();
    }
  });

  it('positions itself from the chunk coordinate', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk(2, -3);
      assertEqual(chunk.position.x, 32);
      assertEqual(chunk.position.z, -48);
    } finally {
      handle.dispose();
    }
  });

  it('starts clean', async () => {
    const handle = await createHeadlessWorld();
    try {
      assertTrue(!makeChunk().isDirty, 'a fresh chunk should not be dirty');
    } finally {
      handle.dispose();
    }
  });

  it('uses a 0.05s rebuild interval', async () => {
    const handle = await createHeadlessWorld();
    try {
      assertEqual(CHUNK_REBUILD_INTERVAL, 0.05);
    } finally {
      handle.dispose();
    }
  });
});

describe('VoxelChunkNode: setVoxelRaw', () => {
  it('writes a block id', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      assertTrue(chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE));
      assertEqual(chunk.getVoxelAtWorld(0, 0, 0), BLOCK_STONE);
    } finally {
      handle.dispose();
    }
  });

  it('does not mark the chunk dirty', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE);
      assertTrue(!chunk.isDirty, 'setVoxelRaw must not trigger a rebuild');
    } finally {
      handle.dispose();
    }
  });

  it('rejects coordinates outside the chunk', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      assertTrue(!chunk.setVoxelRaw(100, 0, 0, BLOCK_STONE), 'x outside the chunk should be rejected');
            assertTrue(!chunk.setVoxelRaw(0, 999, 0, BLOCK_STONE), 'y outside the world should be rejected');
    } finally {
      handle.dispose();
    }
  });

  it('maps world coordinates to the right chunk', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk(1, 0);
        const wrote = chunk.setVoxelRaw(16, 0, 0, BLOCK_STONE);
        assertTrue(wrote, `x = 16 belongs to chunk 1 (chunkX=${chunk.chunkX}, chunkZ=${chunk.chunkZ})`);
        assertEqual(chunk.getVoxelAtWorld(16, 0, 0), BLOCK_STONE);
      } finally {
        handle.dispose();
      }
    });

  it('handles negative world coordinates', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk(-1, -1);
        const wrote = chunk.setVoxelRaw(-1, 0, -1, BLOCK_STONE);
        assertTrue(wrote, `negative coords should write (chunkX=${chunk.chunkX}, chunkZ=${chunk.chunkZ})`);
        assertEqual(chunk.getVoxelAtWorld(-1, 0, -1), BLOCK_STONE);
      } finally {
        handle.dispose();
      }
    });

  it('accepts the lowest and highest world layers', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      assertTrue(chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE), 'y = 0 should be writable');
      assertTrue(chunk.setVoxelRaw(0, 255, 0, BLOCK_STONE), 'y = 255 should be writable');
    } finally {
      handle.dispose();
    }
  });
});

describe('VoxelChunkNode: markDirty and rebuild', () => {
  it('flags the chunk', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      chunk.markDirty();
      assertTrue(chunk.isDirty);
    } finally {
      handle.dispose();
    }
  });

  it('clears the flag on rebuild', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      chunk.markDirty();
      chunk.rebuildMesh();
      assertTrue(!chunk.isDirty);
    } finally {
      handle.dispose();
    }
  });

  it('counts rebuilds', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      chunk.rebuildMesh();
      chunk.rebuildMesh();
      assertEqual(chunk.rebuilds, 2);
    } finally {
      handle.dispose();
    }
  });

  it('creates a mesh child on the first rebuild', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE);
      chunk.rebuildMesh();
      const meshes = chunk.getNodes(ENGINE.MeshNode);
      assertEqual(meshes.length, 1);
    } finally {
      handle.dispose();
    }
  });

  it('reuses the mesh child on later rebuilds', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE);
      chunk.rebuildMesh();
      chunk.setVoxelRaw(1, 0, 0, BLOCK_STONE);
      chunk.rebuildMesh();
      assertEqual(chunk.getNodes(ENGINE.MeshNode).length, 1);
    } finally {
      handle.dispose();
    }
  });

  it('rebuilds on tick when dirty', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      addAndBeginPlay(handle.world, chunk);
      chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE);
      chunk.markDirty();
      advanceTicks(handle.world, 0.2);
      assertTrue(chunk.rebuilds > 0, 'the tick should have rebuilt the chunk');
    } finally {
      handle.dispose();
    }
  });

  it('throttles repeated rebuilds within one interval', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      addAndBeginPlay(handle.world, chunk);
      chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE);

      for (let i = 0; i < 10; i++) chunk.markDirty();
      advanceTicks(handle.world, 0.02);

      assertTrue(chunk.rebuilds <= 1, `expected at most 1 rebuild, got ${chunk.rebuilds}`);
    } finally {
      handle.dispose();
    }
  });
});

describe('VoxelChunkNode: placed block count', () => {
  it('starts at zero', async () => {
    const handle = await createHeadlessWorld();
    try {
      assertEqual(makeChunk().getPlacedBlockCount(), 0);
    } finally {
      handle.dispose();
    }
  });

  it('increments when a block is placed', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE);
      assertEqual(chunk.getPlacedBlockCount(), 1);
    } finally {
      handle.dispose();
    }
  });

  it('decrements when a block is broken', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE);
      chunk.setVoxelRaw(0, 0, 0, BLOCK_AIR);
      assertEqual(chunk.getPlacedBlockCount(), 0);
    } finally {
      handle.dispose();
    }
  });

  it('does not change when overwriting with the same id', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE);
      chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE);
      assertEqual(chunk.getPlacedBlockCount(), 1);
    } finally {
      handle.dispose();
    }
  });

  it('does not go negative when breaking air', async () => {
    const handle = await createHeadlessWorld();
    try {
      const chunk = makeChunk();
      chunk.setVoxelRaw(0, 0, 0, BLOCK_AIR);
      assertEqual(chunk.getPlacedBlockCount(), 0);
    } finally {
      handle.dispose();
    }
  });

    // Regression: the runtime dump reported `placedBlocks: -2`. Breaking terrain the
    // world generator made is not "un-placing", so it must leave the count alone.
    it('does not go negative when breaking generated terrain', async () => {
      const handle = await createHeadlessWorld();
      try {
        const chunk = makeChunk();
        chunk.getVolume().voxels.fill(BLOCK_STONE);
        chunk.setVoxelRaw(0, 0, 0, BLOCK_AIR);
        chunk.setVoxelRaw(1, 0, 0, BLOCK_AIR);
        assertEqual(chunk.getPlacedBlockCount(), 0);
      } finally {
        handle.dispose();
      }
    });

    it('counts a block placed over generated terrain', async () => {
      const handle = await createHeadlessWorld();
      try {
        const chunk = makeChunk();
        chunk.getVolume().voxels.fill(BLOCK_STONE);
        chunk.setVoxelRaw(0, 0, 0, BLOCK_OAK_PLANKS);
        assertEqual(chunk.getPlacedBlockCount(), 1);
      } finally {
        handle.dispose();
      }
    });

    it('keeps the count when the player replaces their own block', async () => {
      const handle = await createHeadlessWorld();
      try {
        const chunk = makeChunk();
        chunk.setVoxelRaw(0, 0, 0, BLOCK_STONE);
        chunk.setVoxelRaw(0, 0, 0, BLOCK_OAK_PLANKS);
        assertEqual(chunk.getPlacedBlockCount(), 1);
      } finally {
        handle.dispose();
      }
    });
});
