import { assertDeepEqual, assertEqual, assertFalse, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import {
  DEFAULT_KEY_BINDINGS,
  KeyBindings,
  isBound,
  matchesBinding,
  matchesBindingRelease,
  rebind,
  resetKeyBindings,
} from '../../src/input/keyBindings.js';

/** Builds the minimal event shape `matchesBinding` reads. */
function keyEvent(
  code: string,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {},
): Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey'> {
  return {
    code,
    ctrlKey: modifiers.ctrlKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    altKey: modifiers.altKey ?? false,
  };
}

describe('keyBindings: defaults', () => {
  it('binds every documented action', () => {
    const actions = Object.keys(DEFAULT_KEY_BINDINGS).sort();
    assertDeepEqual(actions, [
        'advanceDialogue',
        'cancel',
                'dumpRuntime',
        'flyDown',
        'flyUp',
                'freeCameraBack',
                'freeCameraDown',
                'freeCameraForward',
                'freeCameraLeft',
                'freeCameraRight',
                'freeCameraUp',
                'freezeRender',
                'openPalette',
        'redo',
                'sprint',
        'submitDesign',
        'toggleBuildMode',
        'toggleCameraMode',
                        'toggleCollisionDebug',
                        'toggleDebugOverlay',
                        'toggleFlight',
                        'toggleFreeCamera',
                        'undo',
                      ]);
            });

  it('uses Tab for camera mode and B for build mode', () => {
    assertDeepEqual([...DEFAULT_KEY_BINDINGS.toggleCameraMode], ['Tab']);
    assertDeepEqual([...DEFAULT_KEY_BINDINGS.toggleBuildMode], ['KeyB']);
  });

  it('binds both Ctrl keys for descend', () => {
    assertTrue(DEFAULT_KEY_BINDINGS.flyDown.includes('ControlLeft'));
    assertTrue(DEFAULT_KEY_BINDINGS.flyDown.includes('ControlRight'));
  });

    it('binds both Shift keys for sprint', () => {
      assertDeepEqual([...DEFAULT_KEY_BINDINGS.sprint], ['ShiftLeft', 'ShiftRight']);
    });

    it('does not reuse a vertical key for sprint', () => {
      // Sharing Space (jump/ascend) or Ctrl (descend/crouch) would make sprint
      // impossible to hold while moving vertically.
      for (const code of DEFAULT_KEY_BINDINGS.sprint) {
        assertFalse(DEFAULT_KEY_BINDINGS.flyUp.includes(code));
        assertFalse(DEFAULT_KEY_BINDINGS.flyDown.includes(code));
      }
    });

  it('never binds a movement key used by the engine controller', () => {
    const engineMovementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyR'];
      // The free-camera axes deliberately mirror the engine's WASD defaults so the
      // debug camera feels like walking. They are read only by the free camera and
      // never intercepted, so sharing the codes cannot steal engine movement.
      const freeCameraAxes = new Set<string>([
        'freeCameraForward',
        'freeCameraBack',
        'freeCameraLeft',
        'freeCameraRight',
      ]);
      for (const action of Object.keys(DEFAULT_KEY_BINDINGS) as (keyof typeof DEFAULT_KEY_BINDINGS)[]) {
        if (freeCameraAxes.has(action)) {
          continue;
        }
        for (const code of DEFAULT_KEY_BINDINGS[action]) {
          assertFalse(
            engineMovementKeys.includes(code),
            `${action} must not bind engine movement key ${code}`,
          );
        }
      }
    });
});

describe('keyBindings: isBound', () => {
  it('reports true for a bound code', () => {
    assertTrue(isBound('toggleCameraMode', 'Tab'));
  });

  it('reports false for an unbound code', () => {
    assertFalse(isBound('toggleCameraMode', 'KeyT'));
  });
});

