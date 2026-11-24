/**
 * The F3 debug overlay.
 *
 * A plain `UIElement` rather than a `BaseUIComponent`: the overlay needs
 * `position: fixed` and a per-frame text update, and `BaseUIComponent`'s
 * `customStyles` allowlist blocks `position`/`top`/`left`.
 *
 * `UIManager.createElement()` forces `pointer-events: auto` on every element it
 * creates, so the overlay re-applies `none` afterwards — otherwise the panel
 * would swallow clicks meant for the game.
 */

import * as ENGINE from '@gnsx/genesys.js';

import { formatDebugSnapshot } from './debugFormat.js';

import type { DebugSnapshot } from './DebugSnapshot.js';

/** Element id, also used as the `UIManager` registry key. */
export const DEBUG_OVERLAY_ID = 'cis428-debug-overlay';

/**
 * Overlay styling.
 *
 * Anchored top-right so it does not collide with the engine's stats.js panel,
 * which sits at `top: 10px; left: 10px`.
 */
export const DEBUG_OVERLAY_STYLES: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  top: '8px',
  right: '8px',
  padding: '8px 12px',
  background: 'rgba(0, 0, 0, 0.72)',
  color: '#e8e8e8',
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: '12px',
  lineHeight: '1.45',
  whiteSpace: 'pre',
  pointerEvents: 'none',
  zIndex: '9999',
  borderRadius: '4px',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  textAlign: 'left',
};

/**
 * True when the overlay should exist at all.
 *
 * Engine 19 made `shouldCreateGameLoopDebugUI()` internal, so this rebuilds the
 * same rule from the two public predicates it was derived from: always in an
 * unpublished build (editor Play), otherwise only with `?genesysDebug=1`.
 */
export function shouldCreateDebugOverlay(): boolean {
  return !ENGINE.isPublishedGame() || ENGINE.isGenesysDebugEnabled();
}

/** The F3 panel. */
export class DebugOverlay {
  private visible = false;

  private constructor(private readonly element: ENGINE.UIElement) {}

  /** Creates the element and hides it. */
  public static create(ui: ENGINE.UIManager): DebugOverlay {
    const element = ui.createElement(DEBUG_OVERLAY_ID, {
      style: DEBUG_OVERLAY_STYLES,
      textContent: '',
    });

    // createElement() forces pointerEvents to 'auto'; the overlay must not
    // intercept clicks, so put it back.
    element.setStyle('pointerEvents', 'none');
    element.hide();

    return new DebugOverlay(element);
  }

  public get isVisible(): boolean {
    return this.visible;
  }

  /** The effective `pointer-events` value, for tests and sanity checks. */
  public get pointerEvents(): string {
    return this.element.element.style.pointerEvents;
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      this.element.show();
    } else {
      this.element.hide();
    }
  }

  /** Flips visibility and returns the new state. */
  public toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  /** Rewrites the panel text. No-op while hidden, to keep the DOM quiet. */
  public update(snapshot: DebugSnapshot): void {
    if (!this.visible) {
      return;
    }
    this.element.setText(formatDebugSnapshot(snapshot).join('\n'));
  }

  public destroy(): void {
    this.element.remove();
  }
}