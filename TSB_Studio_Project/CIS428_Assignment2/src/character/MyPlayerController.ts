/**
 * The player's input controller.
 *
 * Extends `DefaultPlayerController` so all engine movement (WASD, jump, look,
 * zoom, gamepad, virtual joystick) keeps working untouched. This class only
 * intercepts the gameplay keys listed in `KeyBindings` and forwards them to
 * `MyGameMode` through the `onAction` delegate.
 *
 * Design notes:
 *  - Every key comparison goes through `matchesBinding()`; no literal key codes
 *    appear in gameplay logic, so rebinding is a data change only.
 *  - Handled keys return `true` so the engine's own bindings never also fire
 *    (e.g. `E` opens the palette instead of triggering "interact").
 *  - Double-tap detection for flight lives here because it needs per-key timing,
 *    which the engine's input layer does not provide.
 */

import * as ENGINE from '@gnsx/genesys.js';
import { inputLock } from '../cinematic/InputLock.js';
import { KeyBindings, matchesBinding, matchesBindingRelease, type KeyBindingTable } from '../input/keyBindings.js';
import { InputTrace } from '../debug/InputTrace.js';
import { runtimeInputLog } from '../debug/InputLog.js';

/** Gameplay actions the controller can raise. */
export type GameplayAction =
  | 'toggleCameraMode'
  | 'toggleBuildMode'
  | 'toggleFlight'
  | 'openPalette'
  | 'undo'
  | 'redo'
  | 'submitDesign'
  | 'advanceDialogue'
    | 'cancel'
      | 'toggleDebugOverlay'
      | 'toggleCollisionDebug'
          | 'toggleFreeCamera'
          | 'dumpRuntime'
          | 'freezeRender';

/** Mouse actions the controller can raise. */
export type MouseAction = 'place' | 'break' | 'advanceDialogue';

/** Maximum gap between two presses for them to count as a double-tap. */
const DOUBLE_TAP_WINDOW_MS = 300;

/**
 * True when a key event is an auto-repeat rather than a real press.
 *
 * Test doubles build plain objects and omit `repeat`, so the read is defensive:
 * an absent flag means "not a repeat", which matches a real first press.
 */
function isRepeat(e: KeyboardEvent): boolean {
  return (e as { repeat?: boolean }).repeat === true;
}

@ENGINE.GameClass()
export class MyPlayerController extends ENGINE.DefaultPlayerController {
  /** Raised when a bound gameplay key is pressed. Return value is ignored. */
  public readonly onAction: ENGINE.Delegate<[GameplayAction], void> = new ENGINE.Delegate<[GameplayAction], void>();

    /** Raised when the player clicks to place or break a block. */
    public readonly onMouseAction: ENGINE.Delegate<[MouseAction], void> = new ENGINE.Delegate<[MouseAction], void>();

    /** Raised with a zero-based hotbar slot index when a digit key is pressed. */
    public readonly onSlotSelected: ENGINE.Delegate<[number], void> = new ENGINE.Delegate<[number], void>();

        /**
         * Raised with the raw pointer delta while the free camera is active.
         *
         * The free camera needs the same mouse motion the pawn would have consumed,
         * but it must not also turn the pawn — so the game mode decides whether to
         * forward the delta, and this class stays free of camera-mode knowledge.
         */
        public readonly onMouseLook: ENGINE.Delegate<[number, number], void> = new ENGINE.Delegate<[number, number], void>();

        /** True while the game mode wants raw mouse deltas instead of pawn look. */
        public isFreeLookEnabled: boolean = false;

                /**
                 * Shared trace the F3 overlay reads.
                 *
                 * Written here rather than in `MyGameMode` because this class is the only
                 * one that knows whether `matchesBinding()` passed — the distinction
                 * between "the key never arrived" and "the binding rejected it" is the
                 * whole point of the readout.
                 */
                public readonly inputTrace = new InputTrace();

                /**
                 * True when `code` is bound to one of the free-camera movement axes.
                 *
                 * Read from `KeyBindings` so a rebind is honoured. Used to swallow the
                 * movement keys while the free camera flies, which keeps the pawn still.
                 */
                private isFreeCameraAxis(code: string): boolean {
                  const axes: (keyof KeyBindingTable)[] = [
                    'freeCameraForward',
                    'freeCameraBack',
                    'freeCameraLeft',
                    'freeCameraRight',
                    'freeCameraUp',
                    'freeCameraDown',
                  ];
                  return axes.some(action => KeyBindings[action].includes(code));
                }

