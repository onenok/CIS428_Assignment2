/**
 * Layer 1 — placement and breaking maths.
 *
 * Covers U-B-05 (build bounds check) and U-B-06 (failure reason classification).
 * U-B-03 / U-B-04 are covered end-to-end in `raycast.engine.ts`; here the same
 * maths is pinned without a physics engine.
 */

import { assertDeepEqual, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import {
  breakCellFromHit,
  buildBoundsForRadius,
  checkPlacement,
  isWithinBuildBounds,
  placementCellFromHit,
  shouldWritePlacement,
  type HitLike,
} from '../../src/build/placement.js';

const bounds = buildBoundsForRadius(0, 16);

function hit(x: number, y: number, z: number, nx: number, ny: number, nz: number): HitLike {
  return { hitLocation: { x, y, z }, hitNormal: { x: nx, y: ny, z: nz } };
}

describe('placement: bounds', () => {
  it('covers exactly chunk 0 for radius 0', () => {
    // Symmetric about the origin. `-16..15` was a long-standing off-by-one: it
    // spans chunk 0 *and* chunk -1, which made three neighbouring chunks
    // editable when the design says only the centre one is.
    assertDeepEqual(bounds, { minX: 0, maxX: 15, minZ: 0, maxZ: 15, minY: 0, maxY: 255 });
  });

  it('is symmetric for a wider radius', () => {
    assertDeepEqual(buildBoundsForRadius(1, 16), {
      minX: -16,
      maxX: 31,
      minZ: -16,
      maxZ: 31,
      minY: 0,
      maxY: 255,
    });
  });

  it('accepts cells inside the region', () => {
    assertTrue(isWithinBuildBounds(bounds, { x: 0, y: 0, z: 0 }));
    assertTrue(isWithinBuildBounds(bounds, { x: 15, y: 0, z: 15 }));
  });

  it('rejects cells outside the horizontal region', () => {
    assertTrue(!isWithinBuildBounds(bounds, { x: 16, y: 0, z: 0 }));
    assertTrue(!isWithinBuildBounds(bounds, { x: -1, y: 0, z: 0 }));
    assertTrue(!isWithinBuildBounds(bounds, { x: 0, y: 0, z: 16 }));
    assertTrue(!isWithinBuildBounds(bounds, { x: 0, y: 0, z: -1 }));
  });

  it('rejects cells outside the world height', () => {
    assertTrue(!isWithinBuildBounds(bounds, { x: 0, y: -11, z: 0 }));
    assertTrue(!isWithinBuildBounds(bounds, { x: 0, y: 256, z: 0 }));
  });
});

describe('placement: failure classification', () => {
  it('reports ok inside the region', () => {
    assertDeepEqual(checkPlacement(bounds, { x: 0, y: 0, z: 0 }), { ok: true });
  });

  it('reports outOfBounds outside the region', () => {
    assertDeepEqual(checkPlacement(bounds, { x: 100, y: 0, z: 0 }), { ok: false, reason: 'outOfBounds' });
  });

  it('reports outOfBounds above the world', () => {
    assertDeepEqual(checkPlacement(bounds, { x: 0, y: 300, z: 0 }), { ok: false, reason: 'outOfBounds' });
  });

  it('has no occupied reason', () => {
    const result = checkPlacement(bounds, { x: 0, y: 0, z: 0 });
    assertTrue(result.ok || result.reason !== ('occupied' as never), 'occupied is not a failure reason');
  });
});

describe('placement: place mode', () => {
  it('always writes into an empty cell', () => {
    assertTrue(shouldWritePlacement('replace', false));
    assertTrue(shouldWritePlacement('skip', false));
  });

  it('overwrites an occupied cell in replace mode', () => {
    assertTrue(shouldWritePlacement('replace', true));
  });

  it('leaves an occupied cell alone in skip mode', () => {
    assertTrue(!shouldWritePlacement('skip', true));
  });
});

describe('placement: cell derivation', () => {
  it('places above a top face hit', () => {
    assertDeepEqual(placementCellFromHit(hit(0.5, 1, 0.5, 0, 1, 0)), { x: 0, y: 1, z: 0 });
  });

  it('places beside an east face hit', () => {
    assertDeepEqual(placementCellFromHit(hit(1, 0.5, 0.5, 1, 0, 0)), { x: 1, y: 0, z: 0 });
  });

  it('breaks the block under a top face hit', () => {
    assertDeepEqual(breakCellFromHit(hit(0.5, 1, 0.5, 0, 1, 0)), { x: 0, y: 0, z: 0 });
  });

  it('breaks the block behind an east face hit', () => {
    assertDeepEqual(breakCellFromHit(hit(1, 0.5, 0.5, 1, 0, 0)), { x: 0, y: 0, z: 0 });
  });

  it('handles negative coordinates', () => {
    assertDeepEqual(breakCellFromHit(hit(-0.5, 1, -0.5, 0, 1, 0)), { x: -1, y: 0, z: -1 });
  });

  it('keeps placement and break one cell apart', () => {
    const h = hit(0.5, 1, 0.5, 0, 1, 0);
    const place = placementCellFromHit(h);
    const broken = breakCellFromHit(h);
    assertEqual(place.y - broken.y, 1);
  });
});