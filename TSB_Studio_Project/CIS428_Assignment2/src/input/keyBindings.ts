/**
 * Central key binding table.
 *
 * Every gameplay key lives here so it can be rebound at runtime (settings menu,
 * save file, console command) without touching gameplay code. Gameplay code must
 * read from `KeyBindings` — never compare against a literal `'KeyX'` string.
 *
 * Values are `KeyboardEvent.code` strings (physical key position, layout
 * independent), which is what the engine's InputManager reports.
 */

/** A single bindable action. Multiple codes = any of them triggers the action. */
export type KeyBinding = readonly string[];

export interface KeyBindingTable {
  /** Toggle between god-view (top-down) and first-person camera. */
  readonly toggleCameraMode: KeyBinding;
  /** Toggle build mode on/off. */
  readonly toggleBuildMode: KeyBinding;
  /** Toggle flight (double-tap). */
  readonly toggleFlight: KeyBinding;
  /** Ascend while flying. */
  readonly flyUp: KeyBinding;
  /** Descend while flying. */
  readonly flyDown: KeyBinding;
    /**
     * Sprint: hold to move faster.
     *
     * Frees the vertical axis (Ctrl stays "descend / crouch") and matches
     * Minecraft, where Shift sprints. The engine's own `DefaultPlayerController`
     * uses Shift as a "dash" tag for gameplay-sim characters, which this game does
     * not use — and the controller swallows the key before the base class sees it,
     * so there is no double meaning.
     */
    readonly sprint: KeyBinding;
  /** Open the block palette / inventory. */
  readonly openPalette: KeyBinding;
  /** Undo the last build action. */
  readonly undo: KeyBinding;
  /** Redo the last undone build action. */
  readonly redo: KeyBinding;
  /** Submit the current block design. */
  readonly submitDesign: KeyBinding;
    /** Advance the dialogue to the next line. */
    readonly advanceDialogue: KeyBinding;
    /** Cancel / close the current UI panel. */
    readonly cancel: KeyBinding;
        /** Toggle the F3 debug overlay. */
        readonly toggleDebugOverlay: KeyBinding;
            /** F3 + B: toggle the physics collider wireframe. */
            readonly toggleCollisionDebug: KeyBinding;
            /** F3 + C: detach the camera from the pawn and fly it freely. */
            readonly toggleFreeCamera: KeyBinding;
                        /**
                         * F4: write a full runtime dump.
                         *
                         * Separate from the F3 overlay on purpose: F3 is a glanceable panel,
                         * F4 is a file you can read afterwards. A screenshot loses chunk data,
                         * input history and texture settings — the dump keeps all three.
                         */
                        readonly dumpRuntime: KeyBinding;
                        /**
                         * F5: freeze / unfreeze world time.
                         *
                         * Freezing stops every tick (physics, our chunk rebuilds, camera follow), so
                         * the frame on screen stops changing. Needed because the fault being chased
                         * appears a moment after the scene goes quiet: without a freeze the picture
                         * is already wrong again by the time F4 finishes writing files.
                         */
                        readonly freezeRender: KeyBinding;
            /**
             * Free-camera movement axes.
             *
             * These mirror the engine's own WASD defaults so the debug camera feels
             * the same as walking. They are read only by the free camera — the engine's
             * `DefaultPlayerController` keeps its own bindings for actual movement, so
             * rebinding these does not change how the player walks.
             */
            readonly freeCameraForward: KeyBinding;
            readonly freeCameraBack: KeyBinding;
            readonly freeCameraLeft: KeyBinding;
            readonly freeCameraRight: KeyBinding;
            readonly freeCameraUp: KeyBinding;
            readonly freeCameraDown: KeyBinding;
          }

/**
 * Default bindings. Chosen to avoid collisions with the engine's
 * DefaultPlayerController defaults (WASD / arrows / Space / Q / Z / R / E).
 *
 * Note: `openPalette` intentionally reuses `KeyE`, which the engine also maps to
 * "interact". Build mode consumes it first and returns true, so interact never
 * fires while building.
 */
