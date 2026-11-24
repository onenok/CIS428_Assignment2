/**
 * Layer 1 — preset application planning.
 *
 * Covers U-P-03: writing a design into the world honours the build bounds and
 * the active `PlaceMode`.
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { buildBoundsForRadius } from '../../src/build/placement.js';
import { designBlockCount, designBlockIds, planApplyPreset } from '../../src/preset/applyPreset.js';
import { PRESET_CATEGORIES, allDesigns, type PresetDesign } from '../../src/preset/PresetLibrary.js';

const bounds = buildBoundsForRadius(0, 16);

function design(blocks: { x: number; y: number; z: number; blockId: number }[]): PresetDesign {
  return { id: 'test', name: 'Test', categoryId: 'test', blocks };
}

describe('applyPreset: writes', () => {
  it('translates design cells to world space', () => {
    const d = design([{ x: 0, y: 0, z: 0, blockId: 3 }]);
    const result = planApplyPreset(d, {
        // In bounds: radius 0 is chunk 0 only, so z = -2 would be rejected.
        origin: { x: 5, y: 1, z: 2 },
      placeMode: 'replace',
      bounds,
      readBlock: () => 0,
    });
    assertEqual(result.writes.length, 1);
    assertEqual(result.writes[0].x, 5);
    assertEqual(result.writes[0].y, 1);
      assertEqual(result.writes[0].z, 2);
    assertEqual(result.writes[0].blockId, 3);
  });

  it('writes every cell of a multi-block design', () => {
    const d = design([
      { x: 0, y: 0, z: 0, blockId: 1 },
      { x: 1, y: 0, z: 0, blockId: 2 },
    ]);
    const result = planApplyPreset(d, {
      origin: { x: 0, y: 0, z: 0 },
      placeMode: 'replace',
      bounds,
      readBlock: () => 0,
    });
    assertEqual(result.writes.length, 2);
  });

  it('preserves design order', () => {
    const d = design([
      { x: 2, y: 0, z: 0, blockId: 1 },
      { x: 0, y: 0, z: 0, blockId: 2 },
    ]);
    const result = planApplyPreset(d, {
      origin: { x: 0, y: 0, z: 0 },
      placeMode: 'replace',
      bounds,
      readBlock: () => 0,
    });
    assertEqual(result.writes[0].x, 2);
    assertEqual(result.writes[1].x, 0);
  });
});

describe('applyPreset: bounds', () => {
  it('rejects cells outside the build region', () => {
    const d = design([{ x: 0, y: 0, z: 0, blockId: 1 }]);
    const result = planApplyPreset(d, {
      origin: { x: 100, y: 0, z: 0 },
      placeMode: 'replace',
      bounds,
      readBlock: () => 0,
    });
    assertEqual(result.writes.length, 0);
    assertEqual(result.outOfBounds.length, 1);
  });

  it('rejects cells above the world height', () => {
    const d = design([{ x: 0, y: 0, z: 0, blockId: 1 }]);
    const result = planApplyPreset(d, {
      origin: { x: 0, y: 300, z: 0 },
      placeMode: 'replace',
      bounds,
      readBlock: () => 0,
    });
    assertEqual(result.outOfBounds.length, 1);
  });

  it('keeps in-bounds cells when part of the design overflows', () => {
    const d = design([
      { x: 0, y: 0, z: 0, blockId: 1 },
      { x: 100, y: 0, z: 0, blockId: 1 },
    ]);
    const result = planApplyPreset(d, {
      origin: { x: 0, y: 0, z: 0 },
      placeMode: 'replace',
      bounds,
      readBlock: () => 0,
    });
    assertEqual(result.writes.length, 1);
    assertEqual(result.outOfBounds.length, 1);
  });
});

describe('applyPreset: place mode', () => {
  it('overwrites occupied cells in replace mode', () => {
    const d = design([{ x: 0, y: 0, z: 0, blockId: 1 }]);
    const result = planApplyPreset(d, {
      origin: { x: 0, y: 0, z: 0 },
      placeMode: 'replace',
      bounds,
      readBlock: () => 9,
    });
    assertEqual(result.writes.length, 1);
    assertEqual(result.skipped.length, 0);
  });

  it('skips occupied cells in skip mode', () => {
    const d = design([{ x: 0, y: 0, z: 0, blockId: 1 }]);
    const result = planApplyPreset(d, {
      origin: { x: 0, y: 0, z: 0 },
      placeMode: 'skip',
      bounds,
      readBlock: () => 9,
    });
    assertEqual(result.writes.length, 0);
    assertEqual(result.skipped.length, 1);
  });

  it('writes empty cells in skip mode', () => {
    const d = design([{ x: 0, y: 0, z: 0, blockId: 1 }]);
    const result = planApplyPreset(d, {
      origin: { x: 0, y: 0, z: 0 },
      placeMode: 'skip',
      bounds,
      readBlock: () => 0,
    });
    assertEqual(result.writes.length, 1);
  });

  it('reads the block id per cell', () => {
    const d = design([
      { x: 0, y: 0, z: 0, blockId: 1 },
      { x: 1, y: 0, z: 0, blockId: 1 },
    ]);
    const result = planApplyPreset(d, {
      origin: { x: 0, y: 0, z: 0 },
      placeMode: 'skip',
      bounds,
      readBlock: (cell) => (cell.x === 0 ? 5 : 0),
    });
    assertEqual(result.skipped.length, 1);
    assertEqual(result.writes.length, 1);
  });
});

describe('applyPreset: helpers', () => {
  it('counts design blocks', () => {
    const d = allDesigns()[0];
    assertEqual(designBlockCount(d), d.blocks.length);
  });

  it('lists the distinct block ids a design uses', () => {
    const d = design([
      { x: 0, y: 0, z: 0, blockId: 1 },
      { x: 1, y: 0, z: 0, blockId: 1 },
      { x: 2, y: 0, z: 0, blockId: 2 },
    ]);
    const ids = designBlockIds(d);
    assertEqual(ids.length, 2);
    assertTrue(ids.includes(1) && ids.includes(2));
  });

  it('applies every sample design without throwing', () => {
    for (const category of PRESET_CATEGORIES) {
      for (const d of category.designs) {
        const result = planApplyPreset(d, {
          origin: { x: 0, y: 0, z: 0 },
          placeMode: 'replace',
          bounds,
          readBlock: () => 0,
        });
        assertTrue(result.writes.length > 0, `design ${d.id} produced no writes`);
      }
    }
  });
});