describe('keyBindings: matchesBinding modifiers', () => {
  it('matches a plain press for a non-modifier action', () => {
    assertTrue(matchesBinding('toggleBuildMode', keyEvent('KeyB')));
  });

  it('rejects a non-modifier action when Ctrl is held', () => {
    assertFalse(matchesBinding('toggleBuildMode', keyEvent('KeyB', { ctrlKey: true })));
  });

  it('rejects a non-modifier action when Alt is held', () => {
    assertFalse(matchesBinding('toggleBuildMode', keyEvent('KeyB', { altKey: true })));
  });

  it('requires Ctrl for undo', () => {
    assertTrue(matchesBinding('undo', keyEvent('KeyZ', { ctrlKey: true })));
    assertFalse(matchesBinding('undo', keyEvent('KeyZ')));
  });

  it('accepts Cmd for undo on macOS', () => {
    assertTrue(matchesBinding('undo', keyEvent('KeyZ', { metaKey: true })));
  });

  it('requires Ctrl for redo', () => {
    assertTrue(matchesBinding('redo', keyEvent('KeyY', { ctrlKey: true })));
    assertFalse(matchesBinding('redo', keyEvent('KeyY')));
  });

  it('rejects a wrong code even with the right modifier', () => {
    assertFalse(matchesBinding('undo', keyEvent('KeyX', { ctrlKey: true })));
  });

    it('requires Ctrl for submitDesign so a bare Enter does nothing', () => {
      assertTrue(matchesBinding('submitDesign', keyEvent('Enter', { ctrlKey: true })));
      assertFalse(matchesBinding('submitDesign', keyEvent('Enter')));
    });

    it('accepts Cmd+Enter for submitDesign on macOS', () => {
      assertTrue(matchesBinding('submitDesign', keyEvent('Enter', { metaKey: true })));
    });

    it('rejects Alt+Enter for submitDesign', () => {
      assertFalse(matchesBinding('submitDesign', keyEvent('Enter', { ctrlKey: true, altKey: true })));
    });
  });

    describe('keyBindings: modifier keys as bindings', () => {
      it('matches flyDown on the left Ctrl key', () => {
        assertTrue(matchesBinding('flyDown', keyEvent('ControlLeft', { ctrlKey: true })));
      });

      it('matches flyDown on the right Ctrl key', () => {
        assertTrue(matchesBinding('flyDown', keyEvent('ControlRight', { ctrlKey: true })));
      });

      it('matches flyDown even when the event omits ctrlKey', () => {
        // Synthetic events (tests, IME quirks) may not set the flag; the binding
        // must not depend on it because the key code already identifies the key.
        assertTrue(matchesBinding('flyDown', keyEvent('ControlLeft')));
      });

      it('rejects flyDown when Alt is held so the god-view orbit chord stays free', () => {
        assertFalse(matchesBinding('flyDown', keyEvent('ControlLeft', { ctrlKey: true, altKey: true })));
      });

      it('still requires Ctrl for undo after the modifier short-circuit', () => {
        assertTrue(matchesBinding('undo', keyEvent('KeyZ', { ctrlKey: true })));
        assertFalse(matchesBinding('undo', keyEvent('KeyZ')));
      });

      it('still rejects Ctrl+B for a non-modifier action', () => {
        assertFalse(matchesBinding('toggleBuildMode', keyEvent('KeyB', { ctrlKey: true })));
        assertTrue(matchesBinding('toggleBuildMode', keyEvent('KeyB')));
      });

      it('does not let a modifier binding fire for an unbound code', () => {
        assertFalse(matchesBinding('flyDown', keyEvent('ShiftLeft', { ctrlKey: true })));
      });
    });

describe('keyBindings: rebind / reset', () => {
  it('rebind changes the live table', () => {
    rebind('toggleBuildMode', ['KeyG']);
    assertDeepEqual([...KeyBindings.toggleBuildMode], ['KeyG']);
    assertTrue(matchesBinding('toggleBuildMode', keyEvent('KeyG')));
    assertFalse(matchesBinding('toggleBuildMode', keyEvent('KeyB')));
  });

  it('resetKeyBindings restores every default', () => {
    rebind('toggleBuildMode', ['KeyG']);
    rebind('undo', ['KeyU']);
    resetKeyBindings();
    assertDeepEqual([...KeyBindings.toggleBuildMode], [...DEFAULT_KEY_BINDINGS.toggleBuildMode]);
    assertDeepEqual([...KeyBindings.undo], [...DEFAULT_KEY_BINDINGS.undo]);
  });

  it('rebinding one action does not affect another', () => {
    rebind('toggleCameraMode', ['KeyC']);
    assertDeepEqual([...KeyBindings.toggleBuildMode], [...DEFAULT_KEY_BINDINGS.toggleBuildMode]);
    resetKeyBindings();
  });

  it('supports multiple codes per action', () => {
    rebind('toggleBuildMode', ['KeyB', 'KeyG']);
    assertTrue(matchesBinding('toggleBuildMode', keyEvent('KeyB')));
    assertTrue(matchesBinding('toggleBuildMode', keyEvent('KeyG')));
    resetKeyBindings();
  });
});

