/**
 * Minecraft-style inverting crosshair.
 *
 * The engine `Crosshair` component draws six fixed reticles (scope, x, bracket,
 * circle, sniper, dot) with a coloured stroke. None of them invert, and the
 * design calls for the Minecraft look: a pure white cross blended with
 * `difference`, so it reads as white on dark backgrounds and black on light ones.
 *
 * Rather than reimplementing the whole component, this subclass keeps the
 * engine's template, layout and lifecycle and only replaces the SVG that
 * `onInitialize()` injects. That is a small override, not a rewrite.
 *
 * The blend mode itself lives in CSS (`mix-blend-mode: difference`) because it
 * is a compositing property, not something the SVG can express.
 */

import * as ENGINE from '@gnsx/genesys.js';

/** Pure white: `difference` against white yields black, against black yields white. */
export const CROSSHAIR_INVERT_COLOR = '#ffffff';

/** Reticle size in pixels. Minecraft's is small; 20px reads well at 1080p. */
export const CROSSHAIR_INVERT_SIZE = 20;

/** Arm length as a fraction of the viewBox, leaving a gap in the middle. */
const ARM_INNER = 38;
const ARM_OUTER = 50;

/**
 * The cross itself, drawn in a 100x100 viewBox so it scales with
 * `--ui-crosshair-size`. Two rectangles are enough: a vertical bar and a
 * horizontal bar, both with a transparent centre gap.
 */
const INVERT_CROSS_SVG = [
  '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="none">',
  `  <rect x="46" y="${ARM_INNER}" width="8" height="${ARM_OUTER - ARM_INNER}" />`,
  `  <rect x="46" y="${100 - ARM_OUTER}" width="8" height="${ARM_OUTER - ARM_INNER}" />`,
  `  <rect x="${ARM_INNER}" y="46" width="${ARM_OUTER - ARM_INNER}" height="8" />`,
  `  <rect x="${100 - ARM_OUTER}" y="46" width="${ARM_OUTER - ARM_INNER}" height="8" />`,
  '</svg>',
].join('');

/** CSS class that switches the reticle to difference blending. */
export const CROSSHAIR_INVERT_CLASS = 'crosshair-invert';

/**
 * Inline style applied to the reticle root.
 *
 * `mix-blend-mode: difference` is the whole trick: the browser subtracts the
 * backdrop from white, so the cross is always the inverse of whatever is behind
 * it. `pointer-events: none` keeps it from swallowing clicks.
 */
export const CROSSHAIR_INVERT_STYLE: Readonly<Record<string, string>> = {
  'mix-blend-mode': 'difference',
  'pointer-events': 'none',
};

export class CrosshairReticle extends ENGINE.Crosshair {
  protected override async onInitialize(): Promise<void> {
    await super.onInitialize();

    const root = this.getReticleRoot();
    if (!root) {
      return;
    }

    root.classList.add(CROSSHAIR_INVERT_CLASS);
    for (const [property, value] of Object.entries(CROSSHAIR_INVERT_STYLE)) {
      root.style.setProperty(property, value);
    }

    const shape = root.querySelector<HTMLElement>('[data-crosshair-shape]');
    if (shape) {
      shape.innerHTML = INVERT_CROSS_SVG;
    }
  }

  /**
   * The `.ui-crosshair` element.
   *
   * `Crosshair` keeps this in a private field, so it is looked up again from the
   * layout rather than reaching into the parent's internals.
   */
  private getReticleRoot(): HTMLElement | null {
    const layout = this.getElement()?.element as HTMLElement | undefined;
    return layout?.querySelector<HTMLElement>('.ui-crosshair') ?? null;
  }
}

/** Options for the inverting reticle. */
export function crosshairReticleOptions(): ENGINE.CrosshairOptions {
  return {
    size: CROSSHAIR_INVERT_SIZE,
    color: CROSSHAIR_INVERT_COLOR,
    accentColor: CROSSHAIR_INVERT_COLOR,
    style: 'x',
  };
}