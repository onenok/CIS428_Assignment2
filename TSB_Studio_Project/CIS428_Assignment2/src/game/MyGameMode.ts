/**
 * The game mode: the single place where the independently-tested systems are
 * wired into a running game.
 *
 * Responsibilities:
 *  - Spawn `MyCharacterPawn` + `MyPlayerController` instead of the engine defaults.
 *  - Generate the voxel world and build the chunk material set.
 *  - Own the build system (`BuildController`, selection box, placement preview).
 *  - Own the HUD (`GameUiBundle`).
 *  - Drive the phase machine (`GameFlow`) and the cinematics it starts.
 *
 * Timing matters here, so the wiring is split across the lifecycle hooks the
 * engine provides:
 *
 *   onBeforeBeginPlay()  world exists, pawn does not  -> world, build, UI, flow
 *   spawnPlayerControllerForClient()                  -> input handlers
 *   tickPrePhysics()     before physics               -> raycast, flow, cinematics
 *   tickPostPhysics()    after physics                -> HUD state, chunk rebuilds
 *
 * `onBeforeBeginPlay()` runs before `beginPlaySubtree()`, so chunks added there
 * still get their `beginPlay()` (and therefore their physics bodies) from the
 * normal subtree walk.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { BuildController } from '../build/BuildController.js';
import { PlacementPreview } from '../build/PlacementPreview.js';
import { SelectionBox } from '../build/SelectionBox.js';
import { UndoRedoStack, type EditBatch, type VoxelEdit } from '../build/UndoRedoStack.js';
import { buildBoundsForRadius, type VoxelCell } from '../build/placement.js';
import { isBlankSubmission } from '../build/submitCheck.js';
import { MyCharacterPawn } from '../character/MyCharacterPawn.js';
import { Loomkeeper } from '../character/Loomkeeper.js';
import {
  LOOMKEEPER_SPAWN_MARKER,
  resolveNpcSpawn,
  type WorldPoint,
} from '../character/npcSpawn.js';
import { MyPlayerController, type GameplayAction, type MouseAction } from '../character/MyPlayerController.js';
import { resolveVerticalIntent } from '../character/verticalIntent.js';
import { inputLock } from '../cinematic/InputLock.js';
import {
  endingSequence,
  fadeOpacity,
  eyelidCoverage,
  introSequence,
  TransitionRunner,
} from '../cinematic/TransitionSequence.js';
import { createEndCard, hideEndCard, showEndCard } from '../cinematic/EndCard.js';
import {
  DebugOverlay,
  shouldCreateDebugOverlay,
} from '../debug/DebugOverlay.js';
import {
  FrameTimer,
  compassDirection,
  localVelocitiesToWorld,
  mouseButtonName,
  radiansToDegrees,
  readRenderStats,
  worldToBlock,
  worldToChunk,
  type DebugSnapshot,
} from '../debug/DebugSnapshot.js';
import { FreeCamera, IDLE_FREE_CAMERA_INPUT, type FreeCameraInput } from '../debug/FreeCamera.js';
import { runtimeInputLog } from '../debug/InputLog.js';
import { describeEdit } from '../debug/editLog.js';
import { buildRenderReport, describeMaterial, type ChunkRenderReport, type DrawableReport, type MaterialReport, type RenderReportInput } from '../debug/renderReport.js';
import { collectDrawableReports } from '../debug/drawables.js';
import { collectSceneReport } from '../debug/sceneReport.js';
import { collectPostReport } from '../debug/postReport.js';
import { collectGpuReport, readDrawablePath, readDrawingPipeline } from '../debug/gpuReport.js';
import { emitRuntimeDump, stampDumpFiles, type RuntimeDumpFile } from '../debug/runtimeDump.js';
import { dumpWorldJson, dumpWorldText, type ChunkDumpSource } from '../debug/worldDump.js';
import { DialogueRunner } from '../dialogue/DialogueRunner.js';
import { SPEAKER_NAMES } from '../dialogue/types.js';
import type { DialogueScriptId } from '../dialogue/types.js';
import { findCueIndex, getDialogueScript } from '../dialogue/scripts/index.js';
import { turnTowards, yawTowards } from '../cinematic/ScrollSpawn.js';
import { GameFlow, type GamePhase } from '../integration/GameFlow.js';
import { KeyBindings, type KeyBindingTable } from '../input/keyBindings.js';
import { BlackOverlay } from '../ui/BlackOverlay.js';
import {
  createGameUi,
  destroyGameUi,
  setBuildUiVisible,
  setCrosshairVisible,
  type GameUiBundle,
} from '../ui/GameUiBundle.js';
import { PROTECTED_BLOCK_HINT } from '../ui/ToastHint.js';
import { BLOCK_AIR } from '../voxel/blockIds.js';
import { VoxelChunkNode } from '../voxel/VoxelChunkNode.js';
import { borderExtentForRadius } from '../world/borderSpec.js';
import { WorldBorder } from '../world/WorldBorder.js';
import { applyFog, generateWorld } from '../world/WorldGenerator.js';
import { makeChunkMaterials, makeChunkTextures, textureForBlock } from '../world/chunkMaterials.js';
import {
  FALLBACK_ANISOTROPY,
  applyAnisotropy,
  clampAnisotropy,
  maxAnisotropyOf,
} from '../voxel/placeholderTexture.js';

/**
 * World generation for the actual game.
 *
 * Identical to {@link DEFAULT_WORLD_GEN_CONFIG} except for the central pit: the
 * editable chunk is dug out ten layers deep and floored with bedrock at `y = 0`
 * (the bottom of the world). The pit is what the assignment asks the player to
 * build inside, so it belongs to the game and not to the world-generation
 * baseline (whose tests assume flat ground).
 *
 * Defined in `world/gameplayWorld.ts` so unit tests can read it without importing
 * this file's engine dependency; re-exported here because that is where the rest
 * of the game mode looks for it.
 */
export { GAMEPLAY_WORLD_GEN_CONFIG, PIT_FLOOR_Y } from '../world/gameplayWorld.js';
import { GAMEPLAY_WORLD_GEN_CONFIG } from '../world/gameplayWorld.js';

/** Which camera the player is currently looking through. */
export enum CameraMode {
  FirstPerson = 'firstPerson',
  GodView = 'godView',
}

/** Screen-space centre, which is where the reticle sits. */
const SCREEN_CENTRE = { x: 0, y: 0 } as const;

/**
 * Gap left between the player's feet and the floor when it is spawned, in metres.
 *
 * The character controller only resolves an overlap by sweeping, so a pawn that
 * starts flush with (or inside) the ground stays stuck there until it jumps.
 * Spawning a body-height above the floor lets gravity land it instead, which is
 * the one path that reliably ends with the feet exactly on the block top.
 */
const SPAWN_DROP_HEIGHT = 1;

/** Top face of the world's ground layer, in metres. */
const GROUND_TOP_Y = GAMEPLAY_WORLD_GEN_CONFIG.surfaceY + 1;

/**
 * How far below the floor a pawn may sit before it counts as "spawned inside the
 * ground" rather than "standing on it". A hundredth of a metre is far tighter than
 * the 1 m error the guard exists to catch.
 */
const SPAWN_FLOOR_EPSILON = 0.05;

/**
 * How long the spawn guard keeps trying, in seconds.
 *
 * It has to give up eventually: the centre of the map is a carved pit, so a player
 * who walks down into it is legitimately far below the floor and must not be
 * teleported back out. A few seconds is enough for the colliders to register on any
 * machine we have seen, and the guard disarms itself as soon as the pawn is grounded
 * above the floor, which normally happens within the first second.
 */
const SPAWN_FLOOR_GUARD_SECONDS = 6;

/** Seconds the player takes to turn towards the Loomkeeper during the intro. */
const DIALOGUE_TURN_SECONDS = 0.8;

/**
 * -1 / 0 / +1 from two bound actions, read through the engine's input manager.
 *
 * Reads `KeyBindings` rather than literal key codes so rebinding the free-camera
 * axes actually takes effect. An action may list several codes (both Ctrl keys
 * for descend), so any one of them counts as held.
 */
function readAxis(
  input: ENGINE.InputManager | null | undefined,
  positive: keyof KeyBindingTable,
  negative: keyof KeyBindingTable,
): number {
  if (!input) {
    return 0;
  }
  const isHeld = (action: keyof KeyBindingTable): boolean =>
    KeyBindings[action].some(code => input.isKeyDown(code));
  return (isHeld(positive) ? 1 : 0) - (isHeld(negative) ? 1 : 0);
}