  /**
       * True while the "primary vertical" key (Space) is held.
       *
       * The key has two meanings — jump on the ground, ascend in flight — and this
       * class deliberately does **not** choose between them. It records the intent
       * only; `MyGameMode` reads it together with the pawn's flight state and
       * decides. Keeping the decision out of the controller is what stops the two
       * sides from drifting out of sync.
       */
      public isPrimaryVerticalHeld: boolean = false;

      /**
       * True while the "secondary vertical" key (Ctrl) is held.
       *
       * Descend in flight; reserved for crouch on the ground (not implemented yet,
       * so it currently does nothing while walking).
       */
      public isSecondaryVerticalHeld: boolean = false;

      /**
       * True while the sprint key (Shift) is held.
       *
       * Same split of responsibility as the vertical keys: this records only that
       * the key is down, and `MyGameMode` decides what it means for the pawn. The
       * key is swallowed so the engine's own Shift handling ("dash") never fires.
       */
      public isSprintHeld: boolean = false;

  private lastToggleFlightPressMs: number = -Infinity;

  /**
   * True while F3 is physically held.
   *
   * F3 is a modifier for the debug chords (F3+B colliders, F3+C free camera).
   * The browser does not report F3 as `ctrlKey`/`altKey`, so the held state has
   * to be tracked here. `handleKeyUp` clears it.
   */
  private isDebugModifierHeld: boolean = false;

    /**
     * Clears every held-key flag when the window loses focus.
     *
     * The browser stops delivering `keyup` once focus moves to another window, so
     * a key held during Alt+Tab would otherwise stay "down" forever: the debug
     * chord would keep firing on every later B/C press, and flight would keep
     * ascending. `InputManager` registers no `blur` listener of its own, so this
     * has to live here.
     */
    private readonly handleWindowBlur = (): void => {
          this.isPrimaryVerticalHeld = false;
          this.isSecondaryVerticalHeld = false;
              this.isSprintHeld = false;
      this.isDebugModifierHeld = false;
            this.inputTrace.clearHeld();
      // A stale timestamp would make the first press after refocus look like the
      // second half of a double-tap and toggle flight by accident.
      this.lastToggleFlightPressMs = -Infinity;
    };

    public override beginPlay(): boolean {
      if (!super.beginPlay()) {
        return false;
      }
      // Headless test worlds have no `window`; the blur guard is a browser-only concern.
      if (typeof window !== 'undefined') {
        window.addEventListener('blur', this.handleWindowBlur);
      }
      return true;
    }

    public override endPlay(): boolean {
      if (typeof window !== 'undefined') {
        window.removeEventListener('blur', this.handleWindowBlur);
      }
      this.handleWindowBlur();
      return super.endPlay();
    }

    public override handleKeyDown(e: KeyboardEvent): boolean {
              this.inputTrace.keyDown(e.code);
                  runtimeInputLog.record('keyDown', e.code, performance.now());

              // While the free camera flies, the movement keys belong to it. Swallowing
          // them here stops `DefaultPlayerController` from also walking the pawn —
          // without this the character slides around while the camera is detached.
          if (this.isFreeLookEnabled && this.isFreeCameraAxis(e.code)) {
            return true;
          }

          // Hotbar digits: 1..9 map to slots 0..8. Checked before the modifier-aware
          // bindings so a plain digit never falls through to an engine binding.
          const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.onSlotSelected.invoke(Number(digit[1]) - 1);
        return true;
      }

      // Modifier-aware bindings first: Ctrl+Z must not fall through to a plain Z action.
    if (matchesBinding('undo', e)) {
      this.inputTrace.action('undo', performance.now());
      this.onAction.invoke('undo');
      return true;
    }
    if (matchesBinding('redo', e)) {
      this.inputTrace.action('redo', performance.now());
      this.onAction.invoke('redo');
      return true;
    }

          if (matchesBinding('toggleDebugOverlay', e)) {
              // F3 opens the browser's find bar in some browsers; keep it for the game.
              e.preventDefault?.();
                        // F3 doubles as the debug modifier: remember it is held so the next
                        // key press can be read as a chord (F3+B, F3+C).
                        this.isDebugModifierHeld = true;
                        this.inputTrace.action('toggleDebugOverlay', performance.now());
                        this.onAction.invoke('toggleDebugOverlay');
                        return true;
                      }

