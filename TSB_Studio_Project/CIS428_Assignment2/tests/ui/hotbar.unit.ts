import { describe, it } from '../../scripts/verify/harness.js';
import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import {
  HOTBAR_ICON_CLASS,
  HOTBAR_LABEL_CLASS,
  HOTBAR_LABEL_STYLES,
  HOTBAR_SELECTED_STYLES,
  HOTBAR_SLOT_COUNT,
  HOTBAR_SLOT_SELECTOR,
  HOTBAR_UNSELECTED_STYLES,
  clearHotbarSlot,
  defaultHotbarItems,
  renderHotbarSlot,
} from '../../src/ui/Hotbar.js';
import { PLACEABLE_BLOCKS, BLOCK_NAMES } from '../../src/voxel/blockIds.js';

describe('Hotbar / default items', () => {
  it('has one slot per placeable block', () => {
    assertEqual(defaultHotbarItems().length, PLACEABLE_BLOCKS.length);
  });

  it('matches the documented slot count', () => {
    assertEqual(defaultHotbarItems().length, HOTBAR_SLOT_COUNT);
  });

  it('gives every slot a unique id', () => {
    const ids = defaultHotbarItems().map((item) => item.id);
    assertEqual(new Set(ids).size, ids.length);
  });

  it('carries the block id and its display name', () => {
    const items = defaultHotbarItems();
    for (let i = 0; i < items.length; i++) {
      assertEqual(items[i].blockId, PLACEABLE_BLOCKS[i]);
      assertEqual(items[i].label, BLOCK_NAMES[PLACEABLE_BLOCKS[i]]);
    }
  });

  it('never includes air', () => {
    assertTrue(defaultHotbarItems().every((item) => item.blockId !== 0));
  });
}, 'unit');

describe('Hotbar / slot rendering', () => {
  it('writes the block id and label onto the slot', () => {
    const slot = makeFakeSlot();
    const item = defaultHotbarItems()[2];

    renderHotbarSlot(item, slot.element);

    assertEqual(slot.element.dataset.blockId, String(item.blockId));
    assertEqual(slot.element.title, item.label);
    assertEqual(slot.content.children.length, 2);
    assertEqual(slot.content.children[0].className, HOTBAR_ICON_CLASS);
    assertEqual(slot.content.children[1].className, HOTBAR_LABEL_CLASS);
    assertEqual(slot.content.children[1].textContent, item.label);
  });

  it('draws the icon as an isometric cube, not as text', () => {
    const slot = makeFakeSlot();
    renderHotbarSlot(defaultHotbarItems()[0], slot.element);

    const icon = slot.content.children[0];
    assertTrue(icon.innerHTML.includes('<svg'), 'icon must be an svg');
    assertEqual((icon.innerHTML.match(/<polygon/g) ?? []).length, 3);
  });

  it('stacks the icon above the label so nothing overflows the slot', () => {
    const slot = makeFakeSlot();
    renderHotbarSlot(defaultHotbarItems()[0], slot.element);

    assertEqual(slot.content.styles.display, 'flex');
    assertEqual(slot.content.styles['flex-direction'], 'column');
    assertEqual(slot.content.styles.overflow, 'hidden');
    assertEqual(HOTBAR_LABEL_STYLES['white-space'], 'nowrap');
    assertEqual(HOTBAR_LABEL_STYLES['text-overflow'], 'ellipsis');
  });

  it('never appends siblings next to the engine content container', () => {
    const slot = makeFakeSlot();
    renderHotbarSlot(defaultHotbarItems()[0], slot.element);

    // The engine owns the cooldown overlay and hotkey badge in there.
        assertEqual(slot.slotChildren.length, 1);
        assertEqual(slot.slotChildren[0], slot.content);
  });

  it('replaces the previous contents instead of stacking a second icon', () => {
    const slot = makeFakeSlot();
    renderHotbarSlot(defaultHotbarItems()[0], slot.element);
    renderHotbarSlot(defaultHotbarItems()[1], slot.element);

    assertEqual(slot.content.children.length, 2);
  });

  it('clears the slot back to empty', () => {
    const slot = makeFakeSlot();
    renderHotbarSlot(defaultHotbarItems()[0], slot.element);

    clearHotbarSlot(slot.element);

    assertEqual(slot.element.dataset.blockId, undefined);
    assertEqual(slot.element.title, '');
    assertEqual(slot.content.children.length, 0);
    assertEqual(slot.content.styles.display, 'none');
  });
}, 'unit');

