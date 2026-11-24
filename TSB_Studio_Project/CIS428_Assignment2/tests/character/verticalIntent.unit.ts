/**
 * Vertical input arbitration tests.
 *
 * These pin the decision table that fixes four reported input bugs at once:
 * Ctrl must not descend while walking, Space must not ascend while walking,
  * holding both in flight must hover, and holding Space must keep hopping
  * (Minecraft behaviour) rather than firing only on the press edge.
 */

import { describe, it } from '../../scripts/verify/harness.js';
import { assertDeepEqual } from '../../scripts/verify/assert.js';
import { resolveVerticalIntent } from '../../src/character/verticalIntent.js';

function press(overrides: Partial<Parameters<typeof resolveVerticalIntent>[0]> = {}) {
  return resolveVerticalIntent({
    isFlying: false,
    primaryHeld: false,
    secondaryHeld: false,
    ...overrides,
  });
}

describe('verticalIntent: on the ground', () => {
   it('jumps as soon as Space goes down', () => {
    assertDeepEqual(press({ primaryHeld: true }), { verticalInput: 0, jump: true });
  });

   it('keeps jumping while Space stays held (hold-to-bounce)', () => {
     assertDeepEqual(press({ primaryHeld: true }), { verticalInput: 0, jump: true });
  });

  it('does nothing on Ctrl (crouch is not implemented and must not descend)', () => {
    assertDeepEqual(press({ secondaryHeld: true }), { verticalInput: 0, jump: false });
  });

   it('still jumps while Ctrl is also held', () => {
     assertDeepEqual(press({ primaryHeld: true, secondaryHeld: true }), { verticalInput: 0, jump: true });
  });
});

describe('verticalIntent: while flying', () => {
  it('ascends while Space is held', () => {
    assertDeepEqual(press({ isFlying: true, primaryHeld: true }), { verticalInput: 1, jump: false });
  });

  it('descends while Ctrl is held', () => {
    assertDeepEqual(press({ isFlying: true, secondaryHeld: true }), { verticalInput: -1, jump: false });
  });

  it('hovers when both keys are held instead of doing both', () => {
    assertDeepEqual(press({ isFlying: true, primaryHeld: true, secondaryHeld: true }), {
      verticalInput: 0,
      jump: false,
    });
  });

  it('hovers when neither key is held', () => {
    assertDeepEqual(press({ isFlying: true }), { verticalInput: 0, jump: false });
  });

  it('never jumps, however Space is pressed', () => {
    const held = press({ isFlying: true, primaryHeld: true });
    assertDeepEqual(held, { verticalInput: 1, jump: false });
  });
});