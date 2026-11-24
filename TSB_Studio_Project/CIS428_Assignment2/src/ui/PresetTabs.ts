/**
 * Preset category tabs and the design list underneath them.
 *
 * Built from `Card` + `mountChild(Button)` rather than hand-written HTML: the
 * engine already provides the panel chrome, the button variants and the child
 * lifecycle (including teardown), so the only custom logic here is which tab is
 * active and how a click maps back to a category id.
 *
 * Active state is expressed through the button `variant` (`primary` for the
 * active tab, `ghost` for the rest) instead of a bespoke `.active` class, so the
 * Game UI Kit palette stays the single source of truth for colours.
 *
 * The design row below the tabs is plain DOM rather than `Button`s: the strip
 * has to scroll horizontally with arrow buttons, which needs `overflow-x` and
 * `scrollLeft` — neither of which the engine's button component exposes.
 */

import * as ENGINE from '@gnsx/genesys.js';
import {
  ALL_CATEGORY_ID,
  PRESET_CATEGORIES,
  allDesigns,
  designsForCategory,
  findDesign,
  type PresetDesign,
} from '../preset/PresetLibrary.js';

/** One tab in the strip. */
export interface PresetTab {
  readonly id: string;
  readonly label: string;
}

/** Tabs per row. The design left the count open; five fits the panel width. */
export const PRESET_TABS_PER_ROW = 5;

/**
 * Where the panel sits: top centre.
 *
 * Passed to `Card` explicitly. The engine only writes the anchor styles when the
 * caller asks for the same position the component defaults to, so relying on the
 * default leaves the card in normal flow — full width, at the top-left, where it
 * overlaps the hotbar.
 */
export const PRESET_TABS_POSITION = 'top-center';

/** Button variant used for the active tab. */
export const PRESET_TAB_ACTIVE_VARIANT = 'primary';

/** Button variant used for inactive tabs. */
export const PRESET_TAB_INACTIVE_VARIANT = 'ghost';

/** Builds the tab list: the synthetic "all" tab first, then every category. */
export function presetTabs(): PresetTab[] {
  return [
    { id: ALL_CATEGORY_ID, label: 'All' },
    ...PRESET_CATEGORIES.map((category) => ({ id: category.id, label: category.name })),
  ];
}

/** Splits tabs into rows of {@link PRESET_TABS_PER_ROW}. */
export function chunkTabs(tabs: readonly PresetTab[], perRow = PRESET_TABS_PER_ROW): PresetTab[][] {
  const rows: PresetTab[][] = [];
  for (let i = 0; i < tabs.length; i += perRow) {
    rows.push(tabs.slice(i, i + perRow));
  }
  return rows;
}

/** Callback fired when the player picks a different tab. */
export type PresetTabChangeHandler = (categoryId: string) => void;

/** Callback fired when the player picks a design in the strip. */
export type PresetDesignSelectHandler = (design: PresetDesign) => void;

/** Height/width of one design button, in CSS pixels. */
export const PRESET_DESIGN_BUTTON_WIDTH = 64;
export const PRESET_DESIGN_BUTTON_HEIGHT = 56;

/**
 * Width of the visible strip.
 *
 * Four buttons plus gaps. Six designs (the "all" tab) overflow, which is what
 * makes the arrows meaningful instead of decorative.
 */
export const PRESET_DESIGN_STRIP_WIDTH = 284;

/** Distance one arrow click scrolls the strip. */
export const PRESET_DESIGN_SCROLL_STEP = 136;

/** Row holding the arrows and the scrolling strip. */
export const PRESET_DESIGN_ROW_STYLES: Readonly<Record<string, string>> = {
  display: 'flex',
  'align-items': 'center',
  gap: '4px',
  'margin-top': '8px',
};

export const PRESET_DESIGN_STRIP_STYLES: Readonly<Record<string, string>> = {
  display: 'flex',
  gap: '6px',
  width: `${PRESET_DESIGN_STRIP_WIDTH}px`,
  'overflow-x': 'auto',
  'overflow-y': 'hidden',
  'scroll-behavior': 'smooth',
  'scrollbar-width': 'none',
  'flex-shrink': '1',
};

