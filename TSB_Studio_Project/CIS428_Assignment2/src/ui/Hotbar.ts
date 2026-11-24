/**
 * Minecraft-style hotbar.
 *
 * `InventoryBar` already renders the slot strip, handles the filled/empty
 * classes and exposes `setItems()`, so this module only adds the two things the
 * engine component does not have:
 *
 *   - a `selected` class on the active slot (Minecraft highlights the held slot)
 *   - a block-id -> slot mapping so gameplay code can ask "which block is held?"
 *
 * The visual skin (bevelled slots, item counts) is deliberately left to CSS; the
 * design decision was "build the bar first, style it later".
 */

import * as ENGINE from '@gnsx/genesys.js';
import { BLOCK_NAMES, PLACEABLE_BLOCKS } from '../voxel/blockIds.js';
import { blockIconSvg } from './blockIcon.js';

/** One hotbar slot. `blockId` is 0 for an empty slot. */
export interface HotbarItem extends ENGINE.InventoryItem {
  readonly id: string;
  readonly blockId: number;
  readonly label: string;
}

/** Number of slots in the hotbar. Matches the nine placeable blocks. */
export const HOTBAR_SLOT_COUNT = 9;

/** CSS class applied to the currently held slot. */
export const HOTBAR_SELECTED_CLASS = 'selected';

/** CSS class of the isometric icon wrapper. */
export const HOTBAR_ICON_CLASS = 'hotbar-slot-icon';

/** CSS class of the block name under the icon. */
export const HOTBAR_LABEL_CLASS = 'hotbar-slot-label';

/**
 * Layout of a slot's contents: icon on top, label underneath.
 *
 * Inline styles rather than a stylesheet: the project ships no CSS file, and the
 * engine's `customStyles` allowlist does not include `flex`/`overflow`. Writing
 * straight to `element.style` is the same escape hatch `ConfirmDialog` uses.
 *
 * The label is one line with an ellipsis because "Cobblestone" at 9px is wider
 * than the 60px slot; wrapping it would push the icon up and out of the slot.
 */
export const HOTBAR_CONTENT_STYLES: Readonly<Record<string, string>> = {
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'center',
  'justify-content': 'center',
  gap: '1px',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  'pointer-events': 'none',
};

export const HOTBAR_ICON_STYLES: Readonly<Record<string, string>> = {
  display: 'block',
  width: '32px',
  height: '32px',
  'flex-shrink': '0',
};

export const HOTBAR_LABEL_STYLES: Readonly<Record<string, string>> = {
  display: 'block',
  'max-width': '52px',
  overflow: 'hidden',
  'text-overflow': 'ellipsis',
  'white-space': 'nowrap',
  'font-size': '9px',
  'line-height': '11px',
  'text-align': 'center',
  color: '#e8eaed',
};

/** Slot selector matching the engine's `InventoryBar` template. */
export const HOTBAR_SLOT_SELECTOR = '.ui-inventory-bar-slot[data-slot]';

/** The scroll container inside the engine's `InventoryBar` template. */
export const HOTBAR_SLOTS_SELECTOR = '[data-inventory-bar-slots]';

/** The template root that `inventory-bar.css` positions. */
export const HOTBAR_ROOT_SELECTOR = '.ui-inventory-bar';

/** Where the bar sits: bottom centre. */
export const HOTBAR_POSITION = 'bottom-center';

/**
 * The `bottom-center` anchor styles, applied by hand.
 *
 * Equivalent to `POSITION_ANCHOR_STYLES['bottom-center']` in the engine, which
 * this component can never receive. `BaseUIComponent.applyPositioning()` skips
 * the anchor when `placesItself()` is true, and `placesItself()` asks whether the
 * element is already positioned with a non-`auto` offset. `inventory-bar.css`
 * sets `position: absolute` on the bar, and Chrome reports *used px values* for
 * `top`/`left` on a positioned element whose offsets are unset — so the check
 * sees offsets that were never specified and concludes the bar places itself.
 * The bar then stays at its static position, top-left, on top of the preset
 * panel. `Card` and `Message` are unaffected only because their stylesheets leave
 * `position` unset.
 */
