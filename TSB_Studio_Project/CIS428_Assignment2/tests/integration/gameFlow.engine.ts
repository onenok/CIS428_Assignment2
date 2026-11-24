import * as THREE from 'three';
import { describe, it } from '../../scripts/verify/harness.js';
import { assertClose, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { addAndBeginPlay, advanceTicks, createHeadlessWorld } from '../world/headlessWorld.js';
import { GameFlow, canTransition, legalEvents, nextPhase } from '../../src/integration/GameFlow.js';
import { inputLock } from '../../src/cinematic/InputLock.js';
import { chunkNodeKey, generateWorld } from '../../src/world/WorldGenerator.js';
import { DEFAULT_WORLD_GEN_CONFIG } from '../../src/world/WorldGenConfig.js';
import { BuildController } from '../../src/build/BuildController.js';
import { buildBoundsForRadius } from '../../src/build/placement.js';
import { MyCharacterPawn } from '../../src/character/MyCharacterPawn.js';
import { BLOCK_STONE } from '../../src/voxel/blockIds.js';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../src/voxel/chunkMath.js';
import { MATERIAL_SLOT_COUNT } from '../../src/voxel/materialMap.js';
import { buildChunkMaterials } from '../../src/voxel/chunkGeometry.js';

/** Materials stand-in: the mesher only needs one material per slot. */
function testMaterials(): THREE.Material[] {
  return buildChunkMaterials(MATERIAL_SLOT_COUNT, () => null);
}

describe('U-X-01 world generation then spawn', () => {
  it('generates every configured chunk', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, DEFAULT_WORLD_GEN_CONFIG, testMaterials());

      assertTrue(result.chunks.size > 0, 'world should contain chunks');
      assertTrue(result.voxelCount > 0, 'world should contain voxels');
    } finally {
      handle.dispose();
    }
  });

  it('exposes exactly one editable chunk for the default config', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, DEFAULT_WORLD_GEN_CONFIG, testMaterials());

      assertEqual(result.editableChunks.length, 1);
      assertEqual(result.editableChunks[0].chunkX, 0);
      assertEqual(result.editableChunks[0].chunkZ, 0);
    } finally {
      handle.dispose();
    }
  });

  it('spawns the pawn at the requested start position', async () => {
    const handle = await createHeadlessWorld();
    try {
      const start = new THREE.Vector3(4, 1, -6);
      const pawn = MyCharacterPawn.create({ name: 'Pawn' });
      pawn.position.copy(start);
      addAndBeginPlay(handle.world, pawn);

      const worldPosition = new THREE.Vector3();
      pawn.getWorldPosition(worldPosition);

      assertClose(worldPosition.x, start.x, 1e-3);
      assertClose(worldPosition.y, start.y, 1e-3);
      assertClose(worldPosition.z, start.z, 1e-3);
    } finally {
      handle.dispose();
    }
  });
}, 'engine');

describe('U-X-02 build mode toggling', () => {
  it('moves between explore and building', () => {
    const flow = new GameFlow();
    flow.dispatch('worldReady');
    flow.dispatch('introFinished');

    assertEqual(flow.currentPhase, 'explore');
    assertEqual(flow.dispatch('enterBuild').to, 'building');
    assertEqual(flow.dispatch('exitBuild').to, 'explore');
  });

  it('only allows acting in explore and building', () => {
    const flow = new GameFlow();
    assertEqual(flow.canAct, false);

    flow.dispatch('worldReady');
    flow.dispatch('introFinished');
    assertEqual(flow.canAct, true);

    flow.dispatch('enterBuild');
    assertEqual(flow.canAct, true);
  });
}, 'unit');

describe('U-X-03 place a block then rebuild the mesh', () => {
  it('records the placement in the centre chunk', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, DEFAULT_WORLD_GEN_CONFIG, testMaterials());
      const centre = result.chunks.get(chunkNodeKey(0, 0));
      assertTrue(centre !== undefined, 'centre chunk should exist');

      const before = centre!.getPlacedBlockCount();

      const controller = new BuildController({
        chunks: result.chunks,
              bounds: buildBoundsForRadius(DEFAULT_WORLD_GEN_CONFIG.editableRadius, CHUNK_SIZE_X),
        physics: handle.physics,
      });
            const placed = controller.place({ x: 1, y: 20, z: 1 }, BLOCK_STONE);

      assertEqual(placed.ok, true);
      assertEqual(centre!.getPlacedBlockCount(), before + 1);
    } finally {
      handle.dispose();
    }
  });

  it('rebuilds the mesh on the next tick', async () => {
    const handle = await createHeadlessWorld();
    try {
      const result = generateWorld(handle.world, DEFAULT_WORLD_GEN_CONFIG, testMaterials());
      const centre = result.chunks.get(chunkNodeKey(0, 0))!;

      const controller = new BuildController({
        chunks: result.chunks,
              bounds: buildBoundsForRadius(DEFAULT_WORLD_GEN_CONFIG.editableRadius, CHUNK_SIZE_X),
        physics: handle.physics,
      });
            controller.place({ x: 2, y: 20, z: 2 }, BLOCK_STONE);

      advanceTicks(handle.world, 0.2);

      assertTrue(centre.getPlacedBlockCount() > 0, 'block should be recorded');
    } finally {
      handle.dispose();
    }
  });
}, 'engine');

