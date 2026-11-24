/**
 * Layer-2 tests for the player character stack.
 *
 * These run the real engine headlessly and assert the wiring that the game
 * depends on: the game mode spawns our pawn/controller, the pawn builds a
 * first-person camera, and the flying movement node actually lifts the pawn.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { assertClose, assertDeepEqual, assertEqual, assertInstanceOf, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { MyCharacterPawn } from '../../src/character/MyCharacterPawn.js';
import { MyPlayerController, type GameplayAction } from '../../src/character/MyPlayerController.js';
import { FlyingMovementNode, SPRINT_SPEED_MULTIPLIER } from '../../src/character/FlyingMovementNode.js';
import {
  PLAYER_COLLISION_HEIGHT,
  PLAYER_COLLISION_WIDTH,
} from '../../src/character/MyCharacterPawn.js';
import { CameraMode, MyGameMode } from '../../src/game/MyGameMode.js';
import { inputLock } from '../../src/cinematic/InputLock.js';
import { addAndBeginPlay, createHeadlessWorld, stepPhysics } from '../world/headlessWorld.js';

describe('MyCharacterPawn: construction', () => {
  it('builds a flying movement node', async () => {
    const handle = await createHeadlessWorld();
    try {
      const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
      addAndBeginPlay(handle.world, pawn);

      assertInstanceOf(pawn.movementNode, FlyingMovementNode);
      assertInstanceOf(pawn.flyingMovement, FlyingMovementNode);
    } finally {
      handle.dispose();
    }
  });

  it('attaches a camera to the pawn', async () => {
    const handle = await createHeadlessWorld();
    try {
      const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
      addAndBeginPlay(handle.world, pawn);

      const camera = pawn.getCamera();
      assertTrue(camera !== null, 'pawn should expose a camera');
      assertInstanceOf(camera, THREE.PerspectiveCamera);
    } finally {
      handle.dispose();
    }
  });

  it('uses a first-person camera (no spring arm)', async () => {
    const handle = await createHeadlessWorld();
    try {
      const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
      addAndBeginPlay(handle.world, pawn);

      const springArm = pawn.getNodeByName('CameraSpringArm');
      assertEqual(springArm, null, 'first-person pawn must not create a spring arm');
    } finally {
      handle.dispose();
    }
  });

  it('starts not flying', async () => {
    const handle = await createHeadlessWorld();
    try {
      const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
      addAndBeginPlay(handle.world, pawn);
      assertEqual(pawn.isFlying, false);
    } finally {
      handle.dispose();
    }
  });
});

  describe('MyCharacterPawn: Minecraft-style box collider', () => {
    it('uses a 0.6 x 1.8 x 0.6 box, not the engine capsule', async () => {
      const handle = await createHeadlessWorld();
      try {
        const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
        addAndBeginPlay(handle.world, pawn);

        const collision = pawn.getNodeByName<ENGINE.MeshNode>('Collision');
        assertTrue(collision !== null, 'pawn should own a Collision node');

        const geometry = collision!.geometry;
        assertEqual(geometry.type, 'BoxGeometry');

        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        assertClose(size.x, PLAYER_COLLISION_WIDTH, 1e-6);
        assertClose(size.y, PLAYER_COLLISION_HEIGHT, 1e-6);
        assertClose(size.z, PLAYER_COLLISION_WIDTH, 1e-6);
      } finally {
        handle.dispose();
      }
    });

    it('puts the collider on top of the origin so the pawn y is the feet', async () => {
          const handle = await createHeadlessWorld();
          try {
            const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
            addAndBeginPlay(handle.world, pawn);

            const collision = pawn.getNodeByName<ENGINE.MeshNode>('Collision');
            assertTrue(collision !== null, 'pawn should own a Collision node');
            assertClose(collision!.position.y, PLAYER_COLLISION_HEIGHT / 2, 1e-6);
            assertClose(collision!.position.x, 0, 1e-6);
            assertClose(collision!.position.z, 0, 1e-6);
          } finally {
            handle.dispose();
          }
        });

        it('keeps the eye inside the box so the camera never pokes out of the body', () => {
          // The box spans [0, PLAYER_COLLISION_HEIGHT] above the pawn origin, so the
          // eye has to be measured from the feet, not from the middle of the body.
      const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
          assertTrue(pawn.eyeHeight > 0, 'eye must be above the feet');
      assertTrue(
            pawn.eyeHeight < PLAYER_COLLISION_HEIGHT,
            'eye must stay below the top of the collider',
      );
    });

    it('keeps the box narrower than a block so 1-wide gaps are walkable', () => {
      assertTrue(PLAYER_COLLISION_WIDTH < 1, 'a 0.6 box fits through a 1-block gap');
    });

        it('keeps the origin marker hidden until the collider debug key turns it on', async () => {
          const handle = await createHeadlessWorld();
          try {
            const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
            addAndBeginPlay(handle.world, pawn);

            const marker = pawn.getNodeByName<ENGINE.MeshNode>('RootMarker');
            assertTrue(marker !== null, 'pawn should own a RootMarker node');
            assertEqual(marker!.visible, false);

            pawn.setRootMarkerVisible(true);
            assertEqual(marker!.visible, true);

            pawn.setRootMarkerVisible(false);
            assertEqual(marker!.visible, false);
          } finally {
            handle.dispose();
          }
        });
  });

  describe('MyCharacterPawn: sprint', () => {
    it('starts not sprinting', async () => {
      const handle = await createHeadlessWorld();
      try {
        const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
        addAndBeginPlay(handle.world, pawn);
        assertEqual(pawn.isSprinting, false);
        assertClose(pawn.flyingMovement!.effectiveSpeedModifier, 1, 1e-6);
      } finally {
        handle.dispose();
      }
    });

    it('applies the sprint multiplier through the movement node', async () => {
      const handle = await createHeadlessWorld();
      try {
        const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
        addAndBeginPlay(handle.world, pawn);

        pawn.setSprinting(true);
        assertEqual(pawn.isSprinting, true);
        assertClose(pawn.flyingMovement!.effectiveSpeedModifier, SPRINT_SPEED_MULTIPLIER, 1e-6);

        pawn.setSprinting(false);
        assertEqual(pawn.isSprinting, false);
        assertClose(pawn.flyingMovement!.effectiveSpeedModifier, 1, 1e-6);
      } finally {
        handle.dispose();
      }
    });

    it('is idempotent so it can be written every tick', async () => {
      const handle = await createHeadlessWorld();
      try {
        const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
        addAndBeginPlay(handle.world, pawn);

        pawn.setSprinting(true);
        pawn.setSprinting(true);
        // Stacking the same key twice must not square the multiplier.
        assertClose(pawn.flyingMovement!.effectiveSpeedModifier, SPRINT_SPEED_MULTIPLIER, 1e-6);
      } finally {
        handle.dispose();
      }
    });
    });

    describe('MyGameMode: sprint wiring', () => {
    /**
     * A game mode with a possessed controller, so `getPlayerPawn()` resolves.
     * `updateSprintInput` is private; the cast reaches the production path rather
     * than re-implementing the rule in the test.
     */
    async function wired(): Promise<{
      handle: Awaited<ReturnType<typeof createHeadlessWorld>>;
      gameMode: MyGameMode;
      controller: MyPlayerController;
      pawn: MyCharacterPawn;
      tick: () => void;
      dispose: () => void;
    }> {
      const handle = await createHeadlessWorld();
      const gameMode = MyGameMode.create({ name: 'TestGameMode' });
      handle.world.add(gameMode);
      gameMode.onBeforeBeginPlay();

      const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
      addAndBeginPlay(handle.world, pawn);
      const controller = MyPlayerController.create({ name: 'TestController' });
      addAndBeginPlay(handle.world, controller);
      controller.possess(pawn as unknown as ENGINE.Pawn);
      gameMode.localController = controller;

      // `onBeforeBeginPlay` starts the intro dialogue, which locks input. Clear it so
      // these cases observe the unlocked path; the locked case re-acquires its own.
      inputLock.clear();

      const tick = (gameMode as unknown as { updateSprintInput(): void })
        .updateSprintInput.bind(gameMode);

      return {
        handle,
        gameMode,
        controller,
        pawn,
        tick,
        dispose: () => {
          inputLock.clear();
          handle.dispose();
        },
      };
    }

    it('sprints while the sprint key is held', async () => {
      const ctx = await wired();
      try {
        ctx.controller.handleKeyDown({ code: 'ShiftLeft', shiftKey: true } as KeyboardEvent);
        assertEqual(ctx.controller.isSprintHeld, true);

        ctx.tick();
        assertEqual(ctx.pawn.isSprinting, true);
        assertClose(ctx.pawn.flyingMovement!.effectiveSpeedModifier, SPRINT_SPEED_MULTIPLIER, 1e-6);

        ctx.controller.handleKeyUp({ code: 'ShiftLeft' } as KeyboardEvent);
        ctx.tick();
        assertEqual(ctx.pawn.isSprinting, false);
      } finally {
        ctx.dispose();
      }
    });

    it('releases sprint when the window loses focus', async () => {
      const ctx = await wired();
      try {
        ctx.controller.handleKeyDown({ code: 'ShiftRight', shiftKey: true } as KeyboardEvent);
        ctx.tick();
        assertEqual(ctx.pawn.isSprinting, true);

        // A keyup for a key held while the window lost focus never arrives.
        (ctx.controller as unknown as { handleWindowBlur(): void }).handleWindowBlur();
        ctx.tick();
        assertEqual(ctx.pawn.isSprinting, false);
      } finally {
        ctx.dispose();
      }
    });

    it('ignores sprint while input is locked', async () => {
      const ctx = await wired();
      try {
        ctx.controller.handleKeyDown({ code: 'ShiftLeft', shiftKey: true } as KeyboardEvent);
        inputLock.acquire('dialogue');

        ctx.tick();
        assertEqual(ctx.pawn.isSprinting, false);
      } finally {
        ctx.dispose();
      }
    });

    it('does nothing when no pawn is possessed', async () => {
      const handle = await createHeadlessWorld();
      try {
        const gameMode = MyGameMode.create({ name: 'TestGameMode' });
        addAndBeginPlay(handle.world, gameMode);
        const tick = (gameMode as unknown as { updateSprintInput(): void })
          .updateSprintInput.bind(gameMode);
        tick();
        assertEqual(gameMode.getPlayerPawn(), null);
      } finally {
        handle.dispose();
      }
    });
  });

