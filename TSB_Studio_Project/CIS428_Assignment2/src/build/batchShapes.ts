/**
 * Batch build shapes.
 *
 * Three ways to place more than one block at a time:
 *
 *   line    - drag from A to B, fills the straight run between them
 *   rect    - two opposite corners, fills the axis-aligned box between them
 *   pillar  - a base cell plus a height, fills the vertical run above it
 *
 * All three return a de-duplicated cell list in a deterministic order so the
 * undo stack and the mesh rebuild see the same sequence every time.
 */

import type { VoxelCell } from './placement.js';

/** Inclusive integer range from `a` to `b`, ascending or descending. */
function inclusiveRange(a: number, b: number): number[] {
  const step = a <= b ? 1 : -1;
  const out: number[] = [];
  for (let v = a; step > 0 ? v <= b : v >= b; v += step) out.push(v);
  return out;
}

/**
 * Straight run between two cells.
 *
 * Uses a 3D DDA so the result is a connected line of cells with no gaps, which
 * is what a drag gesture needs. The line is inclusive of both endpoints.
 */
export function lineCells(from: VoxelCell, to: VoxelCell): VoxelCell[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));

  if (steps === 0) return [{ x: from.x, y: from.y, z: from.z }];

  const cells: VoxelCell[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    cells.push({
      x: Math.round(from.x + dx * t),
      y: Math.round(from.y + dy * t),
      z: Math.round(from.z + dz * t),
    });
  }
  return cells;
}

/**
 * Axis-aligned box between two opposite corners.
 *
 * The box is filled solid, not just its shell, because a hollow box is not what
 * a two-corner drag gesture implies.
 */
export function rectCells(cornerA: VoxelCell, cornerB: VoxelCell): VoxelCell[] {
  const xs = inclusiveRange(cornerA.x, cornerB.x);
  const ys = inclusiveRange(cornerA.y, cornerB.y);
  const zs = inclusiveRange(cornerA.z, cornerB.z);

  const cells: VoxelCell[] = [];
  for (const z of zs) {
    for (const y of ys) {
      for (const x of xs) {
        cells.push({ x, y, z });
      }
    }
  }
  return cells;
}

/**
 * Vertical run starting at `base` and extending `height` cells upward.
 *
 * `height` counts the base cell, so `height = 1` returns just the base.
 */
export function pillarCells(base: VoxelCell, height: number): VoxelCell[] {
  if (height <= 0) return [];
  const cells: VoxelCell[] = [];
  for (let i = 0; i < height; i++) {
    cells.push({ x: base.x, y: base.y + i, z: base.z });
  }
  return cells;
}

/** Stable key for de-duplication. */
function cellKey(cell: VoxelCell): string {
  return `${cell.x},${cell.y},${cell.z}`;
}

/** Removes duplicate cells while preserving first-seen order. */
export function dedupeCells(cells: readonly VoxelCell[]): VoxelCell[] {
  const seen = new Set<string>();
  const out: VoxelCell[] = [];
  for (const cell of cells) {
    const key = cellKey(cell);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cell);
  }
  return out;
}