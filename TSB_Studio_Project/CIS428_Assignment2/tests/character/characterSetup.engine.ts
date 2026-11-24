import * as ENGINE from '@gnsx/genesys.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { assertClose, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { addAndBeginPlay, createHeadlessWorld } from '../world/headlessWorld.js';
import { MyCharacterPawn } from '../../src/character/MyCharacterPawn.js';
import {
  DEFAULT_NPC_SPEED,
  DEFAULT_NPC_STOP_DISTANCE,
  createNpcMovementNode,
  moveNpcTo,
  stopNpc,
} from '../../src/character/NpcMover.js';

describe('MyCharacterPawn / first person setup', () => {
  it('places the eye above the feet, not above the collider centre', () => {
    const pawn = MyCharacterPawn.create({ name: 'Pawn' });
      assertClose(pawn.eyeHeight, 1.62, 1e-6);
  });

    it('keeps the eye inside the box so the camera is never outside the body', () => {
    const pawn = MyCharacterPawn.create({ name: 'Pawn' });
    assertTrue(pawn.eyeHeight > 0, 'eye height must be positive');
    assertTrue(pawn.eyeHeight < 1.8, 'eye height must stay below the character height');
  });
}, 'engine');

describe('MyCharacterPawn / body visibility', () => {
  it('hides the visual model in game by default', async () => {
    const handle = await createHeadlessWorld();
    try {
      const pawn = MyCharacterPawn.create({ name: 'Pawn' });
      addAndBeginPlay(handle.world, pawn);

      assertEqual(pawn.isBodyVisible, false);
    } finally {
      handle.dispose();
    }
  });

  it('setBodyVisible(true) shows the model again', async () => {
    const handle = await createHeadlessWorld();
    try {
      const pawn = MyCharacterPawn.create({ name: 'Pawn' });
      addAndBeginPlay(handle.world, pawn);

      pawn.setBodyVisible(true);
      assertEqual(pawn.isBodyVisible, true);

      pawn.setBodyVisible(false);
      assertEqual(pawn.isBodyVisible, false);
    } finally {
      handle.dispose();
    }
  });

    it('shows the first-person arm while the body is hidden, and hides it with the body', async () => {
      // The arm is the only part of the player that should be on screen in first
      // person; in the body-visible view it would sit inside the shoulder.
      const handle = await createHeadlessWorld();
      try {
        const pawn = MyCharacterPawn.create({ name: 'Pawn' });
        addAndBeginPlay(handle.world, pawn);

        const arm = pawn.getNodeByName<ENGINE.SceneNode>('FirstPersonArm');
        assertTrue(arm !== null, 'pawn should own a FirstPersonArm node');
        assertEqual(arm!.visible, true);

        pawn.setBodyVisible(true);
        assertEqual(arm!.visible, false);
      } finally {
        handle.dispose();
      }
    });

    it('parents the arm to the camera pivot so it follows the view', async () => {
      const handle = await createHeadlessWorld();
      try {
        const pawn = MyCharacterPawn.create({ name: 'Pawn' });
        addAndBeginPlay(handle.world, pawn);

        const arm = pawn.getNodeByName<ENGINE.SceneNode>('FirstPersonArm');
        assertTrue(arm !== null, 'pawn should own a FirstPersonArm node');
        // The pivot is the node pitch is written to; parenting there means the arm
        // needs no per-frame code to stay in the corner of the screen.
        assertEqual(arm!.parent !== pawn && arm!.parent !== null, true);
      } finally {
        handle.dispose();
      }
    });

            it('hangs the arm mesh above the elbow pivot so the hand is the far end', async () => {
              // The swing rotates about the elbow, which sits in the corner of the frame; the
              // hand has to be the end that moves.
              const handle = await createHeadlessWorld();
              try {
                const pawn = MyCharacterPawn.create({ name: 'Pawn' });
                addAndBeginPlay(handle.world, pawn);

                const mesh = pawn.getNodeByName<ENGINE.SceneNode>('FirstPersonArmMesh');
                assertTrue(mesh !== null, 'pawn should own a FirstPersonArmMesh node');
                assertTrue(mesh!.position.y > 0, 'the mesh must extend above its pivot');
              } finally {
                handle.dispose();
              }
            });

            it('starts a swing on request and returns the arm to rest afterwards', async () => {
              const handle = await createHeadlessWorld();
              try {
                const pawn = MyCharacterPawn.create({ name: 'Pawn' });
                addAndBeginPlay(handle.world, pawn);

                assertEqual(pawn.isSwingActive, false);

                const wrist = pawn.getNodeByName<ENGINE.SceneNode>('FirstPersonArm')!;
                const restPitch = wrist.rotation.x;

                pawn.triggerSwing();
                assertEqual(pawn.isSwingActive, true);

                // A quarter of the way in is the peak of the arc, so the pitch must have
                                // moved by a visible amount, away from the camera (the punch).
                pawn.tickPrePhysics(0.075);
                assertTrue(
                                  wrist.rotation.x < restPitch - 0.3,
                                  'the hand should extend away from the camera, not into it',
                );

                pawn.tickPrePhysics(0.3);
                assertEqual(pawn.isSwingActive, false);
                assertClose(wrist.rotation.x, restPitch, 1e-6);
              } finally {
                handle.dispose();
              }
            });

            it('restarts a swing already in progress instead of queueing a second one', () => {
              // A held button has to read as repeated hits, so a click mid-swing resets the
              // arc rather than waiting for the current one to finish.
              const handlePromise = createHeadlessWorld();
              return handlePromise.then((handle) => {
                try {
                  const pawn = MyCharacterPawn.create({ name: 'Pawn' });
                  addAndBeginPlay(handle.world, pawn);

                  const wrist = pawn.getNodeByName<ENGINE.SceneNode>('FirstPersonArm')!;

                  pawn.triggerSwing();
                  // Near the end of the arc, where the arm is almost back down.
                  pawn.tickPrePhysics(0.27);
                  const nearlyFinishedPitch = wrist.rotation.x;

                  pawn.triggerSwing();
                  pawn.tickPrePhysics(0.009);

                  assertTrue(
                                      wrist.rotation.x < nearlyFinishedPitch - 0.2,
                                      'the restarted swing should be back at the start of the arc',
                  );
                } finally {
                  handle.dispose();
                }
              });
            });
}, 'engine');

