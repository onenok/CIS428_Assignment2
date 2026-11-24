/**
 * Full-screen black overlay used by the intro and the ending.
 *
 * The engine has no plain "solid colour rectangle" component, and building one
 * out of `CenterMessage` would drag in a title and a fade animation that fight
 * the timeline. A single absolutely-positioned div is both simpler and exactly
 * what the transition needs: one element whose opacity the timeline drives.
 *
 * The element is created lazily and mounted into the engine's UI layer, so it shares
 * that layer's stacking context — see {@link OVERLAY_STYLES} for why mounting it on
 * `document.body` put it on the wrong side of the end card.
 */

/** Element id, so a second overlay can find and reuse the first. */
export const OVERLAY_ELEMENT_ID = 'cis428-black-overlay';

/**
 * Id of the engine's UI layer. `UIManager` creates it and gives it
 * `position: absolute; z-index: 1000`, which makes it a stacking context — so a
 * `z-index` inside it is only comparable with its own children, never with an
 * element mounted on `document.body`.
 */
export const UI_CONTAINER_ID = 'ui-container';

/**
 * Inline styles that make the div cover the viewport.
 *
 * The overlay is mounted *inside* the engine's UI layer, not on `document.body`.
 * `UIManager`'s layer is `position: absolute; z-index: 1000`, and a child can never
 * paint above its own stacking context no matter what z-index it is given: with the
 * overlay on `body`, `CenterMessage`'s `z-index: 9999` was trapped at level 1000 and
 * the end card was drawn underneath a fully opaque black div.
 *
 * Inside the layer the numbers do compare: the gameplay HUD tops out at 2000, and
 * `CenterMessage` is 9999, so 5000 blacks out the world and the HUD while leaving the
 * end card on top.
 */
const OVERLAY_STYLES: Readonly<Record<string, string>> = {
  position: 'absolute',
  inset: '0',
  'background-color': '#000000',
  'pointer-events': 'none',
  'z-index': '5000',
  opacity: '1',
  transition: 'none',
};

export class BlackOverlay {
  private element: HTMLElement | null = null;
  private opacity = 1;

  /** Creates the overlay element if it does not exist yet. */
    public mount(doc?: Document): void {
    if (this.element) {
      return;
    }

      // Headless runs (tests, dedicated server) have no document to attach to.
      // The overlay then stays a no-op: `setOpacity` only records the value.
      const target = doc ?? (typeof document === 'undefined' ? null : document);
      if (!target?.body) {
        return;
      }

      const existing = target.getElementById(OVERLAY_ELEMENT_ID);
      if (existing) {
        this.element = existing;
        return;
      }

      const element = target.createElement('div');
      element.id = OVERLAY_ELEMENT_ID;
      for (const [property, value] of Object.entries(OVERLAY_STYLES)) {
        element.style.setProperty(property, value);
      }
      // Inside the engine's UI layer when it exists, so the end card can paint above
      // it; `body` is only the fallback for a document without that layer.
      const host = target.getElementById(UI_CONTAINER_ID) ?? target.body;
      host.appendChild(element);
      this.element = element;
    }

  /** Current opacity in `[0, 1]`. */
  public get currentOpacity(): number {
    return this.opacity;
  }

  /** Sets the opacity, clamped to `[0, 1]`. */
  public setOpacity(value: number): void {
    this.opacity = Math.max(0, Math.min(1, value));
    this.element?.style.setProperty('opacity', String(this.opacity));
  }

  /** Fades to fully opaque. */
  public show(): void {
    this.setOpacity(1);
  }

  /** Fades to fully transparent. */
  public hide(): void {
    this.setOpacity(0);
  }

  /** Removes the element from the document. */
  public destroy(): void {
    this.element?.remove();
    this.element = null;
  }
}