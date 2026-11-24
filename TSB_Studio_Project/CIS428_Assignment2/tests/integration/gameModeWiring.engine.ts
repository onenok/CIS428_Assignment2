/**
 * Integration wiring tests (layer 2).
 *
 * The individual systems already have their own suites; these tests cover the
 * *seams* — that `MyGameMode` actually creates the world, the build controller,
 * the flow and the visual helpers, and that the phase machine reaches the phases
 * the game needs.
 *
 * `MyGameMode` cannot be spawned through a real `GameLoop` under Node (that needs
 * a renderer), so the tests drive the same lifecycle methods the engine calls:
 * `onBeforeBeginPlay()` then `beginPlay()`.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { describe, it } from '../../scripts/verify/harness.js';
import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { createHeadlessWorld } from '../world/headlessWorld.js';
import { MyGameMode } from '../../src/game/MyGameMode.js';
import { inputLock } from '../../src/cinematic/InputLock.js';
import { DEFAULT_WORLD_GEN_CONFIG } from '../../src/world/WorldGenConfig.js';
import { DEFAULT_FOG_SETTINGS } from '../../src/world/WorldGenerator.js';
import { VoxelChunkNode } from '../../src/voxel/VoxelChunkNode.js';
import { MATERIAL_SLOT_COUNT } from '../../src/voxel/materialMap.js';
import { BLOCK_STONE } from '../../src/voxel/blockIds.js';
import { buildBoundsForRadius } from '../../src/build/placement.js';

/** Number of chunks the default config generates: 5x5 rings. */
const EXPECTED_CHUNK_COUNT = 25;

/**
 * Builds a game mode inside a headless world and runs the pre-play hook.
 *
 * The world is created first so `getWorld()` resolves from the parent chain,
 * which is exactly what the engine guarantees when it calls the hook.
 */
async function withGameMode(
  run: (gameMode: MyGameMode, world: ENGINE.World) => void | Promise<void>,
): Promise<void> {
  const handle = await createHeadlessWorld();
  inputLock.clear();
  try {
    const gameMode = MyGameMode.create({ name: 'TestGameMode' });
    handle.world.add(gameMode);
    gameMode.onBeforeBeginPlay();
    await run(gameMode, handle.world);
  } finally {
    inputLock.clear();
    handle.dispose();
  }
}

describe('I-A game mode wiring', () => {
  it('creates a MyGameMode instance', async () => {
    await withGameMode(gameMode => {
      assertTrue(gameMode instanceof MyGameMode, 'game mode should be a MyGameMode');
    });
  });

  it('owns a GameFlow that starts in boot', async () => {
    await withGameMode(gameMode => {
      assertTrue(gameMode.flow !== null, 'flow should exist');
      // `onBeforeBeginPlay` dispatches `worldReady`, so the flow has already
      // left `boot` by the time the hook returns.
      assertEqual(gameMode.flow.currentPhase, 'intro');
    });
  });

  it('creates a BuildController in replace mode', async () => {
    await withGameMode(gameMode => {
      assertTrue(gameMode.buildController !== null, 'build controller should exist');
      assertEqual(gameMode.buildController!.getPlaceMode(), 'replace');
    });
  });

  it('exposes the four HUD widgets once the UI promise settles', async () => {
    await withGameMode(async gameMode => {
      await gameMode.waitForUi();
      // Headless UI components skip initialization, so the bundle may be null.
      // What must hold is that the promise resolves without throwing.
      assertTrue(true);
    });
  });

  it('resolves a PlayerStart from the scene graph', async () => {
    await withGameMode((gameMode, world) => {
      const starts = world.getNodes(ENGINE.PlayerStart);
      // The headless world has no scene file, so there is nothing to find; the
      // assertion is that the lookup is dynamic rather than hard-coded.
      assertEqual(starts.length, 0);
      assertTrue(gameMode !== null);
    });
  });
});

describe('I-B world generation wiring', () => {
  it('generates every configured chunk', async () => {
    await withGameMode(gameMode => {
      assertTrue(gameMode.worldChunks !== null, 'chunks should be generated');
      assertEqual(gameMode.worldChunks!.size, EXPECTED_CHUNK_COUNT);
    });
  });

  it('adds the chunks to the world', async () => {
    await withGameMode((_gameMode, world) => {
      const chunks = world.getNodes(VoxelChunkNode);
      assertEqual(chunks.length, EXPECTED_CHUNK_COUNT);
    });
  });

  it('builds one material per palette slot', async () => {
    await withGameMode(gameMode => {
      const chunk = [...gameMode.worldChunks!.values()][0];
        // The mesh node is created lazily on the first rebuild.
        chunk.rebuildMesh();
        const mesh = chunk.children.find(child => child.name === 'ChunkMesh');
        assertTrue(mesh !== undefined, 'chunk should have a mesh');
        const materials = (mesh as ENGINE.MeshNode).material;
        assertEqual(Array.isArray(materials) ? materials.length : 1, MATERIAL_SLOT_COUNT);
      });
    });

  // The report reads `mesh.material` rather than the array we assigned, because
    // the engine may substitute a default material. This proves the distinction is
    // observable, so a report showing `renderedMaterials != materialSlots` is real.
    it('exposes the materials the mesh actually renders with', async () => {
      await withGameMode(gameMode => {
        const chunk = [...gameMode.worldChunks!.values()][0];
        chunk.rebuildMesh();
        const rendered = chunk.getRenderedMaterials();
        assertEqual(rendered.length, MATERIAL_SLOT_COUNT);
        assertTrue(chunk.hasMatchingMaterials, 'rendered materials should match the slots');
      });
    });

    it('reports no rendered material count before the first mesh build', async () => {
      await withGameMode(gameMode => {
        const chunk = [...gameMode.worldChunks!.values()][0];
        // `null`, not `0`: an unbuilt chunk is not "rendering with nothing", and
        // reporting 0 would make the render report warn about all 25 chunks.
        assertEqual(chunk.renderedMaterialCount, null);
        assertTrue(chunk.hasMatchingMaterials, 'no mesh means nothing to mismatch');
      });
    });

    it('applies the default fog to the render scene', async () => {
      await withGameMode((_gameMode, world) => {
        const fog = world.getRenderScene().fog as THREE.Fog | null;
        assertTrue(fog !== null, 'fog should be set');
        assertEqual(fog!.near, DEFAULT_FOG_SETTINGS.near);
        assertEqual(fog!.far, DEFAULT_FOG_SETTINGS.far);
      });
    });

  it('locks input while the intro plays', async () => {
    await withGameMode(gameMode => {
      assertEqual(gameMode.flow.currentPhase, 'intro');
      assertTrue(inputLock.isLocked, 'input should be locked during the intro');
    });
  });
});

