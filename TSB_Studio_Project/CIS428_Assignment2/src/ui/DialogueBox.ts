/**
 * The dialogue box.
 *
 * A bottom-centre panel that shows one line at a time: the speaker's name above
 * the text, and a key hint in the bottom-right corner telling the player how to
 * continue. It is deliberately *not* `CenterMessage` — that component is a
 * full-screen hero banner, so using it for dialogue would cover the world the
 * player is meant to be looking at.
 *
 * The box owns no timing. `DialogueRunner` decides what the visible text is and
 * when the line is done; this class only paints it.
 *
 * Positioning note: the `position` option on `BaseUIComponent` only adds a CSS
 * class (`bottom-center`), and the engine ships no rule for it — `Message` has
 * no positioning of its own, so it would render at the top-left of the UI
 * container. The engine's own components hard-code `position: absolute` in
 * their stylesheet instead. We cannot ship a stylesheet for a component we do
 * not own, so the placement is written as inline styles via `setPosition()`,
 * which bypasses the `customStyles` allowlist (that list blocks `position`,
 * `top`, `left`, and `transform`).
 */

import * as ENGINE from '@gnsx/genesys.js';

/** Where the box sits on screen. */
export const DIALOGUE_BOX_POSITION = 'bottom-center' as const;

/** Extra classes applied to the underlying `Message` element. */
export const DIALOGUE_BOX_CLASSES = ['cis428-dialogue-box'] as const;

/**
 * Inline placement for the box.
 *
 * `left: 50%` + `translateX(-50%)` centres it horizontally without needing to
 * know its width, and `bottom` lifts it clear of the hotbar.
 */
export const DIALOGUE_BOX_PLACEMENT: Readonly<Record<string, string>> = {
  position: 'absolute',
  left: '50%',
  bottom: '96px',
  transform: 'translateX(-50%)',
  'z-index': '1002',
  'pointer-events': 'none',
};

/**
 * Styles that turn the compact message row into a readable dialogue panel.
 *
 * Only properties on the engine's `customStyles` allowlist are used —
 * `backdrop-filter` and `pointer-events` are blocked there, so the panel relies
 * on an opaque background instead of a blur.
 */
export const DIALOGUE_BOX_STYLES: Readonly<Record<string, string>> = {
  'max-width': 'min(760px, 80vw)',
  padding: '14px 22px',
  'border-radius': '10px',
  background: 'rgba(12, 14, 20, 0.82)',
  'font-size': '18px',
  'line-height': '1.45',
  'text-align': 'center',
};

/**
 * Placement for the "continue" key hint.
 *
 * Absolute inside the panel, pinned to the bottom-right corner. `Message` is a
 * flex row, so the hint is taken out of flow rather than being a flex item.
 */
export const DIALOGUE_HINT_PLACEMENT: Readonly<Record<string, string>> = {
  position: 'absolute',
  right: '10px',
  bottom: '6px',
};

/** The key label shown in the hint chip. */
export const DIALOGUE_CONTINUE_KEY = 'LMB';

/** The dialogue panel. */
export class DialogueBox {
  private readonly message: ENGINE.Message;
  private readonly hint: ENGINE.Keystroke;

  private constructor(message: ENGINE.Message, hint: ENGINE.Keystroke) {
    this.message = message;
    this.hint = hint;
  }

  /** Creates and initializes the box. It starts hidden. */
  public static async create(ui: ENGINE.UIManager): Promise<DialogueBox> {
    const message = new ENGINE.Message(ui, {
      position: DIALOGUE_BOX_POSITION,
      visible: false,
      customClasses: [...DIALOGUE_BOX_CLASSES],
      customStyles: { ...DIALOGUE_BOX_STYLES },
    });
    await message.initialize();
    message.setPosition({ ...DIALOGUE_BOX_PLACEMENT });

    const hint = new ENGINE.Keystroke(ui, {
      position: 'none',
      visible: true,
      key: DIALOGUE_CONTINUE_KEY,
      size: 'small',
    });
    await hint.initialize();
    hint.setPosition({ ...DIALOGUE_HINT_PLACEMENT });

    // `Keystroke` is a plain inline chip with no positioning of its own, so it
    // can be moved straight into the panel's template root.
    const panel = message.getElement()?.querySelector('.ui-message');
    const chip = hint.getElement()?.querySelector('.ui-keystroke');
    if (panel && chip) {
      panel.appendChild(chip);
    }

    return new DialogueBox(message, hint);
  }

  /** The underlying component, for lifecycle calls. */
  public get component(): ENGINE.Message {
    return this.message;
  }

  /** The key hint chip, for lifecycle calls. */
  public get hintComponent(): ENGINE.Keystroke {
    return this.hint;
  }

  /** Paints one line and reveals the box. */
  public showLine(speaker: string, text: string): void {
    this.message.setMessage({ name: speaker, body: text });
    this.message.show();
  }

  /** Hides the box without clearing the last line. */
  public hide(): void {
    this.message.hide();
  }
}