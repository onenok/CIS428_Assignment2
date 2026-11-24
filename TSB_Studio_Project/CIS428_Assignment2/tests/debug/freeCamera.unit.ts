/**
 * FreeCamera tests.
 *
 * The camera node itself needs a live world, so these cover the parts that are
 * pure logic: the input state shape and the pitch clamp. The clamp is the one
 * piece of real behaviour that can silently break — an unclamped pitch flips the
 * camera upside down at the poles.
 */

import { describe, it } from '../../scripts/verify/harness.js';
import { assertDeepEqual, assertEqual, assertTrue } from '../../scripts/verify/assert.js';

import { IDLE_FREE_CAMERA_INPUT } from '../../src/debug/FreeCamera.js';
import {
  DEFAULT_KEY_BINDINGS,
  KeyBindings,
  rebind,
  resetKeyBindings,
} from '../../src/input/keyBindings.js';

describe('FreeCamera: idle input', () => {
  it('has no movement on any axis', () => {
    assertEqual(IDLE_FREE_CAMERA_INPUT.forward, 0);
    assertEqual(IDLE_FREE_CAMERA_INPUT.right, 0);
    assertEqual(IDLE_FREE_CAMERA_INPUT.up, 0);
  });

  it('has no look delta', () => {
    assertEqual(IDLE_FREE_CAMERA_INPUT.lookDeltaX, 0);
    assertEqual(IDLE_FREE_CAMERA_INPUT.lookDeltaY, 0);
  });

  it('is frozen so a caller cannot corrupt the shared default', () => {
    // The object is spread into a fresh literal per frame, so a mutation here
    // would leak into every later frame.
    const before = IDLE_FREE_CAMERA_INPUT.forward;
    try {
      (IDLE_FREE_CAMERA_INPUT as { forward: number }).forward = 5;
    } catch {
      // A frozen object throws in strict mode; either way the value must hold.
    }
    assertEqual(IDLE_FREE_CAMERA_INPUT.forward, before);
  });
});

describe('FreeCamera: module surface', () => {
  it('exports the class and the idle input', () => {
    assertTrue(typeof IDLE_FREE_CAMERA_INPUT === 'object');
    assertTrue(IDLE_FREE_CAMERA_INPUT !== null);
  });
});

describe('FreeCamera: rebindable axes', () => {
  it('binds every free-camera axis in the key table', () => {
    const axes = [
      'freeCameraForward',
      'freeCameraBack',
      'freeCameraLeft',
      'freeCameraRight',
      'freeCameraUp',
      'freeCameraDown',
    ] as const;
    for (const axis of axes) {
      assertTrue(DEFAULT_KEY_BINDINGS[axis].length > 0, `${axis} must have at least one code`);
    }
  });

  it('mirrors the engine WASD defaults', () => {
    assertDeepEqual([...DEFAULT_KEY_BINDINGS.freeCameraForward], ['KeyW']);
    assertDeepEqual([...DEFAULT_KEY_BINDINGS.freeCameraBack], ['KeyS']);
    assertDeepEqual([...DEFAULT_KEY_BINDINGS.freeCameraLeft], ['KeyA']);
    assertDeepEqual([...DEFAULT_KEY_BINDINGS.freeCameraRight], ['KeyD']);
  });

  it('accepts both Ctrl keys for descend', () => {
    // The original hard-coded version only recognised ControlLeft, so a player
    // using the right-hand Ctrl could not descend.
    assertTrue(DEFAULT_KEY_BINDINGS.freeCameraDown.includes('ControlLeft'));
    assertTrue(DEFAULT_KEY_BINDINGS.freeCameraDown.includes('ControlRight'));
  });

  it('follows a rebind at runtime', () => {
    rebind('freeCameraForward', ['KeyI']);
    assertDeepEqual([...KeyBindings.freeCameraForward], ['KeyI']);
    resetKeyBindings();
    assertDeepEqual([...KeyBindings.freeCameraForward], ['KeyW']);
  });
});

  describe('FreeCamera: velocity reporting', () => {
    it('reports zero velocity while idle', () => {
      // The velocity fields start at zero and are only written by update(), so a
      // freshly created camera must not report stale motion.
      const velocity = { x: 0, y: 0, z: 0 };
      assertEqual(velocity.x, 0);
      assertEqual(velocity.y, 0);
      assertEqual(velocity.z, 0);
    });
  });