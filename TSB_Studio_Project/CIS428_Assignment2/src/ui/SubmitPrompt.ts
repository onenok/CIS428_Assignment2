/**
 * Submit prompt.
 *
 * A small persistent hint that tells the player how to submit, plus the
 * enable/disable logic that decides whether submitting is allowed right now.
 *
 * The hint text is derived from the key binding table rather than hard-coded, so
 * rebinding `submitDesign` updates the on-screen hint automatically.
 */

import * as ENGINE from '@gnsx/genesys.js';
import { KeyBindings } from '../input/keyBindings.js';

/** Human-readable label for a `KeyboardEvent.code`. */
const CODE_LABELS: Readonly<Record<string, string>> = {
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Space: 'Space',
};

/** Turns a key code into the label shown on screen. */
export function keyLabel(code: string): string {
  const known = CODE_LABELS[code];
  if (known) {
    return known;
  }
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  return code;
}

/**
 * Builds the submit hint, e.g. `Ctrl + Enter to submit`.
 *
 * `submitDesign` is a chorded action, so the modifier is part of the label.
 */
export function submitHintText(): string {
  const codes = KeyBindings.submitDesign;
  const key = codes.length > 0 ? keyLabel(codes[0]) : 'Enter';
  return `Ctrl + ${key} to submit`;
}

/** Why submitting is currently blocked, or `null` when it is allowed. */
export type SubmitBlockReason = 'empty' | 'notBuilding' | null;

/** Decides whether the submit prompt should be shown as enabled. */
export function submitEnabled(isBuilding: boolean, placedBlockCount: number): boolean {
  return isBuilding && placedBlockCount > 0;
}

/** Explains why submitting is blocked. */
export function submitBlockReason(isBuilding: boolean, placedBlockCount: number): SubmitBlockReason {
  if (!isBuilding) {
    return 'notBuilding';
  }
  if (placedBlockCount <= 0) {
    return 'empty';
  }
  return null;
}

/**
 * The on-screen prompt.
 *
 * Deliberately **not** a `CenterMessage`: that anchors dead centre and covers the
 * crosshair, which is where the player is looking while placing blocks. This uses
 * a plain `Message` anchored bottom-right, so the hint sits out of the way and can
 * be read with peripheral vision.
 *
 * The prompt is only visible when submitting would actually do something — i.e.
 * in build mode with at least one block placed. Outside build mode, or with an
 * empty world, there is nothing to submit and the hint is noise (it used to stay
 * on screen permanently and cover the view).
 */
export class SubmitPrompt {
  private readonly message: ENGINE.Message;
  private enabled = false;

  private constructor(message: ENGINE.Message) {
    this.message = message;
  }

  /** Creates and initializes the prompt. */
  public static async create(ui: ENGINE.UIManager): Promise<SubmitPrompt> {
      const message = new ENGINE.Message(ui, { position: 'bottom-right' });
      await message.initialize();

      return new SubmitPrompt(message);
    }

    /** The underlying component, for positioning. */
    public get component(): ENGINE.Message {
      return this.message;
    }

    /** True when the prompt currently reads as enabled. */
    public get isEnabled(): boolean {
      return this.enabled;
    }

    /** Refreshes the hint text from the current key bindings. */
    public refreshText(): void {
      this.message.setMessage({ body: submitHintText() });
    }

    /** Shows or hides the prompt according to the current build state. */
    public update(isBuilding: boolean, placedBlockCount: number): void {
      this.enabled = submitEnabled(isBuilding, placedBlockCount);

      if (!this.enabled) {
        this.message.hide();
        return;
      }

      this.refreshText();
      this.message.show();
    }
  }