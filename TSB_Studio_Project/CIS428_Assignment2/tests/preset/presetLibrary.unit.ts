/**
 * Layer 1 — preset library and transforms.
 *
 * Covers U-P-01 (types), U-P-02 (category data), U-P-04 (translate) and
 * U-P-05 (rotate clockwise in 90 degree steps).
 */

import { assertDeepEqual, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import {
  ALL_CATEGORY_ID,
  PRESET_CATEGORIES,
  allDesigns,
  categoryTabs,
  designsForCategory,
  findDesign,
  type PresetBlock,
} from '../../src/preset/PresetLibrary.js';
import {
  designSize,
  normalizeBlocks,
  rotateBlock,
  rotateBlocks,
  rotateDesign,
  translateBlocks,
} from '../../src/preset/rotatePreset.js';

describe('PresetLibrary: data', () => {
  it('has at least three categories', () => {
    assertTrue(PRESET_CATEGORIES.length >= 3, 'need enough tabs to exercise the layout');
  });

  it('gives every category at least two designs', () => {
    for (const category of PRESET_CATEGORIES) {
      assertTrue(category.designs.length >= 2, `category ${category.id} needs designs`);
    }
  });

  it('gives every design a unique id', () => {
    const ids = allDesigns().map((d) => d.id);
    assertEqual(new Set(ids).size, ids.length);
  });

  it('gives every design at least one block', () => {
    for (const design of allDesigns()) {
      assertTrue(design.blocks.length > 0, `design ${design.id} is empty`);
    }
  });

  it('tags every design with its category id', () => {
    for (const category of PRESET_CATEGORIES) {
      for (const design of category.designs) {
        assertEqual(design.categoryId, category.id);
      }
    }
  });

  it('finds a design by id', () => {
    const first = allDesigns()[0];
    assertEqual(findDesign(first.id)?.id, first.id);
  });

  it('returns null for an unknown design id', () => {
    assertEqual(findDesign('nope'), null);
  });
});

describe('PresetLibrary: categories', () => {
  it('prepends the synthetic all tab', () => {
    const tabs = categoryTabs();
    assertEqual(tabs[0].id, ALL_CATEGORY_ID);
    assertEqual(tabs.length, PRESET_CATEGORIES.length + 1);
  });

  it('returns every design for the all tab', () => {
    assertEqual(designsForCategory(ALL_CATEGORY_ID).length, allDesigns().length);
  });

  it('returns one category for a real tab', () => {
    const category = PRESET_CATEGORIES[0];
    assertEqual(designsForCategory(category.id).length, category.designs.length);
  });

  it('returns nothing for an unknown tab', () => {
    assertEqual(designsForCategory('nope').length, 0);
  });
});

describe('rotatePreset: translate', () => {
  it('shifts every block', () => {
    const blocks: PresetBlock[] = [{ x: 0, y: 0, z: 0, blockId: 1 }];
    assertDeepEqual(translateBlocks(blocks, { x: 2, y: 3, z: 4 }), [{ x: 2, y: 3, z: 4, blockId: 1 }]);
  });

  it('keeps block ids', () => {
    const blocks: PresetBlock[] = [{ x: 1, y: 1, z: 1, blockId: 7 }];
    assertEqual(translateBlocks(blocks, { x: 0, y: 0, z: 0 })[0].blockId, 7);
  });

  it('does not mutate the input', () => {
    const blocks: PresetBlock[] = [{ x: 0, y: 0, z: 0, blockId: 1 }];
    translateBlocks(blocks, { x: 5, y: 5, z: 5 });
    assertEqual(blocks[0].x, 0);
  });
});

describe('rotatePreset: rotate', () => {
  it('is a no-op for 0 steps', () => {
    assertDeepEqual(rotateBlock({ x: 2, y: 1, z: 3, blockId: 1 }, 0), { x: 2, y: 1, z: 3, blockId: 1 });
  });

  it('rotates clockwise: (x, z) -> (-z, x)', () => {
    assertDeepEqual(rotateBlock({ x: 1, y: 0, z: 0, blockId: 1 }, 1), { x: 0, y: 0, z: 1, blockId: 1 });
  });

  it('rotates 180 degrees', () => {
    assertDeepEqual(rotateBlock({ x: 1, y: 0, z: 0, blockId: 1 }, 2), { x: -1, y: 0, z: 0, blockId: 1 });
  });

  it('rotates 270 degrees', () => {
    assertDeepEqual(rotateBlock({ x: 1, y: 0, z: 0, blockId: 1 }, 3), { x: 0, y: 0, z: -1, blockId: 1 });
  });

  it('returns to the start after four steps', () => {
    const original: PresetBlock = { x: 3, y: 2, z: -5, blockId: 4 };
    assertDeepEqual(rotateBlock(original, 0), rotateBlock(original, 0));
    let current = original;
    for (let i = 0; i < 4; i++) current = rotateBlock(current, 1);
    assertDeepEqual(current, original);
  });

  it('leaves y untouched', () => {
    assertEqual(rotateBlock({ x: 1, y: 9, z: 2, blockId: 1 }, 1).y, 9);
  });

  it('rotates a whole list', () => {
    const blocks: PresetBlock[] = [
      { x: 1, y: 0, z: 0, blockId: 1 },
      { x: 0, y: 0, z: 1, blockId: 2 },
    ];
    const rotated = rotateBlocks(blocks, 1);
    assertDeepEqual(rotated[0], { x: 0, y: 0, z: 1, blockId: 1 });
    assertDeepEqual(rotated[1], { x: -1, y: 0, z: 0, blockId: 2 });
  });
});

describe('rotatePreset: normalize', () => {
  it('moves the minimum corner to the origin', () => {
    const blocks: PresetBlock[] = [
      { x: -2, y: -1, z: -3, blockId: 1 },
      { x: 0, y: 0, z: 0, blockId: 1 },
    ];
    const normalized = normalizeBlocks(blocks);
    assertDeepEqual(normalized[0], { x: 0, y: 0, z: 0, blockId: 1 });
    assertDeepEqual(normalized[1], { x: 2, y: 1, z: 3, blockId: 1 });
  });

  it('returns an empty list unchanged', () => {
    assertEqual(normalizeBlocks([]).length, 0);
  });

  it('keeps a design that already starts at the origin', () => {
    const blocks: PresetBlock[] = [{ x: 0, y: 0, z: 0, blockId: 1 }];
    assertDeepEqual(normalizeBlocks(blocks), blocks);
  });
});

describe('rotatePreset: design helpers', () => {
  it('re-normalises after rotating', () => {
    const design = {
      id: 'd',
      name: 'D',
      categoryId: 'c',
      blocks: [
        { x: 0, y: 0, z: 0, blockId: 1 },
        { x: 2, y: 0, z: 0, blockId: 1 },
      ],
    };
    const rotated = rotateDesign(design, 1);
    const minX = Math.min(...rotated.blocks.map((b) => b.x));
    const minZ = Math.min(...rotated.blocks.map((b) => b.z));
    assertEqual(minX, 0);
    assertEqual(minZ, 0);
  });

  it('preserves the block count through rotation', () => {
    const design = allDesigns()[0];
    assertEqual(rotateDesign(design, 1).blocks.length, design.blocks.length);
  });

  it('measures the bounding box', () => {
    const blocks: PresetBlock[] = [
      { x: 0, y: 0, z: 0, blockId: 1 },
      { x: 2, y: 4, z: 1, blockId: 1 },
    ];
    assertDeepEqual(designSize(blocks), { x: 3, y: 5, z: 2 });
  });

  it('reports a zero size for an empty design', () => {
    assertDeepEqual(designSize([]), { x: 0, y: 0, z: 0 });
  });
});