export const DEFAULT_KEY_BINDINGS: KeyBindingTable = {
  toggleCameraMode: ['Tab'],
  toggleBuildMode: ['KeyB'],
  toggleFlight: ['Space'],
  flyUp: ['Space'],
  flyDown: ['ControlLeft', 'ControlRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  openPalette: ['KeyE'],
  undo: ['KeyZ'],
  redo: ['KeyY'],
  submitDesign: ['Enter'],
    advanceDialogue: ['Enter'],
    cancel: ['Escape'],
      toggleDebugOverlay: ['F3'],
          toggleCollisionDebug: ['KeyB'],
          toggleFreeCamera: ['KeyC'],
                    dumpRuntime: ['F4'],
          freezeRender: ['F5'],
          freeCameraForward: ['KeyW'],
          freeCameraBack: ['KeyS'],
          freeCameraLeft: ['KeyA'],
          freeCameraRight: ['KeyD'],
          freeCameraUp: ['Space'],
          freeCameraDown: ['ControlLeft', 'ControlRight'],
        };

/**
 * Mutable runtime copy. Gameplay code reads this object; a settings UI can
 * reassign individual entries via {@link rebind}.
 */
export const KeyBindings: {
  -readonly [K in keyof KeyBindingTable]: KeyBindingTable[K];
} = { ...DEFAULT_KEY_BINDINGS };

/** Replaces one action's binding at runtime. */
export function rebind(action: keyof KeyBindingTable, codes: KeyBinding): void {
  KeyBindings[action] = codes;
}

/** Restores every action to its default binding. */
export function resetKeyBindings(): void {
  for (const action of Object.keys(DEFAULT_KEY_BINDINGS) as (keyof KeyBindingTable)[]) {
    KeyBindings[action] = DEFAULT_KEY_BINDINGS[action];
  }
}

/** True when `code` is bound to `action`. */
export function isBound(action: keyof KeyBindingTable, code: string): boolean {
  return KeyBindings[action].includes(code);
}

/**
 * Actions that only fire while Ctrl (or Cmd) is held.
 *
 * Kept as a set so adding a new chorded action is a one-line change instead of
 * another `||` in {@link matchesBinding}.
 */
const MODIFIER_ACTIONS: ReadonlySet<keyof KeyBindingTable> = new Set([
  'undo',
  'redo',
  'submitDesign',
]);

/**
 * Actions that are deliberately pressed *while* Ctrl is held.
 *
 * The flight controls are one chord: Space ascends, Ctrl descends, and holding
 * both hovers. Pressing Space with Ctrl already down therefore has to register,
 * or the pair can only ever be closed in one order — which is exactly the bug
 * that was reported ("flying down, pressing Space does not stop the descent,
 * but flying up and pressing Ctrl does hover").
 *
 * Only Ctrl/Meta is waived, not Alt: `Alt` stays reserved for the god-view orbit
 * chord.
 */
const MODIFIER_AGNOSTIC_ACTIONS: ReadonlySet<keyof KeyBindingTable> = new Set([
  'toggleFlight',
  'flyUp',
]);

/**
 * Key codes that ARE modifier keys.
 *
 * Pressing one of these sets the matching `ctrlKey` / `shiftKey` / `altKey` /
 * `metaKey` flag on the event. A binding whose own key is a modifier (e.g.
 * `flyDown = Ctrl`) must not be rejected by the modifier check below, or it
 * could never fire — the flag it sets is exactly what the check rejects.
 */
const MODIFIER_CODES: ReadonlySet<string> = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

/**
 * True when `code` is bound to `action`, ignoring modifier state.
 *
 * Used for key **releases**. {@link matchesBinding} also requires the event's
 * modifier flags to match what the action wants, which is only meaningful on
 * press: at release time those flags describe *the other keys still held*.
 *
 * Concretely, releasing Space while Ctrl is down reports `ctrlKey: true`, which
 * failed the "no modifier" rule, so the fly-up flag was never cleared and the
 * pawn kept ascending — reported as "press Space then Ctrl and ascending never
 * stops". Releasing in the other order worked because Ctrl's own release carries
 * `ctrlKey: true` and hits the `MODIFIER_CODES` exception.
 */
export function matchesBindingRelease(action: keyof KeyBindingTable, code: string): boolean {
  return isBound(action, code);
}

/**
 * True when `code` is bound to `action` and the event carries the modifiers that
 * action expects.
 *
 * `undo` / `redo` / `submitDesign` require Ctrl (or Cmd on macOS). Everything
 * else must NOT have Ctrl/Alt/Meta held, so Ctrl+Z never also triggers a plain
 * `Z` action, and a bare Enter never submits a design.
 *
 * Two exceptions, both because the bound key is itself part of a chord:
 *
 *  - when the bound key is a modifier (`flyDown = Ctrl`), the flag it sets is the
 *    same one the rule above rejects. Those bindings skip the Ctrl/Meta
 *    comparison and only keep the Alt guard, so Alt+Ctrl can still be reserved
 *    for the god-view orbit chord.
 *  - the flight keys are pressed with Ctrl down on purpose (see
 *    {@link MODIFIER_AGNOSTIC_ACTIONS}), so they also skip it.
 */
export function matchesBinding(
  action: keyof KeyBindingTable,
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): boolean {
  if (!isBound(action, e.code)) {
    return false;
  }
   if (MODIFIER_CODES.has(e.code) || MODIFIER_AGNOSTIC_ACTIONS.has(action)) {
     return !e.altKey;
   }
  const wantsModifier = MODIFIER_ACTIONS.has(action);
  const hasModifier = Boolean(e.ctrlKey) || Boolean(e.metaKey);
  if (wantsModifier !== hasModifier) {
    return false;
  }
  return !e.altKey;
}