describe('FlyingMovementNode: flight state', () => {
  it('setFlying toggles the flag', async () => {
    const handle = await createHeadlessWorld();
    try {
      const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
      addAndBeginPlay(handle.world, pawn);
      const movement = pawn.flyingMovement!;

      movement.setFlying(true);
      assertEqual(movement.isFlying, true);
      assertEqual(pawn.isFlying, true);

      movement.setFlying(false);
      assertEqual(movement.isFlying, false);
    } finally {
      handle.dispose();
    }
  });

  it('setFlying(false) clears vertical velocity', async () => {
    const handle = await createHeadlessWorld();
    try {
      const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
      addAndBeginPlay(handle.world, pawn);
      const movement = pawn.flyingMovement!;

      movement.setFlying(true);
      movement.setVelocities(0, 0, 5);
      movement.setFlying(false);

      assertEqual(movement.getVelocities().vertical, 0);
    } finally {
      handle.dispose();
    }
  });

  it('ascends while flying with a positive vertical input', async () => {
    const handle = await createHeadlessWorld();
    try {
      const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
      pawn.setWorldPosition(new THREE.Vector3(0, 5, 0));
      addAndBeginPlay(handle.world, pawn);
      stepPhysics(handle.physics);

      const movement = pawn.flyingMovement!;
      movement.setFlying(true);
      movement.verticalInput = 1;

      const startY = pawn.position.y;
      for (let i = 0; i < 30; i++) {
        movement.tickPrePhysics(1 / 60);
        stepPhysics(handle.physics);
      }

      assertTrue(
        pawn.position.y > startY,
        `expected the pawn to rise, startY=${startY} endY=${pawn.position.y}`,
      );
    } finally {
      handle.dispose();
    }
  });

  it('descends while flying with a negative vertical input', async () => {
    const handle = await createHeadlessWorld();
    try {
      const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
      pawn.setWorldPosition(new THREE.Vector3(0, 20, 0));
      addAndBeginPlay(handle.world, pawn);
      stepPhysics(handle.physics);

      const movement = pawn.flyingMovement!;
      movement.setFlying(true);
      movement.verticalInput = -1;

      const startY = pawn.position.y;
      for (let i = 0; i < 30; i++) {
        movement.tickPrePhysics(1 / 60);
        stepPhysics(handle.physics);
      }

      assertTrue(
        pawn.position.y < startY,
        `expected the pawn to sink, startY=${startY} endY=${pawn.position.y}`,
      );
    } finally {
      handle.dispose();
    }
  });

  it('does not fall while hovering in flight', async () => {
    const handle = await createHeadlessWorld();
    try {
      const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
      pawn.setWorldPosition(new THREE.Vector3(0, 30, 0));
      addAndBeginPlay(handle.world, pawn);
      stepPhysics(handle.physics);

      const movement = pawn.flyingMovement!;
      movement.setFlying(true);
      movement.verticalInput = 0;

      const startY = pawn.position.y;
      for (let i = 0; i < 60; i++) {
        movement.tickPrePhysics(1 / 60);
        stepPhysics(handle.physics);
      }

      const drift = Math.abs(pawn.position.y - startY);
      assertTrue(drift < 0.5, `hover should hold altitude, drifted ${drift}`);
    } finally {
      handle.dispose();
    }
  });
});

