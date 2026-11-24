/**
 * Records what the input layer saw, for the F3 overlay.
 *
 * The overlay has to answer two different questions that a key list alone
 * cannot separate:
 *
 *   "did the key reach the handler?"   -> `heldKeys`
 *   "did the handler decide to act?"   -> `recentActions`
 *
 * A key that is held but never produces an action means the binding check or a
 * phase gate rejected it — which is exactly the bug class this exists to find.
 *
 * Pure data: no DOM, no engine types, so it runs in the headless harness.
 */

/** One action that fired, with the timestamp it fired at. */
export interface TracedAction {
  /** Action name, e.g. `flyDown` or `toggleFlight`. */
  readonly name: string;
  /** `performance.now()` at the moment it fired. */
  readonly atMs: number;
}

/** How many actions to keep. Older entries are dropped. */
const HISTORY_LIMIT = 8;

export class InputTrace {
  private readonly heldKeys = new Set<string>();
  private readonly heldMouse = new Set<number>();
  private readonly recent: TracedAction[] = [];

  /** Records a key press. */
  public keyDown(code: string): void {
    this.heldKeys.add(code);
  }

  /** Records a key release. */
  public keyUp(code: string): void {
    this.heldKeys.delete(code);
  }

  /** Records a mouse button press. */
  public mouseDown(button: number): void {
    this.heldMouse.add(button);
  }

  /** Records a mouse button release. */
  public mouseUp(button: number): void {
    this.heldMouse.delete(button);
  }

  /** Records that `name` fired at `nowMs`. */
  public action(name: string, nowMs: number): void {
    this.recent.push({ name, atMs: nowMs });
    if (this.recent.length > HISTORY_LIMIT) {
      this.recent.shift();
    }
  }

  /** Currently held key codes, sorted for a stable readout. */
  public get keys(): readonly string[] {
    return [...this.heldKeys].sort();
  }

  /** Currently held mouse buttons, sorted. */
  public get mouse(): readonly number[] {
    return [...this.heldMouse].sort((a, b) => a - b);
  }

  /** Recent actions, oldest first. */
  public get actions(): readonly TracedAction[] {
    return this.recent;
  }

  /**
   * Clears held state without touching history.
   *
   * The browser stops delivering `keyup` once focus leaves the window, so a key
   * held during Alt+Tab would otherwise stay "down" forever.
   */
  public clearHeld(): void {
    this.heldKeys.clear();
    this.heldMouse.clear();
  }

  /** Clears everything, including history. */
  public reset(): void {
    this.clearHeld();
    this.recent.length = 0;
  }
}