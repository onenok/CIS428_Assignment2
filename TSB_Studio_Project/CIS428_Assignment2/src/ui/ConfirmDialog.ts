/**
 * The submit confirmation dialog.
 *
 * Ctrl+Enter used to submit on the spot, which meant a stray keypress during a
 * build could end the run. The dialog puts one Enter between the player and the
 * ending, and Esc takes them back to building with the world untouched.
 *
 * Why plain DOM instead of `Message` + `Keystroke`: the approved prototype needs
 * a centred panel, a full-width divider, a horizontal chip row and a footer line
 * stacked vertically. `Message` is a flex *row* with no way to change direction
 * (`flex-direction` is not on the `customStyles` allowlist, nor is `position`),
 * so reproducing that layout with engine components would mean fighting the
 * template. A single absolutely-positioned div — the same technique
 * `BlackOverlay` already uses — is both shorter and exactly the layout.
 *
 * The colours and metrics are copied from the engine's Game UI Kit (chips are
 * `#2d3250` with a 15% white edge, radius 6px, 11px mono uppercase) so the panel
 * still reads as part of the same interface.
 */

/** Panel headline. */
export const CONFIRM_DIALOG_TITLE = 'Submit this design?';

/** Small grey reassurance under the buttons. */
export const CONFIRM_DIALOG_FOOTER = 'Your blocks stay as they are if you cancel';

/** Key cap shown for the accept action. `Enter` advances the dialogue too. */
export const CONFIRM_ACCEPT_KEY = 'Enter';

/** Key cap shown for the cancel action. */
export const CONFIRM_CANCEL_KEY = 'Esc';

/** Label beside the accept chip. */
export const CONFIRM_ACCEPT_LABEL = 'Submit';

/** Label beside the cancel chip. */
export const CONFIRM_CANCEL_LABEL = 'Cancel';

/** Ids, so a re-created dialog can adopt the elements already in the document. */
export const CONFIRM_DIM_ELEMENT_ID = 'cis428-confirm-dim';
export const CONFIRM_PANEL_ELEMENT_ID = 'cis428-confirm-panel';

/**
 * The dim layer.
 *
 * `#ui-container` sits at `z-index: 1000`, so 1004 covers the whole HUD while
 * staying under `BlackOverlay`'s 9999 fade. Pointer events stay off: the buttons
 * are keyboard-only, and the input lock — not the DOM — is what stops the
 * player from building while the dialog is up.
 */
export const CONFIRM_DIM_STYLES: Readonly<Record<string, string>> = {
  position: 'fixed',
  inset: '0',
  'background-color': 'rgba(5, 7, 12, 0.55)',
  'pointer-events': 'none',
  'z-index': '1004',
};

/**
 * Panel placement, in `position: fixed` space.
 *
 * `translate(-50%, -50%)` centres it without knowing the panel's size, which
 * matters because the height follows the font rather than a fixed number.
 */
export const CONFIRM_PANEL_PLACEMENT: Readonly<Record<string, string>> = {
  position: 'fixed',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  'z-index': '1005',
};

/** Panel box: 480px wide, dark card, hairline edge, soft shadow. */
export const CONFIRM_PANEL_STYLES: Readonly<Record<string, string>> = {
  width: '480px',
  'box-sizing': 'border-box',
  padding: '26px 32px 22px',
  'border-radius': '12px',
  background: 'rgba(20, 24, 33, 0.97)',
  border: '1px solid rgba(255, 255, 255, 0.10)',
  'box-shadow': '0 18px 48px rgba(0, 0, 0, 0.55)',
  color: '#e8eaed',
  'font-family': 'system-ui, -apple-system, "Segoe UI", sans-serif',
  'text-align': 'center',
  'pointer-events': 'none',
};

/** Secondary styles for the parts of the panel, so tests can assert them. */
export const CONFIRM_TITLE_STYLES: Readonly<Record<string, string>> = {
  'font-size': '18px',
  'font-weight': '600',
  'letter-spacing': '0.2px',
};

export const CONFIRM_DIVIDER_STYLES: Readonly<Record<string, string>> = {
  height: '1px',
  margin: '18px 0',
  background: 'rgba(255, 255, 255, 0.09)',
};

export const CONFIRM_ROW_STYLES: Readonly<Record<string, string>> = {
  display: 'flex',
  'align-items': 'center',
  'justify-content': 'center',
  'font-size': '15px',
};

export const CONFIRM_CHIP_STYLES: Readonly<Record<string, string>> = {
  display: 'inline-flex',
  'align-items': 'center',
  'justify-content': 'center',
  'min-width': '48px',
  height: '30px',
  padding: '0 10px',
  'box-sizing': 'border-box',
  'border-radius': '6px',
  background: '#2d3250',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  'font-family': 'ui-monospace, "JetBrains Mono", Consolas, monospace',
  'font-size': '11px',
  'font-weight': '600',
  'letter-spacing': '0.5px',
  'text-transform': 'uppercase',
  color: '#e8eaed',
};