describe('U-X-04 intro sequence runs to completion', () => {
  it('reaches explore after the intro timeline finishes', () => {
    const flow = new GameFlow();
    flow.dispatch('worldReady');

    assertEqual(flow.currentPhase, 'intro');
    assertTrue(flow.isCinematic, 'intro should be playing');

    flow.update(100);

    assertEqual(flow.currentPhase, 'explore');
    assertEqual(flow.isCinematic, false);
  });

  it('locks input during the intro and unlocks afterwards', () => {
    inputLock.clear();
    const flow = new GameFlow();
    flow.dispatch('worldReady');

    assertEqual(inputLock.isLocked, true);

    flow.update(100);
    assertEqual(inputLock.isUnlocked, true);
  });
}, 'unit');

describe('U-X-05 submit leads to the ending', () => {
  it('rejects an empty submission and stays in build mode', () => {
    const flow = new GameFlow();
    flow.dispatch('worldReady');
    flow.dispatch('introFinished');
    flow.dispatch('enterBuild');

    const result = flow.dispatch('submit');

    assertEqual(result.accepted, false);
    assertEqual(flow.currentPhase, 'building');
  });

  it('accepts a non-empty submission and starts the ending', () => {
    const flow = new GameFlow();
    flow.dispatch('worldReady');
    flow.dispatch('introFinished');
    flow.dispatch('enterBuild');
    flow.setPlacedBlockCount(3);

    const result = flow.dispatch('submit');

    assertEqual(result.accepted, true);
    assertEqual(flow.currentPhase, 'ending');
    assertTrue(flow.isCinematic, 'ending should be playing');
  });

  it('reaches ended after the ending timeline finishes', () => {
    const flow = new GameFlow();
    flow.dispatch('worldReady');
    flow.dispatch('introFinished');
    flow.dispatch('enterBuild');
    flow.setPlacedBlockCount(1);
    flow.dispatch('submit');

    flow.update(100);

    assertEqual(flow.currentPhase, 'ended');
  });

    it('accepts a submit after build mode was left for the closing dialogue', () => {
      // The confirm path exits build mode *before* playing the submit lines, so the
      // conversation happens over the world instead of over the hotbar. The submit
      // itself is dispatched from `explore` — that is the ordering this pins.
      const flow = new GameFlow();
      flow.dispatch('worldReady');
      flow.dispatch('introFinished');
      flow.dispatch('enterBuild');
      flow.setPlacedBlockCount(2);
      flow.dispatch('exitBuild');
      assertEqual(flow.currentPhase, 'explore');

      const result = flow.dispatch('submit');

      assertEqual(result.accepted, true, 'submit must not require build mode');
      assertEqual(flow.currentPhase, 'ending');
    });
}, 'unit');

describe('U-X-06 blank scroll easter egg', () => {
  it('treats zero placed blocks as a blank submission', () => {
    const flow = new GameFlow();
    flow.dispatch('worldReady');
    flow.dispatch('introFinished');
    flow.dispatch('enterBuild');
    flow.setPlacedBlockCount(0);

    const result = flow.dispatch('submit');

    assertEqual(result.accepted, false);
    assertEqual(flow.currentPhase, 'building');
  });

  it('does not start the ending for a blank submission', () => {
      const flow = new GameFlow();
      flow.dispatch('worldReady');
      flow.update(100);
      flow.dispatch('enterBuild');
      flow.setPlacedBlockCount(0);
      flow.dispatch('submit');

      assertEqual(flow.currentPhase, 'building');
      assertEqual(flow.activeRunner, null);
    });
}, 'unit');

describe('GameFlow / transition table', () => {
  it('rejects an illegal event', () => {
    const flow = new GameFlow();
    const result = flow.dispatch('enterBuild');

    assertEqual(result.accepted, false);
    assertEqual(flow.currentPhase, 'boot');
  });

  it('reports legal events per phase', () => {
    assertTrue(legalEvents('boot').includes('worldReady'));
    assertTrue(legalEvents('explore').includes('enterBuild'));
    assertEqual(legalEvents('ended').length, 0);
  });

  it('canTransition agrees with nextPhase', () => {
    assertEqual(canTransition('boot', 'worldReady'), true);
    assertEqual(nextPhase('boot', 'worldReady'), 'intro');
    assertEqual(canTransition('ended', 'worldReady'), false);
    assertEqual(nextPhase('ended', 'worldReady'), null);
  });
}, 'unit');

describe('U-X-03 chunk bounds sanity', () => {
  it('keeps the editable chunk at the origin', () => {
    assertEqual(DEFAULT_WORLD_GEN_CONFIG.editableRadius, 0);
  });

  it('uses a 16-voxel chunk footprint', () => {
    assertEqual(CHUNK_SIZE_X, 16);
    assertEqual(CHUNK_SIZE_Z, 16);
  });
}, 'unit');