export const PRESET_DESIGN_ARROW_STYLES: Readonly<Record<string, string>> = {
  flex: '0 0 auto',
  width: '20px',
  height: `${PRESET_DESIGN_BUTTON_HEIGHT}px`,
  padding: '0',
  border: '1px solid rgba(255, 255, 255, 0.22)',
  'border-radius': '4px',
  background: 'rgba(16, 18, 26, 0.6)',
  color: '#e8eaed',
  'font-size': '14px',
  'line-height': '1',
  cursor: 'pointer',
};

/** Shared by both design-button states. */
const DESIGN_BUTTON_BASE_STYLES: Readonly<Record<string, string>> = {
  flex: '0 0 auto',
  width: `${PRESET_DESIGN_BUTTON_WIDTH}px`,
  height: `${PRESET_DESIGN_BUTTON_HEIGHT}px`,
  padding: '4px 2px',
  'border-radius': '4px',
  color: '#e8eaed',
  'font-family': 'inherit',
  'font-size': '11px',
  'line-height': '13px',
  cursor: 'pointer',
  'text-align': 'center',
  overflow: 'hidden',
};

export const PRESET_DESIGN_BUTTON_STYLES: Readonly<Record<string, string>> = {
  ...DESIGN_BUTTON_BASE_STYLES,
  border: '1px solid rgba(255, 255, 255, 0.22)',
  background: 'rgba(16, 18, 26, 0.6)',
};

export const PRESET_DESIGN_BUTTON_SELECTED_STYLES: Readonly<Record<string, string>> = {
  ...DESIGN_BUTTON_BASE_STYLES,
  border: '2px solid #ffd766',
  background: 'rgba(255, 215, 102, 0.18)',
};

/** Text inside a design button: name on one line, count underneath. */
export const PRESET_DESIGN_NAME_STYLES: Readonly<Record<string, string>> = {
  display: 'block',
  'font-weight': '600',
  'white-space': 'nowrap',
  overflow: 'hidden',
  'text-overflow': 'ellipsis',
};

export const PRESET_DESIGN_META_STYLES: Readonly<Record<string, string>> = {
  display: 'block',
  'font-size': '9px',
  'line-height': '11px',
  opacity: '0.7',
};

export const PRESET_DESIGN_ROW_CLASS = 'preset-design-row';
export const PRESET_DESIGN_STRIP_CLASS = 'preset-design-strip';
export const PRESET_DESIGN_ARROW_CLASS = 'preset-design-arrow';
export const PRESET_DESIGN_BUTTON_CLASS = 'preset-design-button';
export const PRESET_DESIGN_SELECTED_CLASS = 'selected';

/** Applies a style map to an element, skipping anything the DOM does not know. */
function applyStyles(element: HTMLElement, styles: Readonly<Record<string, string>>): void {
  for (const [property, value] of Object.entries(styles)) {
    element.style?.setProperty(property, value);
  }
}

/**
 * The tab strip.
 *
 * `Card` supplies the container; each tab is a `Button` mounted into a row
 * element inside that card.
 */
export class PresetTabs {
  private readonly card: ENGINE.Card;
  private readonly tabs: PresetTab[];
  private readonly buttons = new Map<string, ENGINE.Button>();
  private activeId: string;
  private handler: PresetTabChangeHandler | null = null;

  private strip: HTMLElement | null = null;
  private prevArrow: HTMLButtonElement | null = null;
  private nextArrow: HTMLButtonElement | null = null;
  private readonly designButtons = new Map<string, HTMLButtonElement>();
  private selectedDesignId: string | null = null;
  private designHandler: PresetDesignSelectHandler | null = null;

  private constructor(card: ENGINE.Card, tabs: PresetTab[], activeId: string) {
    this.card = card;
    this.tabs = tabs;
    this.activeId = activeId;
  }