@ENGINE.GameClass()
export class MyGameMode extends ENGINE.GameMode {
  /** Current camera mode. */
  public cameraMode: CameraMode = CameraMode.FirstPerson;

  /** True while the player is placing/breaking blocks. */
  public isBuildMode: boolean = false;

  /** True while the player is flying. */
  public isFlying: boolean = false;

    /**
     * True while world time is frozen (F5).
     *
     * Mirrors `world.timeControl` rather than being the source of truth: the engine owns
     * the freeze, this flag only records what we asked for so the dump can print it.
     */
    private frozen: boolean = false;

    /** Last vertical input pushed to the pawn, so only changes are logged. */
        private lastVerticalInput: number = 0;

  /** The controller spawned for the local player, if any. */
  public localController: MyPlayerController | null = null;

  /** Phase machine for intro / explore / build / submit / ending. */
  public readonly flow: GameFlow = new GameFlow();

  /** Build system, created once the world exists. */
  public buildController: BuildController | null = null;

  /** Every generated chunk, keyed by `chunkX,chunkZ`. */
  public worldChunks: Map<string, VoxelChunkNode> | null = null;

  /** The HUD, created once the world exists. */
  public ui: GameUiBundle | null = null;

  /** Wireframe box around the cell under the reticle. */
  public selectionBox: SelectionBox | null = null;

  /** Translucent block preview, god view only. */
  public placementPreview: PlacementPreview | null = null;

  /** Undo / redo history for block edits. */
  public readonly undoStack: UndoRedoStack = new UndoRedoStack();

  /** Full-screen black overlay driven by the cinematics. */
  public readonly overlay: BlackOverlay = new BlackOverlay();

  /** Active dialogue, or `null` when nobody is talking. */
  public dialogue: DialogueRunner | null = null;

    /** Which script the active dialogue is running, so cues can be looked up. */
    private activeDialogueId: DialogueScriptId = 'intro';

    /** Runs once the active dialogue ends; used to chain the submit branches. */
    private dialogueOnFinished: (() => void) | null = null;

  /** The end card, created lazily when the ending starts. */
  public endCard: ENGINE.CenterMessage | null = null;

    /** The Loomkeeper, spawned with the world. */
    public loomkeeper: Loomkeeper | null = null;

      /** Translucent walls that keep the player inside the generated terrain. */
      public worldBorder: WorldBorder | null = null;

  /** Chunk textures, kept so the placement preview can reuse them. */
  private chunkTextures: Map<string, THREE.Texture> | null = null;

  /**
   * Anisotropic filtering level applied to the ground textures.
   *
   * Kept because the render report prints it: a texture reporting `anisotropy: 1`
   * explains "the ground collapses into one flat chunk" without any other evidence.
   */
  private groundAnisotropy: number = 1;

  /** True once the anisotropy came from the renderer rather than the fallback. */
  private groundAnisotropyFromRenderer: boolean = false;

  /** Resolves once the async HUD creation has finished. */
  private uiReady: Promise<void> | null = null;

  /** Phase observed on the previous tick, for edge detection. */
  private lastPhase: GamePhase = 'boot';

  /** True while the spawn guard is still trying to get the pawn out of the ground. */
  private spawnFloorGuard = true;

  /** Seconds the current spawn guard has been running. */
  private spawnFloorGuardElapsed = 0;

  /** Cell under the reticle this frame, or `null` when nothing is targeted. */
  private hoveredCell: VoxelCell | null = null;

  /** Cell a placement would occupy this frame, or `null`. */
  private previewCell: VoxelCell | null = null;

    /** F3 debug panel, or `null` when the build is published without debug opt-in. */
    public debugOverlay: DebugOverlay | null = null;

    /** Rolling frame-time average for the F3 readout. */
    private readonly frameTimer: FrameTimer = new FrameTimer();

        /** Detached spectator camera, created on first F3+C. */
        private freeCamera: FreeCamera | null = null;

        /** True while the free camera owns rendering. */
        private isFreeCameraActive = false;

        /** True while the physics collider wireframe is shown (F3+B). */
        private isCollisionDebugEnabled = false;

        /** Mouse delta accumulated since the last frame, for the free camera. */
        private pendingLookDeltaX = 0;
        private pendingLookDeltaY = 0;

  public override initialize(options?: ENGINE.GameModeOptions): void {
    super.initialize({
      ...options,
      pawnFactory: async () => MyCharacterPawn.create({ name: 'PlayerPawn' }),
      playerControllerFactory: async () => MyPlayerController.create({ name: 'PlayerController' }),
    });
  }

  //====================================================================================================
  // Lifecycle
  //====================================================================================================

  /**
   * Builds the world and every per-world system.
   *
   * Runs before `beginPlaySubtree()`, so the chunks added here are picked up by
   * the normal play walk and register their physics bodies.
   */
  public override onBeforeBeginPlay(): void {
    super.onBeforeBeginPlay();

    const world = this.getWorld();
    if (!world) {
      return;
    }

    this.buildWorld(world);
    this.buildVisualHelpers(world);
        this.spawnLoomkeeper(world);
    // Re-mounted every run: the guard has to survive the pawn arriving later than the
    // chunk colliders, and `onAfterEndPlay` does not reset it for a fresh play.
    this.spawnFloorGuard = true;
    this.spawnFloorGuardElapsed = 0;
    // `buildUi` creates the engine's UI layer synchronously before its first await, and
    // the overlay mounts *into* that layer so the end card can paint above it — so the
    // mount has to come after the call, not before it.
    this.uiReady = this.buildUi(world);
    this.overlay.mount();
    this.overlay.show();

    // The intro owns the screen from the first frame; `GameFlow` releases the
    // lock when it reaches `explore`.
    this.flow.dispatch('worldReady');
        this.lastPhase = this.flow.currentPhase;
      }

  /** Tears down everything created in {@link onBeforeBeginPlay}. */
  public override onAfterEndPlay(): void {
    super.onAfterEndPlay();

    if (this.ui) {
      destroyGameUi(this.ui);
      this.ui = null;
    }
    this.overlay.destroy();
    this.selectionBox?.destroy();
    this.selectionBox = null;
    this.placementPreview?.destroy();
    this.placementPreview = null;
        this.loomkeeper?.destroy();
        this.loomkeeper = null;
                this.worldBorder?.destroy();
                this.worldBorder = null;
        this.buildController = null;
    this.worldChunks = null;
    this.chunkTextures = null;
    this.dialogue = null;
        this.dialogueOnFinished = null;
    this.endCard = null;
    this.undoStack.clear();
    inputLock.clear();
  }

  public override async spawnPlayerControllerForClient(
    clientId: ENGINE.ClientId,
  ): Promise<ENGINE.PlayerController | null> {
    const controller = await super.spawnPlayerControllerForClient(clientId);
    if (controller instanceof MyPlayerController) {
      this.localController = controller;
      controller.onAction.add(action => this.handleAction(action));
      controller.onMouseAction.add(action => this.handleMouseAction(action));
      controller.onSlotSelected.add(index => this.ui?.hotbar.select(index));
      controller.onMouseLook.add((dx, dy) => this.addFreeCameraLook(dx, dy));
    }
    return controller;
  }

      /**
         * Drops the pawn onto the top of the ground layer.
         *
         * The engine answers this with a downward raycast, but on this world the top
         * face is known exactly, and the raycast runs before the chunk colliders are
         * registered — in some runs it reports a floor a full block too low, which
         * spawns the pawn 1 m inside the ground where the character controller cannot
         * climb out. Using the constant instead makes the spawn deterministic.
         *
         * The pawn is dropped from {@link SPAWN_DROP_HEIGHT} above the floor rather than
         * placed on it: a body that starts flush with the ground is already
         * overlapping, and the controller resolves overlap too slowly to be usable, so
         * landing by gravity is what makes "standing on a block" read as a whole
         * number.
         *
         * TODO: go back to the engine's floor query once it is understood why it
         * occasionally sees a lower floor. See `Obsidian/cis428 assignment2/issues/ISSUE-009`.
         */
        protected override resolveSpawnGround(position: THREE.Vector3): THREE.Vector3 {
          return new THREE.Vector3(position.x, GROUND_TOP_Y + SPAWN_DROP_HEIGHT, position.z);
        }

        //====================================================================================================
  // World
  //====================================================================================================