export const HOTBAR_ANCHOR_STYLES: Readonly<Record<string, string>> = {
  position: 'absolute',
  bottom: '24px',
  left: '0',
  right: '0',
  'margin-left': 'auto',
  'margin-right': 'auto',
  width: 'fit-content',
  'z-index': '1000',
};

/**
 * Lays the slots out as a row.
 *
 * `inventory-bar.css` styles the slots but never the `<div
 * data-inventory-bar-slots>` wrapper, so it stays `display: block` and the nine
 * slots stack vertically into a column down the side of the screen.
 */
export const HOTBAR_SLOT_ROW_STYLES: Readonly<Record<string, string>> = {
  display: 'flex',
  'align-items': 'center',
  gap: '4px',
};

/**
 * Marker drawn on the held slot.
 *
 * Only `outline` and `filter` are touched, never `background`: the slot's own
 * background comes from the engine theme and shadowing it would flatten the
 * strip. `outline-offset` is negative so the ring sits inside the 56px slot
 * instead of overlapping its neighbours.
 */
export const HOTBAR_SELECTED_STYLES: Readonly<Record<string, string>> = {
  outline: '2px solid #ffd766',
  'outline-offset': '-2px',
  filter: 'brightness(1.18)',
};

export const HOTBAR_UNSELECTED_STYLES: Readonly<Record<string, string>> = {
  outline: 'none',
  'outline-offset': '0',
  filter: 'none',
};

/** Applies a style map to an element, tolerating a missing element or `style`. */
function applyStyles(
  element: HTMLElement | null | undefined,
  styles: Readonly<Record<string, string>>,
): void {
  if (!element) {
    return;
  }
  for (const [property, value] of Object.entries(styles)) {
    element.style?.setProperty(property, value);
  }
}

/** Builds the default hotbar contents: one slot per placeable block. */
export function defaultHotbarItems(): HotbarItem[] {
  return PLACEABLE_BLOCKS.map((blockId, index) => ({
    id: `slot-${index}`,
    blockId,
    label: BLOCK_NAMES[blockId] ?? `Block ${blockId}`,
  }));
}

/** The engine's per-slot content container. */
const ITEM_CONTENT_SELECTOR = '.item-content';

/**
 * Finds the element the icon and label belong in.
 *
 * `InventoryBar` hands the renderer the whole slot, not its `.item-content`
 * child, and the engine reuses `.item-content` for its own hover/empty state —
 * so our children go inside it and fall back to the slot only if the engine
 * changes its template.
 */
function contentElementFor(slotElement: HTMLElement): HTMLElement {
  return (slotElement.querySelector?.(ITEM_CONTENT_SELECTOR) as HTMLElement | null) ?? slotElement;
}

/**
 * Renders one slot's contents.
 *
 * Kept as a plain function so it can be passed straight to `InventoryBar`'s
 * `itemRenderer` option and unit-tested without a DOM.
 */
export function renderHotbarSlot(item: HotbarItem, slotElement: HTMLElement): void {
  slotElement.dataset.blockId = String(item.blockId);
  slotElement.title = item.label;

  const content = contentElementFor(slotElement);
  // Re-rendering the same slot must replace the icon, not stack a second one.
  content.textContent = '';
  applyStyles(content, HOTBAR_CONTENT_STYLES);

  const icon = slotElement.ownerDocument.createElement('span');
  icon.className = HOTBAR_ICON_CLASS;
  applyStyles(icon, HOTBAR_ICON_STYLES);
  icon.innerHTML = blockIconSvg(item.blockId);

  const label = slotElement.ownerDocument.createElement('span');
  label.className = HOTBAR_LABEL_CLASS;
  applyStyles(label, HOTBAR_LABEL_STYLES);
  label.textContent = item.label;

  content.appendChild(icon);
  content.appendChild(label);
}

/**
 * Clears a slot back to its empty state.
 *
 * Only the content container is touched: clearing the slot wholesale would
 * delete the engine's own cooldown and hotkey children, which is why empty slots
 * used to lose their number badge.
 */
export function clearHotbarSlot(slotElement: HTMLElement): void {
  delete slotElement.dataset.blockId;
  slotElement.removeAttribute('title');

  const content = contentElementFor(slotElement);
  content.textContent = '';
  if (content !== slotElement) {
    content.style?.setProperty('display', 'none');
  }
}