describe('Hotbar / selection highlight', () => {
  it('targets the slot attribute the engine actually emits', () => {
    assertEqual(HOTBAR_SLOT_SELECTOR, '.ui-inventory-bar-slot[data-slot]');
  });

  it('draws the ring without painting over the engine background', () => {
    assertEqual(HOTBAR_SELECTED_STYLES.outline, '2px solid #ffd766');
    assertEqual('background' in HOTBAR_SELECTED_STYLES, false);
    assertEqual(HOTBAR_UNSELECTED_STYLES.outline, 'none');
  });
}, 'unit');

describe('Hotbar / selection arithmetic', () => {
  it('wraps forward past the last slot', () => {
    assertEqual(wrapIndex(HOTBAR_SLOT_COUNT, HOTBAR_SLOT_COUNT), 0);
  });

  it('wraps backward past the first slot', () => {
    assertEqual(wrapIndex(-1, HOTBAR_SLOT_COUNT), HOTBAR_SLOT_COUNT - 1);
  });

  it('keeps an in-range index unchanged', () => {
    assertEqual(wrapIndex(3, HOTBAR_SLOT_COUNT), 3);
  });

  it('handles a large negative delta', () => {
    assertEqual(wrapIndex(-10, HOTBAR_SLOT_COUNT), HOTBAR_SLOT_COUNT - 1);
  });
}, 'unit');

describe('Hotbar / block id lookup', () => {
  it('returns the block id at the selected index', () => {
    const items = defaultHotbarItems();
    assertEqual(items[4].blockId, PLACEABLE_BLOCKS[4]);
  });

  it('returns 0 for an out-of-range index', () => {
    const items = defaultHotbarItems();
    assertEqual(items[99]?.blockId ?? 0, 0);
  });
}, 'unit');

/** Mirrors the wrap arithmetic used by `Hotbar.select`. */
function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}

/**
 * Minimal stand-in for the slot element `InventoryBar` hands to the renderer.
 *
 * Mirrors the engine template: the slot owns an `.item-content` child (plus a
 * cooldown overlay and a hotkey badge, which are deliberately not modelled) and
 * exposes it through `querySelector('.item-content')`.
 */
function makeFakeSlot(): {
  element: any;
  content: { children: any[]; styles: Record<string, string>; textContent: string; innerHTML: string };
  slotChildren: any[];
} {
  const content = makeFakeElement();
  const slotChildren: any[] = [content];

  const element: any = {
    dataset: {} as Record<string, string>,
    title: '',
    ownerDocument: { createElement: () => makeFakeElement() },
    querySelector: (selector: string) => (selector === '.item-content' ? content : null),
    appendChild: (child: any) => {
      if (!slotChildren.includes(child)) {
        slotChildren.push(child);
      }
    },
    removeAttribute: (name: string) => {
      if (name === 'title') {
        element.title = '';
      }
    },
    get textContent(): string {
      return slotChildren.map((child) => child.textContent).join('');
    },
    set textContent(value: string) {
      slotChildren.length = 0;
      if (value !== '') {
        slotChildren.push({ className: '', textContent: value });
      }
    },
  };

  return { element, content, slotChildren };
}

/** A DOM-ish element with the handful of properties the renderer touches. */
function makeFakeElement(): any {
  const children: any[] = [];
  const styles: Record<string, string> = {};

  const element: any = {
    className: '',
    title: '',
    innerHTML: '',
    dataset: {} as Record<string, string>,
    style: {
      setProperty: (property: string, value: string) => {
        styles[property] = value;
      },
    },
    appendChild: (child: any) => {
      children.push(child);
      return child;
    },
    setAttribute: () => undefined,
    addEventListener: () => undefined,
  };

  Object.defineProperty(element, 'children', { get: () => children });
  Object.defineProperty(element, 'styles', { get: () => styles });

  // `textContent = ''` removes every child, matching real DOM behaviour.
  Object.defineProperty(element, 'textContent', {
    get: () => children.map((child) => child.textContent).join(''),
    set: (value: string) => {
      children.length = 0;
      if (value !== '') {
        children.push({ className: '', textContent: value });
      }
    },
  });

  return element;
}