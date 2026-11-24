/**
 * Layer 1 — batch build shapes.
 *
 * Covers U-B-09 (line / drag), U-B-10 (rect) and U-B-11 (pillar).
 */

import { assertDeepEqual, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { dedupeCells, lineCells, pillarCells, rectCells } from '../../src/build/batchShapes.js';

describe('batchShapes: line', () => {
  it('returns a single cell when both ends match', () => {
    assertDeepEqual(lineCells({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }), [{ x: 1, y: 2, z: 3 }]);
  });

  it('walks a horizontal run', () => {
    const cells = lineCells({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 });
    assertEqual(cells.length, 4);
    assertDeepEqual(cells[0], { x: 0, y: 0, z: 0 });
    assertDeepEqual(cells[3], { x: 3, y: 0, z: 0 });
  });

  it('walks a vertical run', () => {
    const cells = lineCells({ x: 0, y: 0, z: 0 }, { x: 0, y: 4, z: 0 });
    assertEqual(cells.length, 5);
    assertEqual(cells[4].y, 4);
  });

  it('walks a diagonal run without gaps', () => {
    const cells = lineCells({ x: 0, y: 0, z: 0 }, { x: 3, y: 3, z: 3 });
    assertEqual(cells.length, 4);
    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1];
      const cur = cells[i];
      const step = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) + Math.abs(cur.z - prev.z);
      assertEqual(step, 3, 'each step should move one cell on every axis');
    }
  });

  it('works in the negative direction', () => {
    const cells = lineCells({ x: 0, y: 0, z: 0 }, { x: -3, y: 0, z: 0 });
    assertEqual(cells.length, 4);
    assertEqual(cells[3].x, -3);
  });

  it('is symmetric in length', () => {
    const a = lineCells({ x: 0, y: 0, z: 0 }, { x: 5, y: 2, z: -3 });
    const b = lineCells({ x: 5, y: 2, z: -3 }, { x: 0, y: 0, z: 0 });
    assertEqual(a.length, b.length);
  });
});

describe('batchShapes: rect', () => {
  it('fills a single cell for identical corners', () => {
    assertEqual(rectCells({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }).length, 1);
  });

  it('fills a 2x2x2 box', () => {
    assertEqual(rectCells({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }).length, 8);
  });

  it('fills a 3x1x3 slab', () => {
    assertEqual(rectCells({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }).length, 9);
  });

  it('is order independent', () => {
    const a = rectCells({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 });
    const b = rectCells({ x: 2, y: 2, z: 2 }, { x: 0, y: 0, z: 0 });
    assertEqual(a.length, b.length);
    assertEqual(a.length, 27);
  });

  it('handles negative corners', () => {
    const cells = rectCells({ x: -1, y: 0, z: -1 }, { x: 0, y: 0, z: 0 });
    assertEqual(cells.length, 4);
    assertTrue(cells.some((c) => c.x === -1 && c.z === -1));
  });

  it('produces no duplicates', () => {
    const cells = rectCells({ x: 0, y: 0, z: 0 }, { x: 3, y: 3, z: 3 });
    assertEqual(dedupeCells(cells).length, cells.length);
  });
});

describe('batchShapes: pillar', () => {
  it('returns nothing for a non-positive height', () => {
    assertEqual(pillarCells({ x: 0, y: 0, z: 0 }, 0).length, 0);
    assertEqual(pillarCells({ x: 0, y: 0, z: 0 }, -3).length, 0);
  });

  it('returns just the base for height 1', () => {
    assertDeepEqual(pillarCells({ x: 2, y: 5, z: 7 }, 1), [{ x: 2, y: 5, z: 7 }]);
  });

  it('stacks upward from the base', () => {
    const cells = pillarCells({ x: 0, y: 0, z: 0 }, 4);
    assertEqual(cells.length, 4);
    assertEqual(cells[0].y, 0);
    assertEqual(cells[3].y, 3);
  });

  it('keeps x and z fixed', () => {
    for (const cell of pillarCells({ x: 3, y: -2, z: 9 }, 5)) {
      assertEqual(cell.x, 3);
      assertEqual(cell.z, 9);
    }
  });
});

describe('batchShapes: dedupe', () => {
  it('removes repeated cells', () => {
    const cells = dedupeCells([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]);
    assertEqual(cells.length, 2);
  });

  it('preserves first-seen order', () => {
    const cells = dedupeCells([
      { x: 2, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ]);
    assertDeepEqual(cells, [
      { x: 2, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]);
  });
});