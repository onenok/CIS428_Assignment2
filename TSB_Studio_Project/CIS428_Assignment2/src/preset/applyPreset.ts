/**
 * Preset application.
 *
 * Stamping a design into the world is a pure planning step: it produces the list
 * of cells that *would* change, plus the cells that were rejected. The caller
 * then writes the accepted cells through the chunk API and pushes one undo batch.
 *
 * Keeping this pure means the whole placement rule set (bounds, place mode) is
 * testable without a world.
 */

import type { BuildBounds, PlaceMode, VoxelCell } from '../build/placement.js';
import { checkPlacement, shouldWritePlacement } from '../build/placement.js';
import type { PresetBlock, PresetDesign } from './PresetLibrary.js';

/** One cell the preset wants to write. */
export interface PresetWrite extends VoxelCell {
  readonly blockId: number;
}

export interface ApplyPresetResult {
  /** Cells that should be written, in design order. */
  readonly writes: readonly PresetWrite[];
  /** Cells rejected because they fall outside the build bounds. */
  readonly outOfBounds: readonly VoxelCell[];
  /** Cells skipped because they were occupied and the mode is `skip`. */
  readonly skipped: readonly VoxelCell[];
}

export interface ApplyPresetOptions {
  /** World-space origin the design's minimum corner is placed at. */
  readonly origin: VoxelCell;
  /** How to treat cells that already hold a block. */
  readonly placeMode: PlaceMode;
  /** Editable region. */
  readonly bounds: BuildBounds;
  /** Reads the current block id at a cell. `0` means air. */
  readonly readBlock: (cell: VoxelCell) => number;
}

/**
 * Plans a preset stamp.
 *
 * Cells are visited in design order. A cell that is out of bounds is recorded in
 * `outOfBounds` and never written; a cell that is occupied is written only when
 * `placeMode` is `replace`.
 */
export function planApplyPreset(
  design: PresetDesign,
  options: ApplyPresetOptions,
): ApplyPresetResult {
  const writes: PresetWrite[] = [];
  const outOfBounds: VoxelCell[] = [];
  const skipped: VoxelCell[] = [];

  for (const block of design.blocks) {
    const cell: VoxelCell = {
      x: options.origin.x + block.x,
      y: options.origin.y + block.y,
      z: options.origin.z + block.z,
    };

    const check = checkPlacement(options.bounds, cell);
    if (!check.ok) {
      outOfBounds.push(cell);
      continue;
    }

    const occupied = options.readBlock(cell) !== 0;
    if (!shouldWritePlacement(options.placeMode, occupied)) {
      skipped.push(cell);
      continue;
    }

    writes.push({ x: cell.x, y: cell.y, z: cell.z, blockId: block.blockId });
  }

  return { writes, outOfBounds, skipped };
}

/** Convenience: the block ids a design uses, de-duplicated. */
export function designBlockIds(design: PresetDesign): number[] {
  const seen = new Set<number>();
  for (const block of design.blocks) seen.add(block.blockId);
  return [...seen];
}

/** Convenience: total voxel count of a design. */
export function designBlockCount(design: PresetDesign): number {
  return design.blocks.length;
}

/** Convenience: the design's blocks as plain cells, ignoring block ids. */
export function designCells(design: PresetDesign): VoxelCell[] {
  return design.blocks.map((block: PresetBlock) => ({ x: block.x, y: block.y, z: block.z }));
}