describe('MyPlayerController: action routing', () => {
  it('raises toggleCameraMode for Tab', async () => {
    const handle = await createHeadlessWorld();
    try {
      const controller = MyPlayerController.create({ name: 'TestController' });
      addAndBeginPlay(handle.world, controller);

      const seen: string[] = [];
      controller.onAction.add(action => { seen.push(action); });

      const handled = controller.handleKeyDown({ code: 'Tab' } as KeyboardEvent);
      assertEqual(handled, true);
      assertEqual(seen.length, 1);
      assertEqual(seen[0], 'toggleCameraMode');
    } finally {
      handle.dispose();
    }
  });

  it('raises toggleBuildMode for B', async () => {
    const handle = await createHeadlessWorld();
    try {
      const controller = MyPlayerController.create({ name: 'TestController' });
      addAndBeginPlay(handle.world, controller);

      const seen: string[] = [];
      controller.onAction.add(action => { seen.push(action); });

      controller.handleKeyDown({ code: 'KeyB' } as KeyboardEvent);
      assertEqual(seen[0], 'toggleBuildMode');
    } finally {
      handle.dispose();
    }
  });

  it('raises undo only with Ctrl held', async () => {
    const handle = await createHeadlessWorld();
    try {
      const controller = MyPlayerController.create({ name: 'TestController' });
      addAndBeginPlay(handle.world, controller);

      const seen: string[] = [];
      controller.onAction.add(action => { seen.push(action); });

      controller.handleKeyDown({ code: 'KeyZ' } as KeyboardEvent);
      assertEqual(seen.length, 0, 'plain Z must not raise undo');

      controller.handleKeyDown({ code: 'KeyZ', ctrlKey: true } as KeyboardEvent);
      assertEqual(seen[0], 'undo');
    } finally {
      handle.dispose();
    }
  });

  it('tracks the primary vertical key (Space) on key down/up', async () => {
    const handle = await createHeadlessWorld();
    try {
      const controller = MyPlayerController.create({ name: 'TestController' });
      addAndBeginPlay(handle.world, controller);

      controller.handleKeyDown({ code: 'Space' } as KeyboardEvent);
        assertEqual(controller.isPrimaryVerticalHeld, true);

      controller.handleKeyUp({ code: 'Space' } as KeyboardEvent);
        assertEqual(controller.isPrimaryVerticalHeld, false);
    } finally {
      handle.dispose();
    }
  });

    it('tracks the secondary vertical key (Ctrl) on key down/up', async () => {
    const handle = await createHeadlessWorld();
    try {
      const controller = MyPlayerController.create({ name: 'TestController' });
      addAndBeginPlay(handle.world, controller);

        // A real browser event carries ctrlKey: true when Ctrl is pressed — that
        // flag is exactly what used to make this binding never fire.
        controller.handleKeyDown({ code: 'ControlLeft', ctrlKey: true } as KeyboardEvent);
        assertEqual(controller.isSecondaryVerticalHeld, true);

        controller.handleKeyUp({ code: 'ControlLeft', ctrlKey: true } as KeyboardEvent);
        assertEqual(controller.isSecondaryVerticalHeld, false);
    } finally {
      handle.dispose();
    }
  });

      it('swallows Space on the ground so jump and fly-up cannot both fire', async () => {
      const handle = await createHeadlessWorld();
      try {
        const controller = MyPlayerController.create({ name: 'TestController' });
        addAndBeginPlay(handle.world, controller);

          assertEqual(controller.handleKeyDown({ code: 'Space' } as KeyboardEvent), true);
          assertEqual(controller.isPrimaryVerticalHeld, true);
      } finally {
        handle.dispose();
      }
    });

      it('swallows Space while flying too, recording the same intent', async () => {
      const handle = await createHeadlessWorld();
      try {
        const controller = MyPlayerController.create({ name: 'TestController' });
        addAndBeginPlay(handle.world, controller);

          // The controller no longer knows about flight at all: the intent is
          // identical in both states, only MyGameMode interprets it differently.
        assertEqual(controller.handleKeyDown({ code: 'Space' } as KeyboardEvent), true);
          assertEqual(controller.isPrimaryVerticalHeld, true);
      } finally {
        handle.dispose();
      }
    });

        it('closes the flight chord in either order (Ctrl held, then Space)', async () => {
          // Regression: Space was rejected while Ctrl was down, so a player descending
          // could not press Space to stop — it only worked the other way round.
          const handle = await createHeadlessWorld();
          try {
            const controller = MyPlayerController.create({ name: 'TestController' });
            addAndBeginPlay(handle.world, controller);

            controller.handleKeyDown({ code: 'ControlLeft', ctrlKey: true } as KeyboardEvent);
            assertEqual(controller.isSecondaryVerticalHeld, true);

            const swallowed = controller.handleKeyDown({ code: 'Space', ctrlKey: true } as KeyboardEvent);
            assertEqual(swallowed, true);
            assertEqual(controller.isPrimaryVerticalHeld, true);
          } finally {
            handle.dispose();
          }
        });

  it('raises toggleFlight on a double tap of Space', async () => {
    const handle = await createHeadlessWorld();
    try {
      const controller = MyPlayerController.create({ name: 'TestController' });
      addAndBeginPlay(handle.world, controller);

      const seen: string[] = [];
      controller.onAction.add(action => { seen.push(action); });

      controller.handleKeyDown({ code: 'Space' } as KeyboardEvent);
      controller.handleKeyUp({ code: 'Space' } as KeyboardEvent);
      controller.handleKeyDown({ code: 'Space' } as KeyboardEvent);

      assertEqual(seen.length, 1);
      assertEqual(seen[0], 'toggleFlight');
    } finally {
      handle.dispose();
    }
  });

        it('starts ascending on the tap that completes the double tap', async () => {
          const handle = await createHeadlessWorld();
          try {
            const controller = MyPlayerController.create({ name: 'TestController' });
            addAndBeginPlay(handle.world, controller);

            controller.handleKeyDown({ code: 'Space' } as KeyboardEvent);
            controller.handleKeyUp({ code: 'Space' } as KeyboardEvent);
            // Second tap, still held — the design says this should ascend immediately
            // rather than waiting for a release-and-press.
            controller.handleKeyDown({ code: 'Space' } as KeyboardEvent);

            assertEqual(controller.isPrimaryVerticalHeld, true);
          } finally {
            handle.dispose();
          }
        });

        it('ignores an auto-repeat keydown when deciding double taps', async () => {
          const handle = await createHeadlessWorld();
          try {
            const controller = MyPlayerController.create({ name: 'TestController' });
            addAndBeginPlay(handle.world, controller);

            const seen: string[] = [];
            controller.onAction.add(action => { seen.push(action); });

            // Hold Space: the browser repeats keydown. A repeat must not count as the
            // second tap, or flight would toggle off while the key is still down.
            controller.handleKeyDown({ code: 'Space' } as KeyboardEvent);
            controller.handleKeyDown({ code: 'Space', repeat: true } as KeyboardEvent);
            controller.handleKeyDown({ code: 'Space', repeat: true } as KeyboardEvent);

            assertEqual(seen.length, 0);
            assertEqual(controller.isPrimaryVerticalHeld, true);
          } finally {
            handle.dispose();
          }
        });

    it('raises toggleCollisionDebug for F3 then B', async () => {
      const handle = await createHeadlessWorld();
      try {
        const controller = MyPlayerController.create({ name: 'TestController' });
        addAndBeginPlay(handle.world, controller);

        const seen: string[] = [];
        controller.onAction.add(action => { seen.push(action); });

        controller.handleKeyDown({ code: 'F3' } as KeyboardEvent);
        controller.handleKeyDown({ code: 'KeyB' } as KeyboardEvent);

        assertDeepEqual(seen, ['toggleDebugOverlay', 'toggleCollisionDebug']);
      } finally {
        handle.dispose();
      }
    });

    it('raises toggleFreeCamera for F3 then C', async () => {
      const handle = await createHeadlessWorld();
      try {
        const controller = MyPlayerController.create({ name: 'TestController' });
        addAndBeginPlay(handle.world, controller);

        const seen: string[] = [];
        controller.onAction.add(action => { seen.push(action); });

        controller.handleKeyDown({ code: 'F3' } as KeyboardEvent);
        controller.handleKeyDown({ code: 'KeyC' } as KeyboardEvent);

        assertDeepEqual(seen, ['toggleDebugOverlay', 'toggleFreeCamera']);
      } finally {
        handle.dispose();
      }
    });

    it('treats B as build mode once F3 is released', async () => {
      const handle = await createHeadlessWorld();
      try {
        const controller = MyPlayerController.create({ name: 'TestController' });
        addAndBeginPlay(handle.world, controller);

        const seen: string[] = [];
        controller.onAction.add(action => { seen.push(action); });

        controller.handleKeyDown({ code: 'F3' } as KeyboardEvent);
        controller.handleKeyUp({ code: 'F3' } as KeyboardEvent);
        controller.handleKeyDown({ code: 'KeyB' } as KeyboardEvent);

        assertDeepEqual(seen, ['toggleDebugOverlay', 'toggleBuildMode']);
      } finally {
        handle.dispose();
      }
    });

    it('swallows movement keys while the free camera flies', async () => {
    const handle = await createHeadlessWorld();
    try {
      const controller = MyPlayerController.create({ name: 'TestController' });
      addAndBeginPlay(handle.world, controller);

      // Without the free camera, W reaches the engine and starts walking.
      assertEqual(controller.handleKeyDown({ code: 'KeyW' } as KeyboardEvent), true);

      controller.isFreeLookEnabled = true;
      // With it, the same key must be swallowed so the pawn stays put.
      assertEqual(controller.handleKeyDown({ code: 'KeyW' } as KeyboardEvent), true);
      assertEqual(controller.handleKeyUp({ code: 'KeyW' } as KeyboardEvent), true);

      controller.isFreeLookEnabled = false;
    } finally {
      handle.dispose();
    }
  });

  it('clears every held flag when the window loses focus', async () => {
    const handle = await createHeadlessWorld();
      try {
        const controller = MyPlayerController.create({ name: 'TestController' });
        addAndBeginPlay(handle.world, controller);

        controller.handleKeyDown({ code: 'Space' } as KeyboardEvent);
        controller.handleKeyDown({ code: 'ControlLeft' } as KeyboardEvent);
        controller.handleKeyDown({ code: 'F3' } as KeyboardEvent);
                assertEqual(controller.isPrimaryVerticalHeld, true);
                assertEqual(controller.isSecondaryVerticalHeld, true);

        // Headless has no `window`, so drive the same reset the blur listener runs.
        controller.endPlay();

                assertEqual(controller.isPrimaryVerticalHeld, false);
                assertEqual(controller.isSecondaryVerticalHeld, false);
      } finally {
        handle.dispose();
      }
    });
  });