describe('keyBindings: no duplicate bindings', () => {
  it('every default code maps to exactly one action, except the documented pairs', () => {
    // Space is intentionally shared (double-tap toggles, hold ascends).
    // KeyE is intentionally shared with the engine's interact key.
      // Enter is intentionally shared: it submits a design, and advances dialogue.
      // The game mode routes it by state, so only one meaning ever fires.
          // KeyB / KeyC are intentionally shared: they are plain actions on their own
          // and debug chords while F3 is held, which the controller resolves by order.
          // Space / Ctrl are intentionally shared with the free-camera axes: the free
          // camera reads them directly and never intercepts them.
          const allowedShared = new Set([
            'Space',
            'KeyE',
            'Enter',
            'KeyB',
            'KeyC',
            'ControlLeft',
            'ControlRight',
          ]);
    const seen = new Map<string, string>();
    for (const action of Object.keys(DEFAULT_KEY_BINDINGS) as (keyof typeof DEFAULT_KEY_BINDINGS)[]) {
      for (const code of DEFAULT_KEY_BINDINGS[action]) {
        const previous = seen.get(code);
        if (previous && previous !== action) {
          assertTrue(
            allowedShared.has(code),
            `${code} is bound to both ${previous} and ${action}`,
          );
        }
        seen.set(code, action);
      }
    }
    assertEqual(seen.size > 0, true);
  });
});
describe('keyBindings: releases ignore modifier state', () => {
  // Regression for the reported "press Space, then Ctrl, ascending never stops".
  // When Space is released while Ctrl is still down the event carries
  // `ctrlKey: true`, and `matchesBinding` rejects that for a plain binding — so
  // the fly-up flag was never cleared.
  it('still matches a released key when another modifier is held', () => {
    assertTrue(matchesBindingRelease('toggleFlight', 'Space'));
    assertTrue(matchesBindingRelease('flyDown', 'ControlLeft'));
  });

  it('rejects a code that is not bound to the action', () => {
    assertFalse(matchesBindingRelease('toggleFlight', 'ControlLeft'));
    assertFalse(matchesBindingRelease('flyDown', 'Space'));
  });

  it('does not care about modifier flags at all', () => {
    // The signature takes only a code, so there is nothing left to get wrong.
    assertEqual(matchesBindingRelease.length, 2);
  });
});

describe('keyBindings: the flight keys are one chord', () => {
  // Regression for "flying down and pressing Space does not stop the descent".
  // Space only registered when Ctrl was up, so the chord could be closed in one
  // order but not the other: Ctrl while ascending hovered, Space while
  // descending did nothing.
  it('accepts Space pressed while Ctrl is already held', () => {
    assertTrue(matchesBinding('toggleFlight', keyEvent('Space', { ctrlKey: true })));
    assertTrue(matchesBinding('flyUp', keyEvent('Space', { ctrlKey: true })));
  });

  it('accepts Ctrl pressed while Space is already held', () => {
    assertTrue(matchesBinding('flyDown', keyEvent('ControlLeft', { ctrlKey: true })));
  });

  it('still rejects the chord on Alt, which is reserved for the orbit camera', () => {
    assertFalse(matchesBinding('toggleFlight', keyEvent('Space', { ctrlKey: true, altKey: true })));
  });

  it('still rejects a chorded action on a plain key', () => {
    // The reason the modifier rule exists at all: Ctrl+Z must not also fire `Z`.
    assertFalse(matchesBinding('undo', keyEvent('KeyZ')));
    assertTrue(matchesBinding('undo', keyEvent('KeyZ', { ctrlKey: true })));
  });
});
