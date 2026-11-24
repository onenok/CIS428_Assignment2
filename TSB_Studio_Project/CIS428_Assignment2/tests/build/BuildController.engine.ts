/**
 * Layer 2 — build controller.
 *
 * Covers U-B-01 / U-B-02 (raycast from camera), U-B-07 (single placement with
 * place mode), U-B-08 (single break) and U-B-15 (no rebuild during a drag).
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { BuildController } from '../../src/build/BuildController.js';
import { buildBoundsForRadius } from '../../src/build/placement.js';
import { BLOCK_AIR, BLOCK_BEDROCK, BLOCK_DIRT, BLOCK_STONE } from '../../src/voxel/blockIds.js';
import { VoxelChunkNode } from '../../src/voxel/VoxelChunkNode.js';
import { chunkNodeKey } from '../../src/world/WorldGenerator.js';
import { addAndBeginPlay, createHeadlessWorld, stepPhysics } from '../world/headlessWorld.js';

const bounds = buildBoundsForRadius(0, 16);

async function makeController() {
  const handle = await createHeadlessWorld();
  const chunk = VoxelChunkNode.create({
    name: 'Chunk',
    chunkX: 0,
    chunkZ: 0,
    materials: [new THREE.MeshLambertMaterial()],
  });
  addAndBeginPlay(handle.world, chunk);

  const chunks = new Map<string, VoxelChunkNode>([[chunkNodeKey(0, 0), chunk]]);
  const controller = new BuildController({ chunks, bounds, physics: handle.physics });

  return { handle, chunk, controller };
}

describe('BuildController: placement', () => {
  it('writes a block into an empty cell', async () => {
    const { handle, chunk, controller } = await makeController();
    try {
      const result = controller.place({ x: 0, y: 5, z: 0 }, BLOCK_STONE);
      assertTrue(result.ok, 'placement should succeed');
      assertEqual(chunk.getVoxelAtWorld(0, 5, 0), BLOCK_STONE);
    } finally {
      handle.dispose();
    }
  });

  it('rejects a cell outside the build region', async () => {
    const { handle, controller } = await makeController();
    try {
      const result = controller.place({ x: 100, y: 5, z: 0 }, BLOCK_STONE);
      assertTrue(!result.ok, 'out-of-bounds placement should fail');
      if (!result.ok) assertEqual(result.reason, 'outOfBounds');
    } finally {
      handle.dispose();
    }
  });

  it('rejects a cell above the world height', async () => {
    const { handle, controller } = await makeController();
    try {
      const result = controller.place({ x: 0, y: 300, z: 0 }, BLOCK_STONE);
      assertTrue(!result.ok);
      if (!result.ok) assertEqual(result.reason, 'outOfBounds');
    } finally {
      handle.dispose();
    }
  });

  it('overwrites an occupied cell in replace mode', async () => {
    const { handle, chunk, controller } = await makeController();
    try {
      controller.place({ x: 0, y: 5, z: 0 }, BLOCK_STONE);
      controller.setPlaceMode('replace');
      const result = controller.place({ x: 0, y: 5, z: 0 }, BLOCK_DIRT);
      assertTrue(result.ok);
      assertEqual(chunk.getVoxelAtWorld(0, 5, 0), BLOCK_DIRT);
    } finally {
      handle.dispose();
    }
  });

  it('skips an occupied cell in skip mode', async () => {
    const { handle, chunk, controller } = await makeController();
    try {
      controller.place({ x: 0, y: 5, z: 0 }, BLOCK_STONE);
      controller.setPlaceMode('skip');
      const result = controller.place({ x: 0, y: 5, z: 0 }, BLOCK_DIRT);
      assertTrue(!result.ok);
      if (!result.ok) assertEqual(result.reason, 'skipped');
      assertEqual(chunk.getVoxelAtWorld(0, 5, 0), BLOCK_STONE);
    } finally {
      handle.dispose();
    }
  });

  it('defaults to replace mode', async () => {
    const { handle, controller } = await makeController();
    try {
      assertEqual(controller.getPlaceMode(), 'replace');
    } finally {
      handle.dispose();
    }
  });

  it('marks the chunk dirty', async () => {
    const { handle, chunk, controller } = await makeController();
    try {
      controller.place({ x: 0, y: 5, z: 0 }, BLOCK_STONE);
      assertTrue(chunk.isDirty, 'placement should flag a rebuild');
    } finally {
      handle.dispose();
    }
  });
});

describe('BuildController: breaking', () => {
  it('removes a block', async () => {
    const { handle, chunk, controller } = await makeController();
    try {
      controller.place({ x: 0, y: 5, z: 0 }, BLOCK_STONE);
      const result = controller.break({ x: 0, y: 5, z: 0 });
      assertTrue(result.ok);
      assertEqual(chunk.getVoxelAtWorld(0, 5, 0), BLOCK_AIR);
    } finally {
      handle.dispose();
    }
  });

  it('reports the previous block id', async () => {
    const { handle, controller } = await makeController();
    try {
      controller.place({ x: 0, y: 5, z: 0 }, BLOCK_DIRT);
      const result = controller.break({ x: 0, y: 5, z: 0 });
      assertTrue(result.ok);
      if (result.ok) assertEqual(result.previousBlockId, BLOCK_DIRT);
    } finally {
      handle.dispose();
    }
  });

  it('rejects breaking air', async () => {
    const { handle, controller } = await makeController();
    try {
      const result = controller.break({ x: 0, y: 5, z: 0 });
      assertTrue(!result.ok);
      if (!result.ok) assertEqual(result.reason, 'empty');
    } finally {
      handle.dispose();
    }
  });

  it('rejects breaking outside the region', async () => {
    const { handle, controller } = await makeController();
    try {
      const result = controller.break({ x: 100, y: 5, z: 0 });
      assertTrue(!result.ok);
      if (!result.ok) assertEqual(result.reason, 'outOfBounds');
    } finally {
      handle.dispose();
    }
  });
});

describe('BuildController: bedrock protection', () => {
  it('refuses to break bedrock', async () => {
    const { handle, chunk, controller } = await makeController();
    try {
      chunk.setVoxelRaw(0, 3, 0, BLOCK_BEDROCK);
      const result = controller.break({ x: 0, y: 3, z: 0 });
      assertTrue(!result.ok, 'bedrock must not be removable');
      if (!result.ok) assertEqual(result.reason, 'protected');
      assertEqual(chunk.getVoxelAtWorld(0, 3, 0), BLOCK_BEDROCK);
    } finally {
      handle.dispose();
    }
  });

  it('refuses to overwrite bedrock, even in replace mode', async () => {
    const { handle, chunk, controller } = await makeController();
    try {
      chunk.setVoxelRaw(0, 3, 0, BLOCK_BEDROCK);
      controller.setPlaceMode('replace');
      const result = controller.place({ x: 0, y: 3, z: 0 }, BLOCK_STONE);
      assertTrue(!result.ok, 'bedrock must not be buried');
      if (!result.ok) assertEqual(result.reason, 'protected');
      assertEqual(chunk.getVoxelAtWorld(0, 3, 0), BLOCK_BEDROCK);
    } finally {
      handle.dispose();
    }
  });

  it('still places normally inside the pit', async () => {
    const { handle, chunk, controller } = await makeController();
    try {
      chunk.setVoxelRaw(0, 3, 0, BLOCK_BEDROCK);
      // One layer above the bedrock floor is the open pit.
      const result = controller.place({ x: 0, y: 4, z: 0 }, BLOCK_DIRT);
      assertTrue(result.ok, 'the pit must stay buildable');
      assertEqual(chunk.getVoxelAtWorld(0, 4, 0), BLOCK_DIRT);
    } finally {
      handle.dispose();
    }
  });
});

describe('BuildController: batching', () => {
  it('defers the rebuild until the batch closes', async () => {
    const { handle, chunk, controller } = await makeController();
    try {
      controller.beginBatch();
      controller.place({ x: 0, y: 5, z: 0 }, BLOCK_STONE);
      controller.place({ x: 1, y: 5, z: 0 }, BLOCK_STONE);
      assertTrue(!chunk.isDirty, 'no rebuild should happen mid-batch');

      controller.endBatch();
      assertTrue(chunk.isDirty, 'the batch should flag one rebuild');
    } finally {
      handle.dispose();
    }
  });

  it('reports batching state', async () => {
    const { handle, controller } = await makeController();
    try {
      assertTrue(!controller.isBatching);
      controller.beginBatch();
      assertTrue(controller.isBatching);
      controller.endBatch();
      assertTrue(!controller.isBatching);
    } finally {
      handle.dispose();
    }
  });

  it('ignores an unbalanced endBatch', async () => {
    const { handle, controller } = await makeController();
    try {
      controller.endBatch();
      assertTrue(!controller.isBatching);
    } finally {
      handle.dispose();
    }
  });

  it('supports nested batches', async () => {
    const { handle, chunk, controller } = await makeController();
    try {
      controller.beginBatch();
      controller.beginBatch();
      controller.place({ x: 0, y: 5, z: 0 }, BLOCK_STONE);
      controller.endBatch();
      assertTrue(!chunk.isDirty, 'still inside the outer batch');
      controller.endBatch();
      assertTrue(chunk.isDirty);
    } finally {
      handle.dispose();
    }
  });
});

describe('BuildController: raycast', () => {
  it('hits a block from a camera', async () => {
    const { handle, controller } = await makeController();
    try {
      const block = ENGINE.MeshNode.create({
        name: 'Target',
        geometry: new THREE.BoxGeometry(1, 1, 1),
        physicsOptions: {
          enabled: true,
          motionType: ENGINE.PhysicsMotionType.Static,
          collisionProfile: ENGINE.DefaultCollisionProfile.BlockAll,
          collisionMeshType: ENGINE.CollisionMeshType.BoundingBox,
        },
      });
      block.position.set(0, 0, 0);
      addAndBeginPlay(handle.world, block);
      stepPhysics(handle.physics);

      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      camera.position.set(0, 5, 0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);

      const hit = controller.raycastFromCamera(camera);
      assertTrue(hit != null, 'the ray should hit the block');
    } finally {
      handle.dispose();
    }
  });

  it('returns null when nothing is in reach', async () => {
    const { handle, controller } = await makeController();
    try {
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      camera.position.set(0, 5, 0);
      camera.lookAt(0, 100, 0);
      camera.updateMatrixWorld(true);

      assertEqual(controller.raycastFromCamera(camera), null);
    } finally {
      handle.dispose();
    }
  });

  it('derives the placement cell from a hit', async () => {
    const { handle, controller } = await makeController();
    try {
      const cell = controller.placementCell({
        hitLocation: { x: 0.5, y: 1, z: 0.5 },
        hitNormal: { x: 0, y: 1, z: 0 },
      });
      assertEqual(cell.y, 1);
    } finally {
      handle.dispose();
    }
  });

  it('derives the break cell from a hit', async () => {
    const { handle, controller } = await makeController();
    try {
      const cell = controller.breakCell({
        hitLocation: { x: 0.5, y: 1, z: 0.5 },
        hitNormal: { x: 0, y: 1, z: 0 },
      });
      assertEqual(cell.y, 0);
    } finally {
      handle.dispose();
    }
  });
});

describe('BuildController: placed count', () => {
  it('counts placed blocks across chunks', async () => {
    const { handle, controller } = await makeController();
    try {
      controller.place({ x: 0, y: 5, z: 0 }, BLOCK_STONE);
      controller.place({ x: 1, y: 5, z: 0 }, BLOCK_STONE);
      assertEqual(controller.getPlacedBlockCount(), 2);
    } finally {
      handle.dispose();
    }
  });

  it('decreases after a break', async () => {
    const { handle, controller } = await makeController();
    try {
      controller.place({ x: 0, y: 5, z: 0 }, BLOCK_STONE);
      controller.break({ x: 0, y: 5, z: 0 });
      assertEqual(controller.getPlacedBlockCount(), 0);
    } finally {
      handle.dispose();
    }
  });
});