  /** Generates the voxel world and the build system that edits it. */
  private buildWorld(world: ENGINE.World): void {
    this.chunkTextures = makeChunkTextures();
      this.applyGroundAnisotropy(world);
    const materials = makeChunkMaterials(this.chunkTextures);

    const result = generateWorld(world, GAMEPLAY_WORLD_GEN_CONFIG, materials);
    this.worldChunks = result.chunks;

        this.worldBorder = WorldBorder.create({ name: 'WorldBorder' });
        this.worldBorder.build(
          borderExtentForRadius(GAMEPLAY_WORLD_GEN_CONFIG.playableRadius, GAMEPLAY_WORLD_GEN_CONFIG.chunkSize),
          GAMEPLAY_WORLD_GEN_CONFIG,
        );
        world.add(this.worldBorder);

    applyFog(world.getRenderScene());

    const physics = this.getPhysicsEngine();
    if (physics) {
      this.buildController = new BuildController({
        chunks: result.chunks,
        bounds: buildBoundsForRadius(
          GAMEPLAY_WORLD_GEN_CONFIG.editableRadius,
          GAMEPLAY_WORLD_GEN_CONFIG.chunkSize,
        ),
        physics,
      });
    }
  }

      /**
       * Enables anisotropic filtering on the ground textures.
       *
       * A first-person camera looks along the ground at a very shallow angle, which
       * gives the sampler huge UV derivatives and pushes it to the coarsest mip — for
       * a 16x16 tile that is roughly one average colour, so the ground reads as a
       * single flat chunk until an edit rebuilds the mesh and briefly samples level 0.
       * Anisotropic filtering is the setting that fixes that class of artefact.
       *
       * The limit comes from the renderer because drivers clamp it; when the renderer
       * cannot report one (headless tests, WebGPU) a conservative default is used.
       */
      private applyGroundAnisotropy(world: ENGINE.World): void {
        const reported = maxAnisotropyOf(world.getRenderer());
        this.groundAnisotropyFromRenderer = reported !== null;
        this.groundAnisotropy = clampAnisotropy(reported ?? FALLBACK_ANISOTROPY);
        applyAnisotropy(this.chunkTextures?.values() ?? [], this.groundAnisotropy);
      }

      /**
       * Re-applies anisotropy once the renderer can report its real limit.
       *
       * The world is built in `onBeforeBeginPlay`, where the renderer may not exist
       * yet; in that case the conservative fallback is used. Drivers usually allow
       * more than the fallback, so the first frame that does have a renderer upgrades
       * the value. Runs at most until the renderer answers once.
       */
      private ensureGroundAnisotropy(world: ENGINE.World | null): void {
        if (this.groundAnisotropyFromRenderer || !world) {
          return;
        }
        this.applyGroundAnisotropy(world);
      }

  /**
     * Adds the selection box and the placement preview to the world.
     *
     * `World.add()` already runs `beginPlaySubtree()` when the world is playing —
     * which it is here, because `World.beginPlay()` sets its own state before
     * calling `onBeforeBeginPlay()`. Calling `beginPlay()` again would trip the
     * lifecycle `ensure` and abort the rest of the hook.
     */
    private buildVisualHelpers(world: ENGINE.World): void {
      const selectionBox = SelectionBox.create({ name: 'SelectionBox' });
      world.add(selectionBox);
      this.selectionBox = selectionBox;

      const preview = PlacementPreview.create({ name: 'PlacementPreview' });
      world.add(preview);
      this.placementPreview = preview;
    }

    /**
         * Spawns the Loomkeeper, reading its spot from the `LoomkeeperSpawn` scene marker.
         *
         * The marker is an empty node whose position is the NPC's **feet**, so the
         * editor shows exactly where it will stand on the ground. A pawn's world
         * position is the capsule centre, so the conversion happens in `npcSpawn.ts`.
         *
         * A missing marker keeps the game playable (fallback position + one warning)
         * rather than removing the NPC — a silent absence would look like a dialogue
         * bug three scenes later.
     *
         * `setWorldPosition` is used rather than `position.set` because `MovementPawn`
         * forwards world transforms to its movement node — writing `position` directly
         * would be overwritten the first time the movement node syncs back.
         */
        private spawnLoomkeeper(world: ENGINE.World): void {
          const npc = Loomkeeper.create({ name: 'Loomkeeper', movementNode: null });
          world.add(npc);

          const spawn = resolveNpcSpawn(this.readSpawnMarker(world));
          npc.setWorldPosition(new THREE.Vector3(spawn.pawnOrigin.x, spawn.pawnOrigin.y, spawn.pawnOrigin.z));
          this.loomkeeper = npc;

          if (spawn.source === 'fallback') {
            console.warn(
              `[MyGameMode] no "${LOOMKEEPER_SPAWN_MARKER}" marker in the scene; `
              + `placing the Loomkeeper at ${spawn.feet.x}, ${spawn.feet.y}, ${spawn.feet.z}`,
            );
          }
        }

        /** Reads the marker's world position, or `null` when the scene has no marker. */
        private readSpawnMarker(world: ENGINE.World): WorldPoint | null {
          const marker = world.getRenderScene().getNodeByName<ENGINE.SceneNode>(LOOMKEEPER_SPAWN_MARKER);
          if (!marker) {
            return null;
          }
          const position = marker.getWorldPosition(new THREE.Vector3());
          return { x: position.x, y: position.y, z: position.z };
        }

  /** Creates the HUD. Kept async so `onBeforeBeginPlay` can stay synchronous. */
  private async buildUi(world: ENGINE.World): Promise<void> {
    try {
      this.ui = await createGameUi(world.uiManager);
      this.endCard = await createEndCard(world.uiManager);
    } catch (error) {
      console.warn('[MyGameMode] failed to create the HUD:', error);
    }

        // `createGameUi` finishes after several async widget initialisations, and each
        // widget is shown as it arrives — so the hotbar and design strip were on screen
        // for the first couple of seconds of the intro and only disappeared when the
        // first `updateHud()` ran after the await. Hiding them here closes that window:
        // the build HUD must never appear before the player can build.
        if (this.ui) {
          setBuildUiVisible(this.ui, false);
        }

        // The design strip already lists the library; without this hook a click
        // would only highlight the button and never say why nothing was built.
        this.ui?.tabs.onDesignSelected(design => {
          this.ui?.toast.show(
            `${design.name} · ${design.blocks.length} blocks · stamping not implemented yet`,
          );
        });

      if (shouldCreateDebugOverlay()) {
        try {
          this.debugOverlay = DebugOverlay.create(world.uiManager);
        } catch (error) {
          console.warn('[MyGameMode] failed to create the debug overlay:', error);
        }
      }
    }

  //====================================================================================================
  // Tick
  //====================================================================================================