  /** Creates and initializes the strip. */
  public static async create(
    ui: ENGINE.UIManager,
    activeId: string = ALL_CATEGORY_ID,
  ): Promise<PresetTabs> {
    const card = new ENGINE.Card(ui, {
      title: 'Presets',
      variant: 'default',
          // Explicit: `applyPositioning()` only anchors when the caller passes the
          // position, so a card relying on its default sits in normal flow — full
          // width, top-left, on top of the hotbar. `setPosition()` cannot be used
          // instead: it clears the anchor before writing its own styles.
          position: PRESET_TABS_POSITION,
    });
    await card.initialize();

    const tabs = presetTabs();
    const strip = new PresetTabs(card, tabs, activeId);
    await strip.buildRows(ui);
    strip.applyVariants();
    strip.buildDesignRow();
    strip.renderDesigns();

    return strip;
  }

  /** The underlying card, for positioning and visibility. */
  public get component(): ENGINE.Card {
    return this.card;
  }

  /** Every tab, in display order. */
  public getTabs(): readonly PresetTab[] {
    return this.tabs;
  }

  /** Id of the active tab. */
  public getActiveId(): string {
    return this.activeId;
  }

  /** Registers the selection callback. */
  public onChange(handler: PresetTabChangeHandler): void {
    this.handler = handler;
  }

    /** Registers the design-click callback. */
    public onDesignSelected(handler: PresetDesignSelectHandler): void {
      this.designHandler = handler;
    }

    /** Id of the highlighted design, or null when nothing is picked. */
    public getActiveDesignId(): string | null {
      return this.selectedDesignId;
    }

    /** Designs currently listed for the active tab. */
    public getVisibleDesigns(): readonly PresetDesign[] {
      return designsForCategory(this.activeId);
    }

  /** Activates a tab by id. Unknown ids are ignored. */
  public select(categoryId: string): void {
    if (!this.buttons.has(categoryId) || categoryId === this.activeId) {
      return;
    }
    this.activeId = categoryId;
    this.applyVariants();
      // The design list belongs to the category, so it cannot outlive the tab.
      this.selectedDesignId = null;
      this.renderDesigns();
    this.handler?.(categoryId);
  }

    /**
     * Highlights a design and reports it.
     *
     * Clicking the highlighted design again clears it, so the strip can be left
     * with nothing selected instead of forcing a choice.
     */
    public selectDesign(designId: string): void {
      const design = findDesign(designId);
      if (!design) {
        return;
      }

      this.selectedDesignId = this.selectedDesignId === designId ? null : designId;
      this.applyDesignHighlight();

      if (this.selectedDesignId) {
        this.designHandler?.(design);
      }
    }

  /**
   * Builds the design row: left arrow, scrolling strip, right arrow.
   *
   * The arrows exist because the card is only wide enough for four buttons and
   * the "All" tab lists six designs.
   */
  private buildDesignRow(): void {
    const body = this.getBody();
    if (!body) {
      return;
    }

    const doc = body.ownerDocument;
    const row = doc.createElement('div');
    row.className = PRESET_DESIGN_ROW_CLASS;
    applyStyles(row, PRESET_DESIGN_ROW_STYLES);

    this.prevArrow = this.makeArrow(doc, '‹', 'Scroll presets left', -1);
    this.nextArrow = this.makeArrow(doc, '›', 'Scroll presets right', 1);

    this.strip = doc.createElement('div');
    this.strip.className = PRESET_DESIGN_STRIP_CLASS;
    applyStyles(this.strip, PRESET_DESIGN_STRIP_STYLES);
    this.strip.addEventListener?.('scroll', () => this.updateArrowVisibility());

    row.appendChild(this.prevArrow);
    row.appendChild(this.strip);
    row.appendChild(this.nextArrow);
    body.appendChild(row);
  }

  private makeArrow(
    doc: Document,
    glyph: string,
    label: string,
    direction: -1 | 1,
  ): HTMLButtonElement {
    const arrow = doc.createElement('button');
    arrow.type = 'button';
    arrow.className = PRESET_DESIGN_ARROW_CLASS;
    arrow.textContent = glyph;
    arrow.setAttribute('aria-label', label);
    applyStyles(arrow, PRESET_DESIGN_ARROW_STYLES);
    arrow.addEventListener?.('click', () => {
      if (this.strip) {
        this.strip.scrollLeft += direction * PRESET_DESIGN_SCROLL_STEP;
      }
    });
    return arrow;
  }