/**
 * Wraps the engine `InventoryBar` with selection tracking.
 *
 * Selection is stored here rather than in the DOM so it survives a re-render of
 * the slot strip.
 */
export class Hotbar {
  private readonly bar: ENGINE.InventoryBar<HotbarItem>;
  private items: HotbarItem[];
  private selectedIndex = 0;

  private constructor(bar: ENGINE.InventoryBar<HotbarItem>, items: HotbarItem[]) {
    this.bar = bar;
    this.items = items;
  }

  /** Creates and initializes the hotbar. */
  public static async create(
    ui: ENGINE.UIManager,
    items: HotbarItem[] = defaultHotbarItems(),
  ): Promise<Hotbar> {
    const bar = new ENGINE.InventoryBar<HotbarItem>(ui, {
      slotCount: HOTBAR_SLOT_COUNT,
      slotSize: 56,
      slotGap: 4,
          position: HOTBAR_POSITION,
      itemRenderer: renderHotbarSlot,
      slotClearer: clearHotbarSlot,
    });

    await bar.initialize();

        // Both sets of styles are written straight to the elements. The engine cannot
        // do it: see HOTBAR_ANCHOR_STYLES for why the anchor is always skipped, and
        // `inventory-bar.css` has no rule for the slot wrapper at all.
        const root = bar.getElement()?.element as HTMLElement | undefined;
        applyStyles(root?.querySelector<HTMLElement>(HOTBAR_ROOT_SELECTOR) ?? root, HOTBAR_ANCHOR_STYLES);
        applyStyles(root?.querySelector<HTMLElement>(HOTBAR_SLOTS_SELECTOR), HOTBAR_SLOT_ROW_STYLES);

    bar.setItems(items);

    const hotbar = new Hotbar(bar, items);
    hotbar.applySelection();
    return hotbar;
  }

  /** The underlying engine component, for positioning and visibility. */
  public get component(): ENGINE.InventoryBar<HotbarItem> {
    return this.bar;
  }

  /** Every slot, in order. */
  public getItems(): readonly HotbarItem[] {
    return this.items;
  }

  /** Index of the held slot. */
  public getSelectedIndex(): number {
    return this.selectedIndex;
  }

  /** Block id in the held slot, or 0 when the slot is empty. */
  public getSelectedBlockId(): number {
    return this.items[this.selectedIndex]?.blockId ?? 0;
  }

  /** Selects a slot by index, wrapping around at both ends. */
  public select(index: number): void {
    if (this.items.length === 0) {
      return;
    }
    const count = this.items.length;
    this.selectedIndex = ((index % count) + count) % count;
    this.applySelection();
  }

  /** Moves the selection by `delta` slots, wrapping around. */
  public cycle(delta: number): void {
    this.select(this.selectedIndex + delta);
  }

  /** Replaces the slot contents and clamps the selection. */
  public setItems(items: HotbarItem[]): void {
    this.items = items;
    this.bar.setItems(items);
    if (this.selectedIndex >= items.length) {
      this.selectedIndex = Math.max(0, items.length - 1);
    }
    this.applySelection();
  }

  /**
   * Applies the `selected` class to the held slot and removes it from the rest.
   *
   * The engine component does not expose per-slot elements, so the slots are
     * looked up by their `data-slot` attribute, which is what the template emits
     * (`slot.dataset.slot = String(index)`). The `selected` class alone would do
     * nothing: the project ships no stylesheet, so the highlight is written inline.
   */
  private applySelection(): void {
    const root = this.bar.getElement()?.element as HTMLElement | undefined;
    if (!root) {
      return;
    }

      const slots = root.querySelectorAll<HTMLElement>(HOTBAR_SLOT_SELECTOR);
    slots.forEach((slot, index) => {
        const selected = index === this.selectedIndex;
        slot.classList.toggle(HOTBAR_SELECTED_CLASS, selected);
        applyStyles(slot, selected ? HOTBAR_SELECTED_STYLES : HOTBAR_UNSELECTED_STYLES);
    });
  }
}