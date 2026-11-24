/**
 * A one-line hint that disappears on its own.
 *
 * Used for feedback that answers "why did nothing happen?" — the case that
 * matters here is the player clicking bedrock and getting no reaction at all.
 * A permanent banner would be noise, so the message lives for a couple of
 * seconds and then hides itself.
 *
 * Positioning follows `DialogueBox`: `BaseUIComponent.position` only adds a CSS
 * class the engine ships no rule for, so the placement is written as inline
 * styles through `setPosition()`, which bypasses the `customStyles` allowlist
 * (that list blocks `position`, `top`, `left` and `transform`).
 */

import * as ENGINE from '@gnsx/genesys.js';

/** Inline placement: above the hotbar, centred, out of the crosshair. */
export const TOAST_PLACEMENT: Readonly<Record<string, string>> = {
  position: 'absolute',
  left: '50%',
  bottom: '170px',
  transform: 'translateX(-50%)',
  'z-index': '1003',
  'pointer-events': 'none',
};

/** Only allowlisted `customStyles` properties are used here. */
export const TOAST_STYLES: Readonly<Record<string, string>> = {
  'max-width': 'min(560px, 70vw)',
  padding: '8px 16px',
  'border-radius': '8px',
  background: 'rgba(12, 14, 20, 0.78)',
  'font-size': '15px',
  'text-align': 'center',
};

/** How long a hint stays on screen. */
export const TOAST_VISIBLE_SECONDS = 1.8;

/** The hint shown when the player tries to remove or bury bedrock. */
export const PROTECTED_BLOCK_HINT = 'Bedrock cannot be broken or built over';

export class ToastHint {
  private readonly message: ENGINE.Message;
  private remaining = 0;

  private constructor(message: ENGINE.Message) {
    this.message = message;
  }

  /** Creates and initializes the hint. It starts hidden. */
  public static async create(ui: ENGINE.UIManager): Promise<ToastHint> {
    const message = new ENGINE.Message(ui, {
      position: 'bottom-center',
      visible: false,
      customStyles: { ...TOAST_STYLES },
    });
    await message.initialize();
    message.setPosition({ ...TOAST_PLACEMENT });
    return new ToastHint(message);
  }

  /** The underlying component, for lifecycle calls. */
  public get component(): ENGINE.Message {
    return this.message;
  }

  /** True while the hint is on screen. */
  public get isVisible(): boolean {
    return this.remaining > 0;
  }

  /** Shows `text` and restarts the countdown. */
  public show(text: string, seconds: number = TOAST_VISIBLE_SECONDS): void {
    this.message.setMessage({ body: text });
    this.message.show();
    this.remaining = Math.max(0, seconds);
  }

  /** Advances the countdown. Call once per frame with the frame delta. */
  public tick(deltaTime: number): void {
    if (this.remaining <= 0) {
      return;
    }
    // A zero or negative delta (paused world, first frame) must not eat the
    // countdown, and a NaN would leave the hint stuck on screen forever.
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    this.remaining -= deltaTime;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.message.hide();
    }
  }

  /** Hides the hint immediately. */
  public hide(): void {
    this.remaining = 0;
    this.message.hide();
  }
}