  /**
     * Pushes held-key vertical input to the pawn, then advances the flow, the
   * cinematics and the reticle raycast.
   */
  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);

      this.enforceSpawnFloor(deltaTime);
      this.updateVerticalInput();
              this.updateSprintInput();
        this.updateFreeCamera(deltaTime);
        this.updateFlow(deltaTime);
    this.updateCinematicVisuals();
        this.ensureGroundAnisotropy(this.getWorld());
    this.updateDialogue(deltaTime);
        this.ui?.toast.tick(deltaTime);
    this.updateTargeting();
  }

  /** Syncs the HUD with the current mode and block count. */
  public override tickPostPhysics(deltaTime: number): void {
    super.tickPostPhysics(deltaTime);

    this.updateHud();
      this.updateDebugOverlay(deltaTime);
    }

  /**
   * Re-places a pawn that spawned inside the terrain, and stops once it is standing.
   *
   * The chunk colliders are registered after the world is generated, and the player
   * pawn is spawned by the engine on its own schedule — so on some runs the pawn
   * reaches its spawn position while the floor collider is not there yet. Gravity
   * starts pulling immediately, and by the time the collider appears the body is
   * already below the surface, where the character controller cannot climb out. The
   * debug overlay caught it: the same build reports `y = 9.899` (sunk ~1.1 m) on one
   * run and `y = 11.006` (correct) on the next.
   *
   * Rather than trying to delay the spawn — which the engine owns — the pawn is put
   * back above the floor and allowed to land again. Repeating that until it reports
   * grounded is what makes the spawn independent of the collider timing.
   *
   * Only armed for {@link SPAWN_FLOOR_GUARD_SECONDS} and disarmed on the first
   * successful landing, because the centre of the map is a carved pit: a player who
   * walks down into it is legitimately below `GROUND_TOP_Y` and must not be lifted
   * back out.
   */
  private enforceSpawnFloor(deltaTime: number): void {
    if (!this.spawnFloorGuard) {
      return;
    }

    this.spawnFloorGuardElapsed += deltaTime;
    if (this.spawnFloorGuardElapsed > SPAWN_FLOOR_GUARD_SECONDS) {
      this.spawnFloorGuard = false;
      return;
    }

    const pawn = this.getPlayerPawn();
    if (!pawn) {
      return;
    }

    if (pawn.position.y >= GROUND_TOP_Y - SPAWN_FLOOR_EPSILON) {
      // Above the floor. Standing on it means the spawn landed correctly; the guard
      // has nothing left to do.
      if (pawn.isGrounded) {
        this.spawnFloorGuard = false;
      }
      return;
    }

    pawn.setWorldPosition(
      new THREE.Vector3(pawn.position.x, GROUND_TOP_Y + SPAWN_DROP_HEIGHT, pawn.position.z),
    );
    runtimeInputLog.record('action', 'spawnFloorGuard:rescued', performance.now());
  }

    //====================================================================================================
      // Debug tools
      //====================================================================================================

      /**
       * Toggles the physics collider wireframe (F3+B).
       *
       * The engine draws every Rapier collider as coloured line segments, which is
       * the only way to see whether the voxel collider actually lines up with the
       * rendered blocks — the two are built from separate data paths.
       */
      private toggleCollisionDebug(): void {
        const physics = this.getWorld()?.gameLoop?.physicsEngine;
        if (!physics) {
          return;
        }
        this.isCollisionDebugEnabled = !this.isCollisionDebugEnabled;
        physics.setDebugRendererEnabled(this.isCollisionDebugEnabled);
              // The pawn-origin cube is part of the same readout: it answers "where do the
              // feet actually sit", which is the question the wireframe raises.
              this.getPlayerPawn()?.setRootMarkerVisible(this.isCollisionDebugEnabled);
              // The NPC's pivot matters for the same reason: `npcSpawn` converts a feet
              // position into a capsule centre, so seeing where that centre landed is the
              // only way to tell a wrong marker from a wrong model offset.
              this.loomkeeper?.setRootMarkerVisible(this.isCollisionDebugEnabled);
      }

      /**
       * Detaches the camera from the pawn and flies it freely (F3+C).
       *
       * The pawn keeps simulating — only the rendered camera changes — so the player
       * model stays visible and animated while the camera orbits it. That is what
       * makes this useful for checking the spawn point and the collider alignment.
       */
      private toggleFreeCamera(): void {
        const world = this.getWorld();
        if (!world) {
          return;
              }

        if (this.isFreeCameraActive) {
          this.freeCamera?.deactivate();
          this.isFreeCameraActive = false;
          this.getPlayerPawn()?.setBodyVisible(false);
          if (this.localController) {
            this.localController.isFreeLookEnabled = false;
          }
          return;
        }

        const pawn = this.getPlayerPawn();
        if (!pawn) {
          return;
        }

        if (!this.freeCamera) {
          const fov = world.getActiveCamera() instanceof THREE.PerspectiveCamera
            ? (world.getActiveCamera() as THREE.PerspectiveCamera).fov
            : 75;
          this.freeCamera = FreeCamera.create(world, fov);
        }

        // Start where the eye is, looking the same way, so the switch is seamless.
        // Pitch comes from the camera pivot, not the pawn root — see getCameraPitch().
        const position = pawn.getWorldPosition();
        position.y += pawn.eyeHeight;
        const rotation = pawn.getWorldRotation();
        this.freeCamera.activate(position, rotation.y, pawn.getCameraPitch());
        this.isFreeCameraActive = true;
        this.getPlayerPawn()?.setBodyVisible(true);
        if (this.localController) {
          this.localController.isFreeLookEnabled = true;
        }
      }

      /** Feeds one frame of movement and look input to the free camera. */
      private updateFreeCamera(deltaTime: number): void {
        const camera = this.freeCamera;
        if (!camera || !this.isFreeCameraActive) {
          this.pendingLookDeltaX = 0;
          this.pendingLookDeltaY = 0;
          return;
        }

        const controller = this.localController;
        const input = controller?.getInputManager();
        const input2: FreeCameraInput = {
          ...IDLE_FREE_CAMERA_INPUT,
          forward: readAxis(input, 'freeCameraForward', 'freeCameraBack'),
          right: readAxis(input, 'freeCameraRight', 'freeCameraLeft'),
          up: readAxis(input, 'freeCameraUp', 'freeCameraDown'),
          lookDeltaX: this.pendingLookDeltaX,
          lookDeltaY: this.pendingLookDeltaY,
        };
        this.pendingLookDeltaX = 0;
        this.pendingLookDeltaY = 0;
        camera.update(deltaTime, input2);
      }

      /** Records a mouse delta for the free camera. Called from the controller hook. */
      public addFreeCameraLook(deltaX: number, deltaY: number): void {
        if (!this.isFreeCameraActive) {
          return;
        }
        this.pendingLookDeltaX += deltaX;
        this.pendingLookDeltaY += deltaY;
      }

      /** Refreshes the F3 panel. Skipped entirely while the panel is hidden. */
        private updateDebugOverlay(deltaTime: number): void {
      const overlay = this.debugOverlay;
      if (!overlay || !overlay.isVisible) {
        return;
      }

      overlay.update(this.collectDebugSnapshot(deltaTime));
    }

    /** Gathers one frame of debug data. Pure reads — safe to call every frame. */
    public collectDebugSnapshot(deltaTime: number): DebugSnapshot {
      const timing = this.frameTimer.sample(deltaTime);
      const renderStats = readRenderStats(this.getWorld()?.getRenderer() ?? null);
      const chunkSize = GAMEPLAY_WORLD_GEN_CONFIG.chunkSize;
      const bounds = buildBoundsForRadius(GAMEPLAY_WORLD_GEN_CONFIG.editableRadius, chunkSize);

      return {
        player: this.collectPlayerSnapshot(chunkSize),
              freeCamera: this.collectFreeCameraSnapshot(),
              world: {
          surfaceY: GAMEPLAY_WORLD_GEN_CONFIG.surfaceY,
          groundTopY: GAMEPLAY_WORLD_GEN_CONFIG.surfaceY + 1,
          editable: bounds,
          chunkCount: this.worldChunks?.size ?? 0,
        },
        game: {
          phase: this.flow.currentPhase,
          buildMode: this.isBuildMode,
          cameraMode: this.cameraMode,
          placedBlocks: this.buildController?.getPlacedBlockCount() ?? 0,
          target: this.describeTarget(),
        },
                input: this.collectInputSnapshot(),
                perf: {
          fps: timing.fps,
          frameMs: timing.frameMs,
          drawCalls: renderStats?.drawCalls ?? null,
          triangles: renderStats?.triangles ?? null,
        },
      };
    }

    /** What the input layer saw, for the F3 panel. */
        private collectInputSnapshot(): DebugSnapshot['input'] {
          const trace = this.localController?.inputTrace;
          if (!trace) {
            return { heldKeys: [], heldMouse: [], recentActions: [] };
          }

          const now = performance.now();
          return {
            heldKeys: trace.keys,
            heldMouse: trace.mouse.map(mouseButtonName),
            recentActions: trace.actions.map(action => ({
              name: action.name,
              ageSeconds: (now - action.atMs) / 1000,
            })),
          };
        }

        /**
     * Writes a full runtime dump (F4).
     *
     * The F3 panel is a glanceable summary; this is the artifact you keep. It
     * answers the three questions a screenshot cannot:
     *
     *   - what the world actually contains (every chunk, every layer)
     *   - what the input layer received and what the game decided to do with it
     *   - what the renderer was told: face counts and texture sampling settings
     */
    private dumpRuntime(): void {
              // Stamped so two dumps taken seconds apart cannot overwrite each other, which is
              // exactly the comparison this diagnostic exists for.
              emitRuntimeDump(stampDumpFiles(this.buildRuntimeDump()));
        }

            /**
             * Freezes or resumes world time with F5.
             *
             * `TimeControl.freeze()` stops the delta from advancing, so every tick stops:
             * physics, the camera follow, and our own chunk rebuilds. The renderer keeps
             * drawing, which is what makes this useful — the frame stays exactly as it looked
             * when the key was pressed, so a good frame can be held while a dump is written.
             */
            private toggleFreeze(): void {
              const world = this.getWorld();
              if (!world) {
                return;
              }
              this.frozen = !this.frozen;
              const time = world.timeControl;
              if (this.frozen) {
                time.freeze();
              } else {
                time.resume();
              }
              runtimeInputLog.record('action', `freeze:${this.frozen ? 'on' : 'off'}`, performance.now());
              console.log(`[freeze] ${this.frozen ? 'frozen — F4 to dump, F5 to resume' : 'resumed'}`);
            }

        /**
         * Collects the dump artifacts without emitting them.
         *
         * Public so a test can assert the contents; the F4 handler only adds the
         * console output and the download on top.
         */
        public buildRuntimeDump(): RuntimeDumpFile[] {
      const sources = this.collectChunkDumpSources();
          return [
        { name: 'world-dump.txt', mime: 'text/plain', content: dumpWorldText(sources) },
        { name: 'world-dump.json', mime: 'application/json', content: dumpWorldJson(sources) },
        { name: 'input-log.jsonl', mime: 'application/x-ndjson', content: runtimeInputLog.toJsonl() },
        { name: 'render-report.txt', mime: 'text/plain', content: buildRenderReport(this.collectRenderReport()) },
      ];
    }

    /** One dump source per generated chunk, read straight from the voxel volumes. */
    private collectChunkDumpSources(): ChunkDumpSource[] {
      const chunks = this.worldChunks;
      if (!chunks) {
        return [];
      }

      const sources: ChunkDumpSource[] = [];
      for (const chunk of chunks.values()) {
        const volume = chunk.getVolume();
        sources.push({
          chunkX: chunk.chunkX,
          chunkZ: chunk.chunkZ,
          originX: chunk.chunkX * volume.sizeX,
          originY: 0,
          originZ: chunk.chunkZ * volume.sizeZ,
          sizeX: volume.sizeX,
          sizeY: volume.sizeY,
          sizeZ: volume.sizeZ,
          getVoxel: (x, y, z) => chunk.getVoxelAtWorld(x, y, z),
        });
      }

      // Stable order so two dumps taken minutes apart can be diffed.
      sources.sort((a, b) => (a.chunkZ - b.chunkZ) || (a.chunkX - b.chunkX));
      return sources;
    }

    /** Renderer counters, per-chunk mesh stats and the material sampling settings. */
    private collectRenderReport(): RenderReportInput {
      const chunks: ChunkRenderReport[] = [];
      for (const chunk of this.worldChunks?.values() ?? []) {
        chunks.push({
          chunkX: chunk.chunkX,
          chunkZ: chunk.chunkZ,
          faceCount: chunk.faceCount,
          rebuilds: chunk.rebuilds,
          placedBlocks: chunk.getPlacedBlockCount(),
                  groups: chunk.geometryGroupCount,
                  materialSlots: chunk.materialSlotCount,
                  renderedMaterials: chunk.renderedMaterialCount ?? undefined,
                                    maxUv: chunk.maxUv ?? undefined,
                                    offTileQuads: chunk.uvRange?.offTileQuads,
                                    maxQuadEdge: chunk.maxQuadEdge ?? undefined,
                                    stretchedQuads: chunk.quadExtents?.stretchedQuads,
        });
      }
      chunks.sort((a, b) => (a.chunkZ - b.chunkZ) || (a.chunkX - b.chunkX));

      return {
        renderer: readRenderStats(this.getWorld()?.getRenderer() ?? null),
        chunks,
        materials: this.collectMaterialReports(),
                drawables: this.collectDrawables(),
        scene: collectSceneReport(
          this.getWorld()?.getRenderScene() ?? null,
          this.getWorld()?.getActiveCamera() ?? null,
          this.getWorld()?.getRenderer() ?? null,
        ),
                post: collectPostReport(this.readPostProcessManager()),
                gpu: collectGpuReport(this.getWorld()?.getRenderer() ?? null, { recordPaths: true }),
        context: {
          phase: this.flow.currentPhase,
          cameraMode: this.cameraMode,
          buildMode: this.isBuildMode,
          isFlying: this.isFlying,
          placedBlocks: this.buildController?.getPlacedBlockCount() ?? 0,
                    frozen: this.frozen,
                  ...this.describeCamera(),
        },
      };
    }

            /**
             * Lists every object the renderer will actually submit, with its world size.
             *
             * A chunk is 16 m across, so a drawable far larger than that is geometry nobody
             * authored — and one huge quad carrying a single tile of texture is exactly what
             * "the ground collapsed into one chunk" looks like from inside.
             */
            private collectDrawables(): DrawableReport[] {
                          const pipeline = readDrawingPipeline(this.getWorld()?.getRenderer() ?? null);
                          return collectDrawableReports(
                            this.getWorld()?.getRootNodes() ?? [],
                            // Per-object path reads only answer once recording has seen a frame, so a
                            // `null` here means "not recorded yet", not "drawn by nothing".
                            pipeline ? object => readDrawablePath(pipeline, object) : undefined,
                          );
            }

                        /**
                         * The post-process manager, or `null` when the world has not bound one.
                         *
                         * The getter walks the world's game loop, which is absent in a headless test
                         * world, so it is called defensively rather than assumed.
                         */
                        private readPostProcessManager(): unknown {
                          try {
                            return this.getWorld()?.postProcessManager ?? null;
                          } catch {
                            return null;
                          }
                        }

            /** Camera position and what the crosshair actually hits, for the report. */
            private describeCamera(): Record<string, string | number | boolean> {
              const camera = this.getWorld()?.getActiveCamera();
              if (!camera) {
                return { cameraPosition: 'none' };
              }
              const position = camera.getWorldPosition(new THREE.Vector3());
              const info: Record<string, string | number | boolean> = {
                cameraPosition: `${position.x.toFixed(2)}/${position.y.toFixed(2)}/${position.z.toFixed(2)}`,
              };

              const hit = this.hoveredCell;
              if (hit) {
                info.crosshairBlock = `${hit.x}/${hit.y}/${hit.z}`;
              } else {
                info.crosshairBlock = 'none';
              }
              return info;
            }

    /**
     * Describes the chunk materials.
     *
         * Reads what the mesh is **actually rendering with**, not the array the chunk
         * was handed. The engine's `MeshNode` keeps its own copy and its own getter
         * warns that "the getter returns what was assigned, not the loaded material, so
         * read `mesh.material` for the one being rendered" — reporting the requested
         * array described the intent while the screen showed something else, which is
         * how a whole chunk can draw flat while the report looks perfect.
     */
    private collectMaterialReports(): MaterialReport[] {
      const reports: MaterialReport[] = [];
      const seen = new Set<THREE.Material>();

      for (const chunk of this.worldChunks?.values() ?? []) {
            for (const material of chunk.getRenderedMaterials()) {
          if (seen.has(material)) {
            continue;
          }
          seen.add(material);
          reports.push(describeMaterial(material));
        }
      }

      return reports;
    }

        /** Player position, facing and speed, or `null` before the pawn exists. */
        private collectPlayerSnapshot(chunkSize: number): DebugSnapshot['player'] {
      const pawn = this.getPlayerPawn();
      if (!pawn) {
        return null;
      }

      const position = pawn.getWorldPosition();
      const rotation = pawn.getWorldRotation();
      const yawDegrees = radiansToDegrees(rotation.y);
      const movement = pawn.movementNode;
      const grounded = movement instanceof ENGINE.CharacterMovementNode ? movement.isGrounded : false;
      const local = movement instanceof ENGINE.CharacterMovementNode
        ? movement.getVelocities()
        : { forward: 0, right: 0, vertical: 0 };

      return {
        position: { x: position.x, y: position.y, z: position.z },
        block: worldToBlock(position),
        chunk: worldToChunk(position, chunkSize),
        yawDegrees,
        grounded,
        velocity: localVelocitiesToWorld(local, rotation.y),
      };
    }

    /** Free-camera position, facing and speed, or `null` while it is not flying. */
        private collectFreeCameraSnapshot(): DebugSnapshot['freeCamera'] {
          const camera = this.freeCamera;
          if (!camera || !this.isFreeCameraActive) {
            return null;
          }

          const position = camera.getPosition();
          const velocity = camera.getVelocity();
          return {
            position: { x: position.x, y: position.y, z: position.z },
            block: worldToBlock(position),
            yawDegrees: radiansToDegrees(camera.getYaw()),
            pitchDegrees: radiansToDegrees(camera.getPitch()),
            velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
          };
        }

        /** A short description of what the reticle is pointing at. */
        private describeTarget(): string {
      const cell = this.hoveredCell;
      if (!cell) {
        return 'none';
      }
      return `${cell.x} / ${cell.y} / ${cell.z}`;
    }

  /**
     * Turns the two held vertical keys into vertical motion.
     *
     * The same physical keys mean different things depending on flight state, and
     * this is the single place that decides which meaning applies:
     *
     * | state    | Space                | Ctrl              |
          * |----------|----------------------|-------------------|
          * | grounded | jump (hold = bounce) | nothing (crouch TBD) |
          * | flying   | ascend               | descend           |
          * | flying, both held | hover        | hover            |
     *
     * The controller only records *which keys are held* — it never decides the
     * meaning — so there is no second copy of the flight flag that can drift.
     *
          * Jump follows the hold: Minecraft keeps bouncing while Space is held, and
          * `requestJump()` is safe to call every frame because the movement node only
          * consumes it when the pawn may actually jump (otherwise it arms the jump
          * buffer, which fires on landing).
     */
    private updateVerticalInput(): void {
    const pawn = this.getPlayerPawn();
    const controller = this.localController;
    if (!pawn || !controller) {
      return;
    }

      const intent = resolveVerticalIntent({
        isFlying: pawn.isFlying,
              // A locked screen means the player does not own the pawn: reading the held
              // flags here regardless would let a Space pressed during a conversation
              // still jump or lift, because this tick runs before the controller's own
              // `tickPrePhysics` gets a chance to clear them.
              primaryHeld: inputLock.isUnlocked && controller.isPrimaryVerticalHeld,
              secondaryHeld: inputLock.isUnlocked && controller.isSecondaryVerticalHeld,
      });

    if (intent.verticalInput !== this.lastVerticalInput) {
      // Logged because "pressed Ctrl on the ground and nothing happened" is the
      // exact report this exists to settle: the log shows whether the key arrived
      // and what the state machine decided.
      runtimeInputLog.record('action', `vertical:${intent.verticalInput}`, performance.now());
      this.lastVerticalInput = intent.verticalInput;
    }

    if (!pawn.isFlying) {
      // Landing cancels flight inside the movement node; mirror that here so the
      // game mode flag never drifts out of sync with the pawn.
      if (this.isFlying) {
        this.isFlying = false;
      }
        if (intent.jump) {
          pawn.requestJump();
        }
    }

      pawn.setVerticalInput(intent.verticalInput);
  }

        /**
         * Applies the sprint key to the pawn's movement node.
         *
         * Kept separate from `updateVerticalInput` because sprint is a horizontal
         * concern; the only shared rule is that a locked input (`inputLock`) means the
         * player does not own the pawn, so the key must not have an effect.
         *
         * Written every tick rather than on the key edge: `setSprinting` is idempotent
         * and this way a mode change, a blur or a released key all converge on the same
         * line of truth without extra bookkeeping.
         */
        private updateSprintInput(): void {
          const pawn = this.getPlayerPawn();
          const controller = this.localController;
          if (!pawn) {
            return;
          }
          const sprinting = !!controller && inputLock.isUnlocked && controller.isSprintHeld;
          if (pawn.isSprinting !== sprinting) {
            pawn.setSprinting(sprinting);
            runtimeInputLog.record('action', `sprint:${sprinting}`, performance.now());
          }
        }

  /** Advances the phase machine and reacts to phase changes. */
  private updateFlow(deltaTime: number): void {
    this.flow.update(deltaTime);

    const phase = this.flow.currentPhase;
    if (phase === this.lastPhase) {
      return;
    }

    this.onPhaseChanged(this.lastPhase, phase);
    this.lastPhase = phase;
  }

  /** Side effects that belong to the game, not to the flow state machine. */
    private onPhaseChanged(from: GamePhase, to: GamePhase): void {
      if (from === 'intro' && to === 'explore') {
              this.startDialogue('intro');
      }
      if (to === 'ended') {
        this.overlay.show();
        // The card is driven by the phase, not by the `endCard` timeline step: that
        // step has a duration of 0, so `TransitionRunner.update()` enters it and
        // finishes the sequence in the same call, and `currentStep()` already reads
        // `null` by the time the visuals are applied. The `ended` phase is the
        // durable signal, and it only fires once.
        if (this.endCard) {
          showEndCard(this.endCard, this.buildController?.getPlacedBlockCount() ?? 0);
        }
      }
    }

  /** Drives the black overlay from the active cinematic step. */
  private updateCinematicVisuals(): void {
    const runner = this.flow.activeRunner;
    if (!runner) {
      if (this.flow.currentPhase !== 'ended') {
        this.overlay.setOpacity(0);
      }
      return;
    }

    const step = runner.currentStep();
    const progress = runner.stepProgress;

    switch (step?.id) {
      case 'black':
        this.overlay.setOpacity(1);
        break;
      case 'fadeIn':
        this.overlay.setOpacity(fadeOpacity(progress, 1, 0));
        break;
      case 'blink':
        this.overlay.setOpacity(eyelidCoverage(progress));
        break;
      case 'blur':
      case 'unlock':
        this.overlay.setOpacity(0);
        break;
      case 'fadeOut':
        this.overlay.setOpacity(fadeOpacity(progress, 0, 1));
        break;
            case 'turnPlayer':
            case 'turnLoomkeeper':
              this.overlay.setOpacity(0);
              this.turnActorsTowardsEachOther(step.id === 'turnPlayer' ? progress : 1);
              break;
            case 'scrollLine':
            case 'scrollSpawn':
              this.overlay.setOpacity(0);
              break;
      default:
        break;
    }
  }

  /**
     * Turns the player and the Loomkeeper towards each other.
     *
     * `progress` drives the player's turn; the Loomkeeper snaps to its final facing
     * on the first frame of its own step, because it is a background actor and a
     * slow turn reads as a bug rather than as intent.
     */
    private turnActorsTowardsEachOther(progress: number): void {
      const pawn = this.getPlayerPawn();
      const npc = this.loomkeeper;
      if (!pawn || !npc) {
        return;
      }

      const playerPos = pawn.position;
      const npcPos = npc.position;

      const playerYaw = yawTowards(playerPos, npcPos);
      pawn.rotation.y = turnTowards(pawn.rotation.y, playerYaw, progress);

      npc.rotation.y = yawTowards(npcPos, playerPos);
    }

    /** Advances the active dialogue and releases the lock when it finishes. */
    private updateDialogue(deltaTime: number): void {
      const dialogue = this.dialogue;
      if (!dialogue) {
        return;
      }

          dialogue.update(deltaTime);
          this.updateDialogueTurn(dialogue);
          this.renderDialogueLine(dialogue);

          if (dialogue.isFinished) {
                      this.finishDialogue();
      }
        }

        /**
         * Turns the player towards the Loomkeeper once the reveal line is reached.
         *
         * N3 has the player ask "who is there?" and only *then* see the speaker, so
         * the turn is tied to the dialogue index rather than to a cinematic step.
         * The turn is driven by the line's own elapsed time, which means it plays
         * while the line types out and is already finished by the time the player
         * can advance.
         */
        private updateDialogueTurn(dialogue: DialogueRunner): void {
                  // The beat is found by cue, not by speaker: the script is placeholder and
                  // will be rewritten, and matching on `speaker === 'loomkeeper'` would move
                  // the turn whenever the new script names a speaker differently or reveals
                  // it later.
                  const turnIndex = findCueIndex(this.activeDialogueId, 'turnPlayerToLoomkeeper');
          if (turnIndex < 0 || dialogue.lineIndex < turnIndex) {
            return;
          }

          const progress = dialogue.lineIndex > turnIndex
            ? 1
            : Math.min(1, dialogue.lineElapsed / DIALOGUE_TURN_SECONDS);
          this.turnActorsTowardsEachOther(progress);
        }

        /**
         * Handles a "continue" press while a dialogue is on screen.
         *
         * Returns true when the press was consumed, so the caller can skip the
         * gameplay meaning of the same key (left click would otherwise also place a
         * block, Enter would submit a design).
         */
        private advanceDialogue(): boolean {
          const dialogue = this.dialogue;
          if (!dialogue) {
            return false;
          }

          dialogue.skip();
          this.renderDialogueLine(dialogue);

          if (dialogue.isFinished) {
                      this.finishDialogue();
          }
          return true;
        }

  /** Shows the current dialogue line in the dialogue box. */
    private renderDialogueLine(dialogue: DialogueRunner): void {
      const line = dialogue.currentLine();
      if (!line || !this.ui) {
        return;
      }

      this.ui.dialogue.showLine(SPEAKER_NAMES[line.speaker], dialogue.visibleText());
    }

  /** Raycasts from the camera centre and updates the selection box. */
  private updateTargeting(): void {
    const build = this.buildController;
    const selectionBox = this.selectionBox;
    if (!build || !selectionBox) {
      return;
    }

    const camera = this.getWorld()?.getActiveCamera();
    if (!camera) {
      this.hoveredCell = null;
      this.previewCell = null;
      selectionBox.hide();
      return;
    }

    const ignored: ENGINE.SceneNode[] = [];
    if (selectionBox) ignored.push(selectionBox);
    if (this.placementPreview) ignored.push(this.placementPreview);

    // The pawn's collision capsule sits at the ray origin, so without this the
    // raycast always reports a hit at distance 0 and the reticle never leaves
    // the player. `ignoredRootNodes` drops the whole pawn subtree, which covers
    // the capsule even though it is a child of the pawn.
    const pawn = this.getPlayerPawn();
    const ignoredRoots: ENGINE.SceneNode[] = pawn ? [pawn] : [];

    const hit = build.raycastFromCamera(camera, SCREEN_CENTRE, ignored, ignoredRoots);

        // A pawn or NPC between the camera and a block wins the raycast, exactly as
        // in Minecraft where the nearer entity hit replaces the block hit. In that
        // case there is no block to target, so the outline is hidden and editing is
        // suppressed rather than the ray passing through the entity.
        if (!hit || !build.isBlockHit(hit)) {
          this.hoveredCell = null;
          this.previewCell = null;
          selectionBox.hide();
          return;
        }

    this.hoveredCell = build.breakCell(hit);
    this.previewCell = build.placementCell(hit);
    selectionBox.showAt(this.hoveredCell, true);
  }

  /** Syncs the HUD with the current mode, block count and camera. */
    private updateHud(): void {
      const ui = this.ui;
      if (!ui) {
        return;
      }

        const placedBlockCount = this.buildController?.getPlacedBlockCount() ?? 0;

      setBuildUiVisible(ui, this.isBuildMode);
      setCrosshairVisible(ui, this.cameraMode === CameraMode.FirstPerson);

            // Must run after `setBuildUiVisible` and before the dialogue early-return:
            // the prompt decides its own visibility, and `setBuildUiVisible(true)` would
            // otherwise re-show a prompt that `update()` had deliberately hidden.
              ui.prompt.update(this.isBuildMode, placedBlockCount);

      if (this.dialogue) {
        // The dialogue box owns the screen while someone is talking.
        return;
      }

      this.updatePlacementPreview();
    }

  /** Shows the translucent preview in god view, hides it otherwise. */
  private updatePlacementPreview(): void {
    const preview = this.placementPreview;
    if (!preview) {
      return;
    }

    const showPreview = this.cameraMode === CameraMode.GodView && this.previewCell !== null;
    if (!showPreview || !this.previewCell) {
      preview.hide();
      return;
    }

    const blockId = this.ui?.hotbar.getSelectedBlockId() ?? BLOCK_AIR;
    const texture = this.chunkTextures ? textureForBlock(blockId, this.chunkTextures) : null;
    preview.showAt(this.previewCell, texture);
  }

  //====================================================================================================
  // Input
  //====================================================================================================

  /** Single funnel for every gameplay key the controller raises. */
  private handleAction(action: GameplayAction): void {
        runtimeInputLog.record('action', action, performance.now());

      // The confirmation dialog owns the screen while it is up, and it comes
            // before every other branch on purpose. `Enter` is bound to both
            // `advanceDialogue` and `submitDesign`, so handling the dialog after the
            // dialogue branch would send the accept key to an empty dialogue runner;
            // and the input lock below would swallow it a second time. Escape cancels;
            // anything else is dropped so a stray key cannot move the player behind
            // the panel.
            if (this.isConfirming) {
              if (action === 'advanceDialogue' || action === 'submitDesign') {
                this.confirmSubmit();
              } else if (action === 'cancel') {
                this.cancelSubmit();
              }
              return;
            }

            // Dialogue owns the screen while it is up: the only key that does anything is
      // the one that advances it.
      if (action === 'advanceDialogue') {
        this.advanceDialogue();
        return;
      }

            // The debug overlay is a developer tool: it must work in every phase,
            // including while a cinematic owns the screen.
            if (action === 'toggleDebugOverlay') {
              this.debugOverlay?.toggle();
              return;
            }

                        // F3+B / F3+C are developer tools too, so they bypass the phase gate.
                        if (action === 'toggleCollisionDebug') {
                          this.toggleCollisionDebug();
                          return;
                        }

                        if (action === 'toggleFreeCamera') {
                          this.toggleFreeCamera();
                          return;
                        }

                          // F4 must work in every phase, and must not depend on the renderer
                          // being ready — a dump taken while the world looks broken is the
                          // whole point.
                          if (action === 'dumpRuntime') {
                            this.dumpRuntime();
                            return;
                          }

                                                    // F5 freezes the frame, so a good-looking moment can be held while
                                                    // the dump is written. Without it the fault can re-appear between
                                                    // the key press and the file, and the dump describes the wrong frame.
                                                    if (action === 'freezeRender') {
                                                      this.toggleFreeze();
                                                      return;
                                                    }

                                    if (!this.flow.canAct && action !== 'cancel') {
                                                              this.localController?.inputTrace.action(`${action}:blocked`, performance.now());
                                                              return;
                                                            }

                                        // A conversation or a cinematic owns the player until it ends. This sits after
                                        // the debug tools above on purpose: F3+B, F3+C, F4 and F5 have to keep working
                                        // while the screen is locked, otherwise a stuck conversation cannot be
                                        // diagnosed. `advanceDialogue` is handled before this point, so the dialogue's
                                        // own key still gets through.
                                        if (inputLock.isLocked) {
                                          this.localController?.inputTrace.action(`${action}:locked`, performance.now());
                                          return;
                                        }

      switch (action) {
        case 'toggleCameraMode':
                  this.cameraMode = this.cameraMode === CameraMode.FirstPerson
                    ? CameraMode.GodView
                    : CameraMode.FirstPerson;
        break;
        case 'toggleBuildMode':
          this.setBuildMode(!this.isBuildMode);
        break;
        case 'toggleFlight':
          this.isFlying = !this.isFlying;
          this.getPlayerPawn()?.setFlying(this.isFlying);
          break;
        case 'undo':
          this.applyUndo();
          break;
        case 'redo':
          this.applyRedo();
          break;
        case 'submitDesign':
          this.submitDesign();
          break;
        case 'openPalette':
                case 'cancel':
                  break;
    }
    }

    /** Left click advances a dialogue, otherwise breaks; right click places. */
    private handleMouseAction(action: MouseAction): void {
      if (action === 'advanceDialogue') {
        this.advanceDialogue();
        return;
      }

            // Building is a gameplay action, so a locked screen stops it the same way it
            // stops movement. The dialogue's own left-click is handled above.
            if (inputLock.isLocked) {
              return;
            }

      // The hand swings on every click that reaches the player, hit or miss. It is the
            // only feedback that a click was seen at all: outside build mode nothing else
            // happens, and in build mode a click at the sky edits nothing but should still
            // look like it was attempted.
            this.getPlayerPawn()?.triggerSwing();

            if (!this.flow.canAct || !this.isBuildMode) {
        return;
      }

      if (action === 'place') {
        this.placeBlock();
      } else {
        this.breakBlock();
      }
    }

  /** Enters or leaves build mode, keeping the flow phase in sync. */
  private setBuildMode(building: boolean): void {
    if (building === this.isBuildMode) {
      return;
    }

    const event = building ? 'enterBuild' : 'exitBuild';
    const result = this.flow.dispatch(event);
    if (!result.accepted) {
      return;
    }

    this.isBuildMode = building;
  }

  //====================================================================================================
  // Build actions
  //====================================================================================================

  /** Places the selected block at the previewed cell. */
  private placeBlock(): void {
    const build = this.buildController;
    const cell = this.previewCell;
    if (!build || !cell) {
      return;
    }

    const blockId = this.ui?.hotbar.getSelectedBlockId() ?? BLOCK_AIR;
    if (blockId === BLOCK_AIR) {
      return;
    }

    const before = build.readBlock(cell);
    const result = build.place(cell, blockId);
    if (!result.ok) {
          this.reportBlockedEdit(cell, result.reason);
      return;
    }

    this.recordEdit('place', { ...cell, before, after: blockId });
        runtimeInputLog.record('edit', describeEdit('place', cell, before, blockId), performance.now());
  }

  /** Removes the block under the reticle. */
  private breakBlock(): void {
    const build = this.buildController;
    const cell = this.hoveredCell;
    if (!build || !cell) {
      return;
    }

    const before = build.readBlock(cell);
    const result = build.break(cell);
    if (!result.ok) {
          this.reportBlockedEdit(cell, result.reason);
      return;
    }

    this.recordEdit('break', { ...cell, before, after: BLOCK_AIR });
        runtimeInputLog.record('edit', describeEdit('break', cell, before, BLOCK_AIR), performance.now());
      }

  /** Pushes one cell edit onto the undo stack. */
  private recordEdit(label: string, edit: VoxelEdit): void {
    const batch: EditBatch = { label, edits: [edit] };
    this.undoStack.push(batch);
  }

    /**
     * Explains a rejected edit to the player.
     *
     * Only `protected` is worth a message: every other reason means the click did
     * not land on an editable block at all, which the reticle already shows.
     * Bedrock is the one case where the player aims at a real block and nothing
     * happens, so silence would read as a bug.
     */
    private reportBlockedEdit(
      cell: VoxelCell,
      reason: 'outOfBounds' | 'skipped' | 'empty' | 'protected',
    ): void {
      if (reason !== 'protected') {
        return;
      }

      this.ui?.toast.show(PROTECTED_BLOCK_HINT);
      runtimeInputLog.record('blocked', `protected@${cell.x},${cell.y},${cell.z}`, performance.now());
    }

  /** Reverts the last edit batch. */
  private applyUndo(): void {
    const batch = this.undoStack.undo();
    if (batch) {
      this.applyEdits(batch, 'before');
    }
  }

  /** Re-applies the last undone batch. */
  private applyRedo(): void {
    const batch = this.undoStack.redo();
    if (batch) {
      this.applyEdits(batch, 'after');
    }
  }

  /**
     * Writes one side of a batch back into the world.
     *
     * `setVoxelRaw()` only changes voxel data, so every touched chunk also has to
     * be flagged for rebuild — otherwise the mesh and collider keep showing the
     * pre-undo blocks and the action looks like it did nothing.
     */
    private applyEdits(batch: EditBatch, side: 'before' | 'after'): void {
      const chunks = this.worldChunks;
      const build = this.buildController;
      if (!chunks) {
        return;
      }

      for (const edit of batch.edits) {
        const chunk = this.chunkForCell(edit);
        if (!chunk) continue;
        if (!chunk.setVoxelRaw(edit.x, edit.y, edit.z, edit[side])) continue;
        build?.markChunkDirty(edit);
      }
    }

  /** The chunk that owns a cell, or `null` when it is outside the world. */
  private chunkForCell(cell: VoxelCell): VoxelChunkNode | null {
    const chunks = this.worldChunks;
    if (!chunks) {
      return null;
    }

    const size = GAMEPLAY_WORLD_GEN_CONFIG.chunkSize;
    const chunkX = Math.floor(cell.x / size);
    const chunkZ = Math.floor(cell.z / size);
    return chunks.get(`${chunkX},${chunkZ}`) ?? null;
  }

  //====================================================================================================
  // Flow actions
  //====================================================================================================

  /**
     * Submits the current design, or explains why it cannot be submitted.
     *
     * Ctrl+Enter no longer ends the run by itself: it opens the confirmation
     * dialog, and only Enter inside that dialog submits. The one exception is an
     * empty build, which skips the dialog — there is nothing to confirm, and the
     * prompt that advertises the shortcut is hidden at zero blocks anyway.
     */
  private submitDesign(): void {
    if (!this.isBuildMode) {
      return;
    }

      const placedBlockCount = this.buildController?.getPlacedBlockCount() ?? 0;
      if (isBlankSubmission(placedBlockCount)) {
          // Nothing to confirm, so the dialog is skipped and the refusal line plays
          // straight away — the same path the dialog's accept button would take.
          this.submitConfirmedDesign();
        return;
      }

      this.openSubmitConfirm();
    }

    /** True while the submit confirmation is waiting for an answer. */
    public get isConfirming(): boolean {
      return this.ui?.confirm.isVisible ?? false;
    }

    /** Shows the confirmation dialog and takes the input lock. */
    private openSubmitConfirm(): void {
      const confirm = this.ui?.confirm;
      if (!confirm || confirm.isVisible) {
        return;
      }

      confirm.show();
      inputLock.acquire('menu');
      // The toast explains mouse actions; with the pointer locked it would only
      // contradict the dialog.
      this.ui?.toast.hide();
    }

    /** Closes the dialog and leaves the build exactly as it was. */
    private cancelSubmit(): void {
      if (!this.ui?.confirm.isVisible) {
        return;
      }

      this.ui.confirm.hide();
      inputLock.releaseAll('menu');
    }

    /** Closes the dialog and dispatches the submit. */
    private confirmSubmit(): void {
      if (!this.ui?.confirm.isVisible) {
        return;
      }

      this.cancelSubmit();
      this.submitConfirmedDesign();
    }

    /**
       * Accepts a non-empty design: leaves build mode, plays the submit lines, then
       * hands over to the ending cinematic.
       *
       * The dialogue comes *before* `dispatch('submit')` on purpose. The ending opens
       * with a turn and then `fadeOut`, so dispatching first would start turning the
       * camera away while the Keeper was still talking.
       *
       * Leaving build mode here hides the hotbar and the prompt, so the conversation
       * happens over the world rather than over the HUD. The blank branch keeps build
       * mode: the player is about to be told to try again, so dropping them back into
       * `explore` (where B has to be pressed again) would just add a step.
       */
      private submitConfirmedDesign(): void {
        const placedBlockCount = this.buildController?.getPlacedBlockCount() ?? 0;
        this.flow.setPlacedBlockCount(placedBlockCount);

        if (isBlankSubmission(placedBlockCount)) {
          this.startDialogue('submitBlank');
          return;
        }

        this.setBuildMode(false);
        this.startDialogue('submit', () => this.beginEnding());
      }

      /** Dispatches the submit and starts the ending cinematic. */
      private beginEnding(): void {
        const result = this.flow.dispatch('submit');
    if (!result.accepted) {
          // Defensive: the confirm path only runs with at least one block, so this is
          // reachable only if the count collapsed between confirming and finishing.
          this.startDialogue('submitBlank');
      return;
    }

    this.overlay.show();
  }

  /** Starts a dialogue by script id, taking the input lock until it finishes. */
    private startDialogue(scriptId: DialogueScriptId, onFinished?: () => void): void {
        this.activeDialogueId = scriptId;
        this.dialogueOnFinished = onFinished ?? null;
        this.dialogue = new DialogueRunner(getDialogueScript(scriptId).lines);
      inputLock.acquire('dialogue');

          // `updateHud` returns early while a dialogue is up, so the ghost block would
          // otherwise keep floating in front of the speaker for the whole conversation.
          this.placementPreview?.hide();
    }

    /**
     * Tears the active dialogue down and runs its continuation.
     *
     * Both the auto-advance path and the skip path end a conversation, and the
     * teardown had been copy-pasted into each; the continuation callback (used by the
     * submit branches to reach the ending) would otherwise have needed the same
     * duplication. The callback is cleared before it runs so a continuation that
     * starts another dialogue cannot be re-entered by a stale one.
     */
    private finishDialogue(): void {
      this.dialogue = null;
      inputLock.releaseAll('dialogue');
      this.ui?.dialogue.hide();

      const continuation = this.dialogueOnFinished;
      this.dialogueOnFinished = null;
      continuation?.();
    }

  //====================================================================================================
  // Accessors
  //====================================================================================================

  /** The local player's pawn, if it has been spawned and possessed. */
  public getPlayerPawn(): MyCharacterPawn | null {
    const pawn = this.localController?.getPawn();
    return pawn instanceof MyCharacterPawn ? pawn : null;
  }

  /** Resolves once the HUD has finished initializing. */
  public async waitForUi(): Promise<void> {
    await this.uiReady;
  }

  /** The cell under the reticle this frame, or `null`. */
  public getHoveredCell(): VoxelCell | null {
    return this.hoveredCell;
  }

  /** The cell a placement would occupy this frame, or `null`. */
  public getPreviewCell(): VoxelCell | null {
    return this.previewCell;
  }

  /** The intro sequence, exposed so tests can assert on its shape. */
  public static introSequence(): ReturnType<typeof introSequence> {
    return introSequence();
  }

  /** The ending sequence, exposed so tests can assert on its shape. */
  public static endingSequence(): ReturnType<typeof endingSequence> {
    return endingSequence();
  }

  /** The active cinematic runner, if any. */
  public getActiveRunner(): TransitionRunner | null {
    return this.flow.activeRunner;
  }

  /** Hides the end card, e.g. when the player restarts. */
  public dismissEndCard(): void {
    if (this.endCard) {
      hideEndCard(this.endCard);
    }
  }
}