                    // Debug chords. Checked before the plain bindings so F3+B never also
                    // toggles build mode, and F3+C never also toggles the camera mode.
                    if (this.isDebugModifierHeld) {
                      if (matchesBinding('toggleCollisionDebug', e)) {
                        e.preventDefault?.();
                        this.inputTrace.action('toggleCollisionDebug', performance.now());
                        this.onAction.invoke('toggleCollisionDebug');
                        return true;
                      }
                      if (matchesBinding('toggleFreeCamera', e)) {
                        e.preventDefault?.();
                        this.inputTrace.action('toggleFreeCamera', performance.now());
                        this.onAction.invoke('toggleFreeCamera');
                        return true;
                      }
                    }

    // F4 writes a runtime dump. Handled before the plain bindings so it cannot be
    // swallowed by a chord check, and it works whether or not F3 is held.
    if (matchesBinding('dumpRuntime', e)) {
      e.preventDefault?.();
      this.inputTrace.action('dumpRuntime', performance.now());
      this.onAction.invoke('dumpRuntime');
      return true;
    }

    if (matchesBinding('freezeRender', e)) {
      e.preventDefault?.();
      this.inputTrace.action('freezeRender', performance.now());
      this.onAction.invoke('freezeRender');
      return true;
    }

    if (matchesBinding('toggleCameraMode', e)) {
        // Tab is the browser's focus-traversal key. `InputManager` only calls
        // `preventDefault()` for Escape, so without this the focus ring moves and
        // the key never reaches gameplay.
        e.preventDefault?.();
        this.inputTrace.action('toggleCameraMode', performance.now());
        this.onAction.invoke('toggleCameraMode');
        return true;
      }
    if (matchesBinding('toggleBuildMode', e)) {
      this.inputTrace.action('toggleBuildMode', performance.now());
      this.onAction.invoke('toggleBuildMode');
      return true;
    }
    if (matchesBinding('openPalette', e)) {
      this.inputTrace.action('openPalette', performance.now());
      this.onAction.invoke('openPalette');
      return true;
    }
    // Dialogue advance shares Enter with submit. The game mode routes it by state,
        // so both are raised and only the meaningful one acts.
        if (matchesBinding('advanceDialogue', e)) {
          this.inputTrace.action('advanceDialogue', performance.now());
          this.onAction.invoke('advanceDialogue');
          return true;
        }
        if (matchesBinding('submitDesign', e)) {
          this.inputTrace.action('submitDesign', performance.now());
          this.onAction.invoke('submitDesign');
          return true;
        }
        if (matchesBinding('cancel', e)) {
          this.inputTrace.action('cancel', performance.now());
          this.onAction.invoke('cancel');
          return true;
        }

    // Vertical intent. Space is jump on the ground and ascend in flight; Ctrl is
        // crouch on the ground and descend in flight. This class records only *which
        // key is held* — `MyGameMode` reads the pair together with the pawn's flight
        // state and decides the meaning. Keeping the decision out of the controller
        // is what stops a second copy of the flight flag from drifting out of sync.
        //
        // Both keys are always swallowed: the game mode owns jump now (it calls
        // `movement.jump()`), so the engine's own handling must not also fire.
    if (matchesBinding('toggleFlight', e)) {
          // The browser repeats `keydown` while a key is held. A repeat is not a
          // second tap: treating it as one would toggle flight off again while the
          // player is still holding Space, and it would also desynchronise the
          // double-tap timer from real presses.
          if (isRepeat(e)) {
            this.isPrimaryVerticalHeld = true;
            return true;
          }

      const now = performance.now();
      if (now - this.lastToggleFlightPressMs <= DOUBLE_TAP_WINDOW_MS) {
        this.lastToggleFlightPressMs = -Infinity;
            // The tap that completes the double-tap also starts ascending: the player
            // is holding the key at that moment, so requiring a release-and-press
            // again would contradict the intended feel.
            this.isPrimaryVerticalHeld = true;
        this.onAction.invoke('toggleFlight');
        return true;
      }
      this.lastToggleFlightPressMs = now;
          this.isPrimaryVerticalHeld = true;
          this.inputTrace.action('flyUp', performance.now());
          return true;
    }

    if (matchesBinding('flyDown', e)) {
          this.isSecondaryVerticalHeld = true;
          this.inputTrace.action('flyDown', performance.now());
          return true;
        }

        // Sprint. Handled after the vertical keys so Space+Shift still jumps/sprints
        // (the two are complementary), and swallowed so the engine's Shift "dash"
        // binding never also fires.
        if (matchesBinding('sprint', e)) {
              this.isSprintHeld = true;
              this.inputTrace.action('sprint', performance.now());
              return true;
            }