describe('NpcMover / node creation', () => {
  it('creates a node with the default speed and stop distance', () => {
    const node = createNpcMovementNode();

    assertTrue(node instanceof ENGINE.NpcMovementNode);
    assertClose(node.getStopDistance(), DEFAULT_NPC_STOP_DISTANCE, 1e-6);
    assertClose(node.maxSpeed, DEFAULT_NPC_SPEED, 1e-6);
  });

  it('honours custom speed and stop distance', () => {
    const node = createNpcMovementNode({ speed: 5, stopDistance: 3 });

    assertClose(node.maxSpeed, 5, 1e-6);
    assertClose(node.getStopDistance(), 3, 1e-6);
  });
}, 'engine');

describe('NpcMover / target handling', () => {
  it('has no target before one is set', () => {
    const node = createNpcMovementNode();
    assertEqual(node.getCurrentTarget(), null);
  });

  it('stopNpc leaves the node without a target', () => {
    const node = createNpcMovementNode();
    stopNpc(node);

    assertEqual(node.getCurrentTarget(), null);
  });

  it('moveNpcTo accepts a plain position object', () => {
    const node = createNpcMovementNode();
    // No owner is attached, so the node cannot resolve a world position; the
    // call must still be safe and must not throw.
    moveNpcTo(node, { x: 4, y: 0, z: -2 });
    assertEqual(node.getCurrentTarget(), null);
  });
}, 'engine');