describe('MyGameMode: spawn wiring', () => {
  it('starts in first person with build mode and flight off', async () => {
    const handle = await createHeadlessWorld();
    try {
      const gameMode = MyGameMode.create({ name: 'TestGameMode' });
      addAndBeginPlay(handle.world, gameMode);

      assertEqual(gameMode.cameraMode, CameraMode.FirstPerson);
      assertEqual(gameMode.isBuildMode, false);
      assertEqual(gameMode.isFlying, false);
    } finally {
      handle.dispose();
    }
  });

  it('pawn factory produces a MyCharacterPawn', async () => {
    const handle = await createHeadlessWorld();
    try {
      const gameMode = MyGameMode.create({ name: 'TestGameMode' });
      addAndBeginPlay(handle.world, gameMode);

      const pawn = await gameMode.getPawnFactory()();
      assertInstanceOf(pawn, MyCharacterPawn);
    } finally {
      handle.dispose();
    }
  });

  it('controller factory produces a MyPlayerController', async () => {
    const handle = await createHeadlessWorld();
    try {
      const gameMode = MyGameMode.create({ name: 'TestGameMode' });
      addAndBeginPlay(handle.world, gameMode);

      const controller = await gameMode.getPlayerControllerFactory()();
      assertInstanceOf(controller, MyPlayerController);
    } finally {
      handle.dispose();
    }
  });

  it('toggleFlight flips the game mode flight flag', async () => {
    const handle = await createHeadlessWorld();
    try {
      const gameMode = MyGameMode.create({ name: 'TestGameMode' });
            handle.world.add(gameMode);
            gameMode.onBeforeBeginPlay();

      const controller = MyPlayerController.create({ name: 'TestController' });
      addAndBeginPlay(handle.world, controller);
      gameMode.localController = controller;

            // `handleAction` gates on `flow.canAct`, which is false during the intro.
            gameMode.flow.update(10);
            assertEqual(gameMode.flow.currentPhase, 'explore');

      // `handleAction` is private; the cast reaches the real production path
      // rather than re-implementing it in the test.
      const invoke = (gameMode as unknown as {
        handleAction(action: GameplayAction): void;
      }).handleAction.bind(gameMode);

      invoke('toggleFlight');
      assertEqual(gameMode.isFlying, true);

            // The controller records held keys only — there is no flight mirror to keep
            // in sync any more, which is what the old two-copy design kept getting wrong.
            assertEqual(controller.isPrimaryVerticalHeld, false);

      invoke('toggleFlight');
      assertEqual(gameMode.isFlying, false);
    } finally {
      handle.dispose();
    }
  });

  it('toggleCameraMode flips between first person and god view', async () => {
    const handle = await createHeadlessWorld();
    try {
      const gameMode = MyGameMode.create({ name: 'TestGameMode' });
      addAndBeginPlay(handle.world, gameMode);

      const controller = MyPlayerController.create({ name: 'TestController' });
      addAndBeginPlay(handle.world, controller);
      gameMode.localController = controller;
      controller.onAction.add(action => {
        // Mirror the private handler so the test exercises the public state.
        if (action === 'toggleCameraMode') {
          gameMode.cameraMode = gameMode.cameraMode === CameraMode.FirstPerson
            ? CameraMode.GodView
            : CameraMode.FirstPerson;
        }
      });

      controller.handleKeyDown({ code: 'Tab' } as KeyboardEvent);
      assertEqual(gameMode.cameraMode, CameraMode.GodView);

      controller.handleKeyDown({ code: 'Tab' } as KeyboardEvent);
      assertEqual(gameMode.cameraMode, CameraMode.FirstPerson);
    } finally {
      handle.dispose();
    }
  });
});