    return super.handleKeyDown(e);
  }

  public override handleMouseMove(e: MouseEvent): boolean {
      // Locked means something else owns the screen (a conversation, a cinematic).
      // The delta is swallowed rather than dropped: returning `false` would let the
      // engine fall through to another handler, and letting it reach the base class
      // would keep accumulating look into a private counter that is only flushed in
      // `tickPrePhysics` — which is also suspended, so the view would snap sideways
      // the moment input comes back.
      if (inputLock.isLocked) {
        return true;
      }

    if (this.isFreeLookEnabled) {
      // Swallow the delta so the pawn does not also turn while the free camera
      // is flying — otherwise releasing the camera snaps the view sideways.
      this.onMouseLook.invoke(e.movementX, e.movementY);
      return true;
    }
    return super.handleMouseMove(e);
  }

      /**
       * Applies movement and look, unless something else owns the player.
       *
       * The base class reads its own private key flags and look accumulators here, so
       * there is no way to ask it for "movement but no look" — the only reliable stop
       * is to not run it. Skipping the whole method is also what keeps the look
       * accumulator at zero, which is what makes the view resume where it was instead
       * of jumping by however far the mouse travelled during the conversation.
       *
       * The held-key flags are cleared as well: they are read by `MyGameMode` to
       * choose between jump and ascend, and a Space held when a conversation starts
       * would otherwise keep the player rising for as long as the dialogue lasts.
       */
      public override tickPrePhysics(deltaTime: number): void {
        if (inputLock.isLocked) {
          this.isPrimaryVerticalHeld = false;
          this.isSecondaryVerticalHeld = false;
                  this.isSprintHeld = false;
          return;
        }
        super.tickPrePhysics(deltaTime);
      }

  public override handleKeyUp(e: KeyboardEvent): boolean {
        this.inputTrace.keyUp(e.code);
          runtimeInputLog.record('keyUp', e.code, performance.now());
        if (this.isFreeLookEnabled && this.isFreeCameraAxis(e.code)) {
        return true;
      }
                  // Releases match on the key code alone. At release time the modifier flags
                  // describe the keys still held, not what the binding asks for — checking
                  // them left Space "held" forever when it was released before Ctrl.
                  if (matchesBindingRelease('toggleDebugOverlay', e.code)) {
              this.isDebugModifierHeld = false;
              return true;
            }
              if (matchesBindingRelease('toggleFlight', e.code)) {
                  this.isPrimaryVerticalHeld = false;
      return true;
    }
      if (matchesBindingRelease('flyDown', e.code)) {
                  this.isSecondaryVerticalHeld = false;
      return true;
    }
            if (matchesBindingRelease('sprint', e.code)) {
                        this.isSprintHeld = false;
            return true;
          }
    return super.handleKeyUp(e);
  }

    /**
         * Left click breaks, right click places — the Minecraft convention.
     *
     * Both are swallowed (`return true`) so the engine's own mouse handling never
     * also fires — the default controller forwards clicks to the movement node,
     * which would fight the build system.
         *
         * Left click also raises `advanceDialogue`. The game mode decides which of the
         * two meanings applies: while a dialogue is on screen it advances the line and
             * ignores the break, otherwise it breaks a block. Doing the routing there
         * keeps this class free of game-state knowledge.
         */
        public override handleMouseDown(button: ENGINE.MouseButton, e: MouseEvent): boolean {
                  this.inputTrace.mouseDown(button);
                  if (button === ENGINE.MouseButton.Left) {
                    this.inputTrace.action('mouse:left', performance.now());
                    this.onMouseAction.invoke('advanceDialogue');
                        this.onMouseAction.invoke('break');
                    return true;
                  }
                  if (button === ENGINE.MouseButton.Right) {
                        this.inputTrace.action('mouse:right', performance.now());
                        this.onMouseAction.invoke('place');
                    return true;
                  }
                  return super.handleMouseDown(button, e);
                }

                public override handleMouseUp(button: ENGINE.MouseButton, e: MouseEvent): boolean {
                  this.inputTrace.mouseUp(button);
                  return super.handleMouseUp(button, e);
                                }

  /** Convenience for UI: the current binding for an action, for display. */
  public getBindingLabel(action: keyof KeyBindingTable): string {
    return KeyBindings[action].join(' / ');
  }
}