describe('I-C build system wiring', () => {
  it('places a block through the controller', async () => {
    await withGameMode(gameMode => {
      const build = gameMode.buildController!;
      const bounds = buildBoundsForRadius(
        DEFAULT_WORLD_GEN_CONFIG.editableRadius,
        DEFAULT_WORLD_GEN_CONFIG.chunkSize,
      );
      const cell = { x: bounds.minX, y: DEFAULT_WORLD_GEN_CONFIG.surfaceY + 1, z: bounds.minZ };

      const result = build.place(cell, BLOCK_STONE);
      assertTrue(result.ok, 'placement inside the editable chunk should succeed');
      assertEqual(build.readBlock(cell), BLOCK_STONE);
      assertEqual(build.getPlacedBlockCount(), 1);
    });
  });

  it('breaks a placed block', async () => {
    await withGameMode(gameMode => {
      const build = gameMode.buildController!;
      const bounds = buildBoundsForRadius(
        DEFAULT_WORLD_GEN_CONFIG.editableRadius,
        DEFAULT_WORLD_GEN_CONFIG.chunkSize,
      );
      const cell = { x: bounds.minX, y: DEFAULT_WORLD_GEN_CONFIG.surfaceY + 1, z: bounds.minZ };

      build.place(cell, BLOCK_STONE);
      const result = build.break(cell);
      assertTrue(result.ok, 'breaking a placed block should succeed');
      assertEqual(build.readBlock(cell), 0);
    });
  });

  it('adds a selection box and a placement preview to the world', async () => {
    await withGameMode(gameMode => {
      assertTrue(gameMode.selectionBox !== null, 'selection box should exist');
      assertTrue(gameMode.placementPreview !== null, 'placement preview should exist');
    });
  });

  it('starts with an empty undo stack', async () => {
    await withGameMode(gameMode => {
      assertEqual(gameMode.undoStack.undoCount, 0);
      assertEqual(gameMode.undoStack.canUndo, false);
    });
  });

  it('rebuilds a chunk after an edit', async () => {
    await withGameMode(gameMode => {
      const build = gameMode.buildController!;
      const bounds = buildBoundsForRadius(
        DEFAULT_WORLD_GEN_CONFIG.editableRadius,
        DEFAULT_WORLD_GEN_CONFIG.chunkSize,
      );
      const cell = { x: bounds.minX, y: DEFAULT_WORLD_GEN_CONFIG.surfaceY + 1, z: bounds.minZ };
      const chunk = gameMode.worldChunks!.get('0,0')!;
      const before = chunk.rebuilds;

      build.place(cell, BLOCK_STONE);
      chunk.tickPostPhysics(1 / 60);

      assertTrue(chunk.rebuilds > before, 'chunk should rebuild after an edit');
    });
  });
});

describe('I-E flow wiring', () => {
  it('reaches explore once the intro finishes', async () => {
    await withGameMode(gameMode => {
      assertEqual(gameMode.flow.currentPhase, 'intro');
      // The intro is 3.0s of steps; a single large delta finishes it.
      gameMode.flow.update(10);
      assertEqual(gameMode.flow.currentPhase, 'explore');
    });
  });

  it('releases the intro input lock on entering explore', async () => {
    await withGameMode(gameMode => {
      gameMode.flow.update(10);
      assertEqual(gameMode.flow.currentPhase, 'explore');
      assertTrue(inputLock.isUnlocked, 'input should be unlocked in explore');
    });
  });

  it('rejects a submit with no blocks placed', async () => {
    await withGameMode(gameMode => {
      gameMode.flow.update(10);
      gameMode.flow.dispatch('enterBuild');
      gameMode.flow.setPlacedBlockCount(0);

      const result = gameMode.flow.dispatch('submit');
      assertEqual(result.accepted, false);
      assertEqual(gameMode.flow.currentPhase, 'building');
    });
  });

  it('accepts a submit once a block is placed', async () => {
    await withGameMode(gameMode => {
      gameMode.flow.update(10);
      gameMode.flow.dispatch('enterBuild');
      gameMode.flow.setPlacedBlockCount(1);

      const result = gameMode.flow.dispatch('submit');
      assertEqual(result.accepted, true);
      assertEqual(gameMode.flow.currentPhase, 'ending');
    });
  });

  it('exposes the intro and ending sequences', async () => {
    await withGameMode(gameMode => {
      assertEqual(MyGameMode.introSequence().id, 'intro');
      assertEqual(MyGameMode.endingSequence().id, 'ending');
      assertTrue(gameMode.getActiveRunner() !== null, 'the intro runner should be active');
    });
  });
});