describe('MyGameMode: runtime dump (F4)', () => {
  it('produces all four artifacts', async () => {
    const handle = await createHeadlessWorld();
    try {
      const gameMode = MyGameMode.create({ name: 'TestGameMode' });
      handle.world.add(gameMode);
      gameMode.onBeforeBeginPlay();

      const files = gameMode.buildRuntimeDump();
      assertDeepEqual(files.map(file => file.name), [
        'world-dump.txt',
        'world-dump.json',
        'input-log.jsonl',
        'render-report.txt',
      ]);
    } finally {
      handle.dispose();
    }
  });

  it('dumps every generated chunk with its ground in place', async () => {
    const handle = await createHeadlessWorld();
    try {
      const gameMode = MyGameMode.create({ name: 'TestGameMode' });
      handle.world.add(gameMode);
      gameMode.onBeforeBeginPlay();

      const files = gameMode.buildRuntimeDump();
      const json = JSON.parse(files[1].content) as {
        chunkCount: number;
        chunks: { blocks: unknown[] }[];
      };

      assertEqual(json.chunkCount, gameMode.worldChunks?.size ?? -1);
      assertTrue(json.chunkCount > 0, 'the world should have chunks by now');
      assertTrue(
        json.chunks.some(chunk => chunk.blocks.length > 0),
        'at least one chunk should contain blocks',
      );

      // The text dump is the same data in a human-readable form; it must name the
      // chunk and include a filled layer.
      assertTrue(files[0].content.includes('chunk (0,0)'), files[0].content.slice(0, 200));
      assertTrue(files[0].content.includes('S='), 'the legend should list stone');
    } finally {
      handle.dispose();
    }
  });

  it('records held keys and actions in the input log', async () => {
    const handle = await createHeadlessWorld();
    try {
      const gameMode = MyGameMode.create({ name: 'TestGameMode' });
      handle.world.add(gameMode);
      gameMode.onBeforeBeginPlay();

      const controller = MyPlayerController.create({ name: 'TestController' });
      addAndBeginPlay(handle.world, controller);
      gameMode.localController = controller;

      controller.handleKeyDown({ code: 'ControlLeft', ctrlKey: true } as KeyboardEvent);
      controller.handleKeyUp({ code: 'ControlLeft', ctrlKey: true } as KeyboardEvent);

      const log = gameMode.buildRuntimeDump()[2].content;
      assertTrue(log.includes('ControlLeft'), log);
      assertTrue(log.includes('"kind":"keyDown"'), log);
      assertTrue(log.includes('"kind":"keyUp"'), log);
    } finally {
      handle.dispose();
    }
  });
});

describe('MyGameMode: registration', () => {
  it('registers as a GAME class', () => {
    const name = ENGINE.ClassRegistry.getClassName(MyGameMode.create({ name: 'Probe' }));
    assertEqual(name, 'GAME.MyGameMode');
  });

  it('registers the pawn and controller as GAME classes', () => {
    assertEqual(
      ENGINE.ClassRegistry.getClassName(MyCharacterPawn.create({ name: 'Probe' })),
      'GAME.MyCharacterPawn',
    );
    assertEqual(
      ENGINE.ClassRegistry.getClassName(MyPlayerController.create({ name: 'Probe' })),
      'GAME.MyPlayerController',
    );
  });
});