  /** Rebuilds the design buttons for the active tab. */
  public renderDesigns(): void {
    const strip = this.strip;
    if (!strip) {
      return;
    }

    strip.textContent = '';
    this.designButtons.clear();

    for (const design of this.getVisibleDesigns()) {
      const button = this.buildDesignButton(strip.ownerDocument, design);
      this.designButtons.set(design.id, button);
      strip.appendChild(button);
    }

    // A narrower category may now fit without scrolling.
    strip.scrollLeft = 0;
    this.applyDesignHighlight();
    this.updateArrowVisibility();
  }

  private buildDesignButton(doc: Document, design: PresetDesign): HTMLButtonElement {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = PRESET_DESIGN_BUTTON_CLASS;
    button.dataset.designId = design.id;
    button.title = `${design.name} — ${design.blocks.length} blocks`;
    applyStyles(button, PRESET_DESIGN_BUTTON_STYLES);

    const name = doc.createElement('div');
    name.className = 'preset-design-name';
    name.textContent = design.name;
    applyStyles(name, PRESET_DESIGN_NAME_STYLES);

    const meta = doc.createElement('div');
    meta.className = 'preset-design-meta';
    meta.textContent = `${design.blocks.length} blocks`;
    applyStyles(meta, PRESET_DESIGN_META_STYLES);

    button.appendChild(name);
    button.appendChild(meta);
    button.addEventListener?.('click', () => this.selectDesign(design.id));
    return button;
  }

  /** Repaints every design button from the current selection. */
  private applyDesignHighlight(): void {
    for (const [id, button] of this.designButtons) {
      const selected = id === this.selectedDesignId;
      button.classList.toggle(PRESET_DESIGN_SELECTED_CLASS, selected);
      applyStyles(
        button,
        selected ? PRESET_DESIGN_BUTTON_SELECTED_STYLES : PRESET_DESIGN_BUTTON_STYLES,
      );
    }
  }

  /**
   * Hides the arrows when the strip does not overflow.
   *
   * A strip with no layout yet reports `clientWidth === 0`; that means "not
   * measured", not "everything fits", so the arrows stay visible in that case.
   */
  private updateArrowVisibility(): void {
    const strip = this.strip;
    if (!strip) {
      return;
    }

    const measured = (strip.clientWidth ?? 0) > 0;
    const overflowing = (strip.scrollWidth ?? 0) > (strip.clientWidth ?? 0) + 1;
    const show = !measured || overflowing;

    for (const arrow of [this.prevArrow, this.nextArrow]) {
      if (arrow) {
        arrow.style?.setProperty('display', show ? 'block' : 'none');
      }
    }
  }

  /** Mounts one row of buttons per {@link PRESET_TABS_PER_ROW} tabs. */
  private async buildRows(ui: ENGINE.UIManager): Promise<void> {
    const body = this.getBody();
    if (!body) {
      return;
    }

    for (const row of chunkTabs(this.tabs)) {
      const rowElement = body.ownerDocument.createElement('div');
      rowElement.className = 'preset-tab-row';
      body.appendChild(rowElement);

      for (const tab of row) {
        const button = await this.card['mountChild'](
          ENGINE.Button,
          {
            label: tab.label,
            variant: PRESET_TAB_INACTIVE_VARIANT,
            size: 'small',
            onClick: () => this.select(tab.id),
          },
          rowElement,
        );
        this.buttons.set(tab.id, button as ENGINE.Button);
      }
    }

    void ui;
  }

  /** Swaps every button to the variant matching its active state. */
  private applyVariants(): void {
    for (const [id, button] of this.buttons) {
      const variant = id === this.activeId ? PRESET_TAB_ACTIVE_VARIANT : PRESET_TAB_INACTIVE_VARIANT;
      button.setVariant?.(variant);
    }
  }

  /** The card's content area, where the rows are appended. */
  private getBody(): HTMLElement | null {
    const layout = this.card.getElement()?.element as HTMLElement | undefined;
    if (!layout) {
      return null;
    }
    return (
      layout.querySelector<HTMLElement>('.ui-card-body') ??
      layout.querySelector<HTMLElement>('.ui-card-content') ??
      layout
    );
  }
}