export const CONFIRM_FOOTER_STYLES: Readonly<Record<string, string>> = {
  'margin-top': '20px',
  'font-size': '12px',
  color: '#6f7885',
};

/** Everything the panel needs to paint itself, in one tree description. */
export interface ConfirmDialogParts {
  readonly dim: HTMLElement;
  readonly panel: HTMLElement;
}

/**
 * The dialog.
 *
 * Headless runs (unit tests, a dedicated server) have no `document`, so the
 * instance still exists and still tracks its own visibility; only the DOM work
 * is skipped.
 */
export class ConfirmDialog {
  private readonly dim: HTMLElement | null;
  private readonly panel: HTMLElement | null;
  private visible = false;

  private constructor(dim: HTMLElement | null, panel: HTMLElement | null) {
    this.dim = dim;
    this.panel = panel;
    this.applyVisibility();
  }

  /** Builds the dialog and attaches it to `document.body`. It starts hidden. */
  public static create(doc?: Document): ConfirmDialog {
    const target = doc ?? (typeof document === 'undefined' ? null : document);
    const body = target?.body;
    if (!target || !body) {
      return new ConfirmDialog(null, null);
    }

    const dim = target.getElementById(CONFIRM_DIM_ELEMENT_ID) ?? target.createElement('div');
    dim.id = CONFIRM_DIM_ELEMENT_ID;
    applyStyles(dim, CONFIRM_DIM_STYLES);
    if (!dim.isConnected) {
      body.appendChild(dim);
    }

    const panel = target.getElementById(CONFIRM_PANEL_ELEMENT_ID) ?? target.createElement('div');
    panel.id = CONFIRM_PANEL_ELEMENT_ID;
    applyStyles(panel, CONFIRM_PANEL_PLACEMENT);
    applyStyles(panel, CONFIRM_PANEL_STYLES);
    if (!panel.isConnected) {
      body.appendChild(panel);
    }

    // Rebuilding the contents is cheaper than diffing them: the dialog is
    // created once per scene and its markup never changes.
    panel.replaceChildren(
      textElement(target, 'div', CONFIRM_TITLE_STYLES, CONFIRM_DIALOG_TITLE),
      textElement(target, 'div', CONFIRM_DIVIDER_STYLES, ''),
      buildRow(target),
      textElement(target, 'div', CONFIRM_FOOTER_STYLES, CONFIRM_DIALOG_FOOTER),
    );

    return new ConfirmDialog(dim, panel);
  }

  /** True while the dialog is on screen. */
  public get isVisible(): boolean {
    return this.visible;
  }

  /** Reveals the dialog. */
  public show(): void {
    this.visible = true;
    this.applyVisibility();
  }

  /** Hides the dialog, leaving the world untouched. */
  public hide(): void {
    this.visible = false;
    this.applyVisibility();
  }

  /** Removes both elements from the document. */
  public destroy(): void {
    this.dim?.remove();
    this.panel?.remove();
    this.visible = false;
  }

  private applyVisibility(): void {
    const display = this.visible ? '' : 'none';
    if (this.dim) this.dim.style.display = display;
    if (this.panel) this.panel.style.display = display;
  }
}

/** The chip-and-label row: `ENTER Submit` then `ESC Cancel`. */
function buildRow(doc: Document): HTMLElement {
  const row = doc.createElement('div');
  applyStyles(row, CONFIRM_ROW_STYLES);

  const acceptChip = doc.createElement('span');
  applyStyles(acceptChip, CONFIRM_CHIP_STYLES);
  acceptChip.textContent = CONFIRM_ACCEPT_KEY;

  const acceptLabel = doc.createElement('span');
  acceptLabel.textContent = CONFIRM_ACCEPT_LABEL;
  acceptLabel.style.marginLeft = '8px';
  acceptLabel.style.marginRight = '22px';

  const cancelChip = doc.createElement('span');
  applyStyles(cancelChip, CONFIRM_CHIP_STYLES);
  cancelChip.textContent = CONFIRM_CANCEL_KEY;

  const cancelLabel = doc.createElement('span');
  cancelLabel.textContent = CONFIRM_CANCEL_LABEL;
  cancelLabel.style.marginLeft = '8px';
  // The cancel half reads as the quiet option, matching the prototype.
  cancelLabel.style.color = '#a8b0bd';

  row.append(acceptChip, acceptLabel, cancelChip, cancelLabel);
  return row;
}

function textElement(
  doc: Document,
  tag: 'div',
  styles: Readonly<Record<string, string>>,
  text: string,
): HTMLElement {
  const element = doc.createElement(tag);
  applyStyles(element, styles);
  element.textContent = text;
  return element;
}

function applyStyles(element: HTMLElement, styles: Readonly<Record<string, string>>): void {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value);
  }
}