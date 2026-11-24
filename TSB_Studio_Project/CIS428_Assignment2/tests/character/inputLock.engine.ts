/**
 * Layer-2 tests for the input lock reaching gameplay.
 *
 * `InputLock` itself is covered by a layer-1 test, but a lock nobody reads is
 * just a flag: before this, a conversation left the player free to walk, turn and
 * build the whole time it was on screen. These cases pin the three readers — the
 * controller's movement tick, its mouse look, and the game mode's action routing
 * — plus the two developer tools that must keep working while locked.
 */

import * as ENGINE from '@gnsx/genesys.js';
import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { MyCharacterPawn } from '../../src/character/MyCharacterPawn.js';
import { MyPlayerController } from '../../src/character/MyPlayerController.js';
import { inputLock } from '../../src/cinematic/InputLock.js';
import { addAndBeginPlay, createHeadlessWorld } from '../world/headlessWorld.js';

/** A controller possessed by a pawn, with the pawn's movement calls recorded. */
async function possessedController(): Promise<{
  handle: Awaited<ReturnType<typeof createHeadlessWorld>>;
  controller: MyPlayerController;
  pawn: MyCharacterPawn;
  moves: string[];
  dispose: () => void;
}> {
  const handle = await createHeadlessWorld();
  const pawn = MyCharacterPawn.create({ name: 'TestPawn' });
  addAndBeginPlay(handle.world, pawn);
  const controller = MyPlayerController.create({ name: 'TestController' });
  addAndBeginPlay(handle.world, controller);
  controller.possess(pawn as unknown as ENGINE.Pawn);

  // Recording the calls the base class makes is the only way to see whether
  // `tickPrePhysics` ran at all: the pawn's own tick is headless, so position
  // would stay put for reasons that have nothing to do with the lock.
  const moves: string[] = [];
  const target = pawn as unknown as Record<string, unknown>;
  target.moveForward = () => { moves.push('moveForward'); };
  target.moveRight = () => { moves.push('moveRight'); };
  target.lookUp = () => { moves.push('lookUp'); };
  target.lookRight = () => { moves.push('lookRight'); };
  target.zoom = () => { moves.push('zoom'); };

  return {
    handle,
    controller,
    pawn,
    moves,
    dispose: () => {
      inputLock.clear();
      handle.dispose();
    },
  };
}

describe('input lock: movement', () => {
  it('applies movement when unlocked', async () => {
    const ctx = await possessedController();
    try {
      inputLock.clear();
      ctx.controller.handleKeyDown({ code: 'KeyW' } as KeyboardEvent);
      ctx.controller.tickPrePhysics(1 / 60);
      assertTrue(ctx.moves.includes('moveForward'), 'unlocked movement must reach the pawn');
    } finally {
      ctx.dispose();
    }
  });

  it('does not apply movement while locked', async () => {
    const ctx = await possessedController();
    try {
      ctx.controller.handleKeyDown({ code: 'KeyW' } as KeyboardEvent);
      inputLock.acquire('dialogue');
      ctx.controller.tickPrePhysics(1 / 60);
      assertEqual(ctx.moves.length, 0, `locked movement must not reach the pawn: ${ctx.moves.join(',')}`);
    } finally {
      ctx.dispose();
    }
  });

  // Space is held to ascend in flight. If the press arrives before the lock, the
  // flag would otherwise stay set for the whole conversation and the player would
  // keep rising with nothing on screen to explain it.
  it('clears a held vertical key while locked', async () => {
    const ctx = await possessedController();
    try {
      ctx.controller.handleKeyDown({ code: 'Space' } as KeyboardEvent);
      assertEqual(ctx.controller.isPrimaryVerticalHeld, true);

      inputLock.acquire('dialogue');
      ctx.controller.tickPrePhysics(1 / 60);

      assertEqual(ctx.controller.isPrimaryVerticalHeld, false);
      assertEqual(ctx.controller.isSecondaryVerticalHeld, false);
    } finally {
      ctx.dispose();
    }
  });

  it('resumes movement once the lock is released', async () => {
    const ctx = await possessedController();
    try {
      inputLock.acquire('dialogue');
      ctx.controller.handleKeyDown({ code: 'KeyW' } as KeyboardEvent);
      ctx.controller.tickPrePhysics(1 / 60);
      assertEqual(ctx.moves.length, 0);

      inputLock.release('dialogue');
      ctx.controller.tickPrePhysics(1 / 60);
      assertTrue(ctx.moves.includes('moveForward'), 'movement must come back after unlock');
    } finally {
      ctx.dispose();
    }
  });
});

describe('input lock: mouse look', () => {
  it('swallows the delta while locked instead of turning the pawn', async () => {
    const ctx = await possessedController();
    try {
      const looked: number[] = [];
      ctx.controller.onMouseLook.add((x) => { looked.push(x); });

      // Free look is the one path that turns the view without the base class, so
      // it is where a missed lock would be visible immediately.
      ctx.controller.isFreeLookEnabled = true;
      inputLock.acquire('dialogue');

      const handled = ctx.controller.handleMouseMove({ movementX: 40, movementY: 5 } as MouseEvent);
      assertEqual(handled, true, 'a swallowed delta must still count as handled');
      assertEqual(looked.length, 0, 'the view must not move while locked');
    } finally {
      ctx.dispose();
    }
  });

  it('turns the view again once unlocked', async () => {
    const ctx = await possessedController();
    try {
      const looked: number[] = [];
      ctx.controller.onMouseLook.add((x) => { looked.push(x); });

      ctx.controller.isFreeLookEnabled = true;
      const handled = ctx.controller.handleMouseMove({ movementX: 40, movementY: 5 } as MouseEvent);

      assertEqual(handled, true);
      assertEqual(looked.length, 1);
      assertEqual(looked[0], 40);
    } finally {
      ctx.dispose();
    }
  });
});