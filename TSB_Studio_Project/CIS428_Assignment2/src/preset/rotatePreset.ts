/**
 * Preset transforms.
 *
 * A preset can be moved and rotated as a whole before it is stamped. Rotation is
 * restricted to multiples of 90 degrees around the Y axis, which keeps every
 * voxel on the integer grid and makes the transform exactly reversible.
 *
 * Rotation direction is CLOCKWISE when viewed from above (+Y looking down),
 * which maps (x, z) -> (-z, x). After rotating, the design is re-normalised so
 * its minimum corner is back at the origin; otherwise a rotated design would
 * drift away from the cursor.
 */

import type { PresetBlock, PresetDesign } from './PresetLibrary.js';

/** A whole-design offset in voxels. */
export interface PresetOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Rotation steps around Y, in multiples of 90 degrees clockwise. */
export type RotationSteps = 0 | 1 | 2 | 3;

/** Translates every block by the given offset. */
export function translateBlocks(
  blocks: readonly PresetBlock[],
  offset: PresetOffset,
): PresetBlock[] {
  return blocks.map((block) => ({
    x: block.x + offset.x,
    y: block.y + offset.y,
    z: block.z + offset.z,
    blockId: block.blockId,
  }));
}

/**
 * Rotates one block clockwise around the Y axis by `steps` quarter turns.
 *
 * The pivot is the origin, so the result may have negative coordinates; callers
 * normally follow up with {@link normalizeBlocks}.
 */
export function rotateBlock(block: PresetBlock, steps: RotationSteps): PresetBlock {
  let { x, z } = block;
  for (let i = 0; i < steps; i++) {
    const nextX = -z;
    const nextZ = x;
    x = nextX;
    z = nextZ;
  }
  return { x, y: block.y, z, blockId: block.blockId };
}

/** Rotates every block clockwise by `steps` quarter turns. */
export function rotateBlocks(blocks: readonly PresetBlock[], steps: RotationSteps): PresetBlock[] {
  return blocks.map((block) => rotateBlock(block, steps));
}

/** Shifts a block list so its minimum corner sits at the origin. */
export function normalizeBlocks(blocks: readonly PresetBlock[]): PresetBlock[] {
  if (blocks.length === 0) return [];

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  for (const block of blocks) {
    if (block.x < minX) minX = block.x;
    if (block.y < minY) minY = block.y;
    if (block.z < minZ) minZ = block.z;
  }

  return blocks.map((block) => ({
    x: block.x - minX,
    y: block.y - minY,
    z: block.z - minZ,
    blockId: block.blockId,
  }));
}

/** Rotates a design clockwise and re-normalises it. */
export function rotateDesign(design: PresetDesign, steps: RotationSteps): PresetDesign {
  return {
    ...design,
    blocks: normalizeBlocks(rotateBlocks(design.blocks, steps)),
  };
}

/** Translates a design without re-normalising (offsets are intentional). */
export function translateDesign(design: PresetDesign, offset: PresetOffset): PresetDesign {
  return {
    ...design,
    blocks: translateBlocks(design.blocks, offset),
  };
}

/** Axis-aligned size of a block list, in voxels. */
export function designSize(blocks: readonly PresetBlock[]): { x: number; y: number; z: number } {
  if (blocks.length === 0) return { x: 0, y: 0, z: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const block of blocks) {
    if (block.x < minX) minX = block.x;
    if (block.y < minY) minY = block.y;
    if (block.z < minZ) minZ = block.z;
    if (block.x > maxX) maxX = block.x;
    if (block.y > maxY) maxY = block.y;
    if (block.z > maxZ) maxZ = block.z;
  }

  return { x: maxX - minX + 1, y: maxY - minY + 1, z: maxZ - minZ + 1 };
}