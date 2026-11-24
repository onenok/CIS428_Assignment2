import { describe, it } from '../../scripts/verify/harness.js';
import { assertDeepEqual, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import {
  PRESET_DESIGN_BUTTON_SELECTED_STYLES,
  PRESET_DESIGN_BUTTON_STYLES,
  PRESET_DESIGN_SCROLL_STEP,
  PRESET_DESIGN_STRIP_WIDTH,
  PRESET_TABS_PER_ROW,
  PRESET_TAB_ACTIVE_VARIANT,
  PRESET_TAB_INACTIVE_VARIANT,
  chunkTabs,
  presetTabs,
} from '../../src/ui/PresetTabs.js';
import {
  ALL_CATEGORY_ID,
  PRESET_CATEGORIES,
  allDesigns,
  designsForCategory,
} from '../../src/preset/PresetLibrary.js';

describe('PresetTabs / tab list', () => {
  it('puts the "all" tab first', () => {
    assertEqual(presetTabs()[0].id, ALL_CATEGORY_ID);
  });

  it('has one tab per category plus the "all" tab', () => {
    assertEqual(presetTabs().length, PRESET_CATEGORIES.length + 1);
  });

  it('uses the category display name as the label', () => {
    const tabs = presetTabs();
    for (let i = 0; i < PRESET_CATEGORIES.length; i++) {
      assertEqual(tabs[i + 1].id, PRESET_CATEGORIES[i].id);
      assertEqual(tabs[i + 1].label, PRESET_CATEGORIES[i].name);
    }
  });

  it('gives every tab a unique id', () => {
    const ids = presetTabs().map((tab) => tab.id);
    assertEqual(new Set(ids).size, ids.length);
  });
}, 'unit');

describe('PresetTabs / row chunking', () => {
  it('splits into rows of the configured size', () => {
    const tabs = presetTabs();
    const rows = chunkTabs(tabs);

    assertEqual(rows.length, Math.ceil(tabs.length / PRESET_TABS_PER_ROW));
    for (const row of rows) {
      assertTrue(row.length <= PRESET_TABS_PER_ROW);
    }
  });

  it('keeps every tab exactly once', () => {
    const tabs = presetTabs();
    const flat = chunkTabs(tabs).flat();

    assertDeepEqual(
      flat.map((tab) => tab.id),
      tabs.map((tab) => tab.id),
    );
  });

  it('returns no rows for an empty list', () => {
    assertEqual(chunkTabs([]).length, 0);
  });

  it('honours a custom row size', () => {
    const tabs = presetTabs();
    const rows = chunkTabs(tabs, 2);

    assertEqual(rows.length, Math.ceil(tabs.length / 2));
    assertEqual(rows[0].length, 2);
  });
}, 'unit');

describe('PresetTabs / variants', () => {
  it('uses primary for the active tab and ghost for the rest', () => {
    assertEqual(PRESET_TAB_ACTIVE_VARIANT, 'primary');
    assertEqual(PRESET_TAB_INACTIVE_VARIANT, 'ghost');
  });

  it('never uses the same variant for both states', () => {
      assertTrue(String(PRESET_TAB_ACTIVE_VARIANT) !== String(PRESET_TAB_INACTIVE_VARIANT));
  });
}, 'unit');

describe('PresetTabs / design strip', () => {
  it('lists every design under the "all" tab', () => {
    assertEqual(
      designsForCategory(ALL_CATEGORY_ID).length,
      allDesigns().length,
    );
  });

  it('lists only the matching designs under a category tab', () => {
    const category = PRESET_CATEGORIES[1];
    const designs = designsForCategory(category.id);

    assertEqual(designs.length, category.designs.length);
    assertTrue(designs.every((design) => design.categoryId === category.id));
  });

  it('needs to scroll: the strip is narrower than the full design list', () => {
    // 4 buttons fit; "All" shows 6, so the arrows have something to do.
    assertTrue(PRESET_DESIGN_STRIP_WIDTH < designsForCategory(ALL_CATEGORY_ID).length * 64);
    assertTrue(PRESET_DESIGN_SCROLL_STEP > 0);
  });

  it('highlights the selected design without painting over the card', () => {
    assertTrue(PRESET_DESIGN_BUTTON_SELECTED_STYLES.border.includes('#ffd766'));
    assertTrue(PRESET_DESIGN_BUTTON_SELECTED_STYLES.border !== PRESET_DESIGN_BUTTON_STYLES.border);
  });

  it('gives every design a name and a block count to show', () => {
    for (const design of allDesigns()) {
      assertTrue(design.name.length > 0, `${design.id} has no name`);
      assertTrue(design.blocks.length > 0, `${design.id} has no blocks`);
    }
  });
}, 'unit');