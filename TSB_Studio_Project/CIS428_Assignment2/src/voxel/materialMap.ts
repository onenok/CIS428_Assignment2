/**
 * Block -> material mapping.
 *
 * Each block face points at a *material key* (a string), not at a texture path.
 * The chunk mesher turns keys into material slots, and identical keys share one
 * slot. That is what keeps the draw-call count down: nine blocks with six faces
 * each would be 54 textures, but most blocks reuse the same texture on all six
 * faces, so the real slot count is far lower.
 *
 * Face order used everywhere in this project:
 *   [east, west, up, down, south, north]
 * which matches `FACE_DIRECTIONS` in `mesher.ts`.
 */

import {
  BLOCK_BEDROCK,
  BLOCK_BRICKS,
  BLOCK_COBBLESTONE,
  BLOCK_DIRT,
  BLOCK_GLASS,
  BLOCK_GRASS,
  BLOCK_OAK_LOG,
  BLOCK_OAK_PLANKS,
  BLOCK_SAND,
  BLOCK_STONE,
  PLACEABLE_BLOCKS,
} from './blockIds.js';

/** A material key. Resolved to a texture path by `materialTextures.ts`. */
export type MaterialKey = string;

/** Six material keys, one per face, in `FACE_DIRECTIONS` order. */
export type BlockFaceMaterials = readonly [
  MaterialKey,
  MaterialKey,
  MaterialKey,
  MaterialKey,
  MaterialKey,
  MaterialKey,
];

/** Material keys used by the palette. */
export const MATERIAL_GRASS_TOP = 'grass_top';
export const MATERIAL_GRASS_SIDE = 'grass_side';
export const MATERIAL_DIRT = 'dirt';
export const MATERIAL_STONE = 'stone';
export const MATERIAL_COBBLESTONE = 'cobblestone';
export const MATERIAL_OAK_PLANKS = 'oak_planks';
export const MATERIAL_OAK_LOG_SIDE = 'oak_log_side';
export const MATERIAL_OAK_LOG_TOP = 'oak_log_top';
export const MATERIAL_SAND = 'sand';
export const MATERIAL_GLASS = 'glass';
export const MATERIAL_BRICKS = 'bricks';

/**
 * Per-block face materials.
 *
 * Blocks that look the same from every side repeat one key six times; only grass
 * and oak log need distinct top/side textures.
 */
export const BLOCK_FACE_MATERIALS: Readonly<Record<number, BlockFaceMaterials>> = {
  [BLOCK_GRASS]: [
    MATERIAL_GRASS_SIDE,
    MATERIAL_GRASS_SIDE,
    MATERIAL_GRASS_TOP,
    MATERIAL_DIRT,
    MATERIAL_GRASS_SIDE,
    MATERIAL_GRASS_SIDE,
  ],
  [BLOCK_DIRT]: [MATERIAL_DIRT, MATERIAL_DIRT, MATERIAL_DIRT, MATERIAL_DIRT, MATERIAL_DIRT, MATERIAL_DIRT],
  [BLOCK_STONE]: [MATERIAL_STONE, MATERIAL_STONE, MATERIAL_STONE, MATERIAL_STONE, MATERIAL_STONE, MATERIAL_STONE],
  [BLOCK_COBBLESTONE]: [
    MATERIAL_COBBLESTONE,
    MATERIAL_COBBLESTONE,
    MATERIAL_COBBLESTONE,
    MATERIAL_COBBLESTONE,
    MATERIAL_COBBLESTONE,
    MATERIAL_COBBLESTONE,
  ],
  [BLOCK_OAK_PLANKS]: [
    MATERIAL_OAK_PLANKS,
    MATERIAL_OAK_PLANKS,
    MATERIAL_OAK_PLANKS,
    MATERIAL_OAK_PLANKS,
    MATERIAL_OAK_PLANKS,
    MATERIAL_OAK_PLANKS,
  ],
  [BLOCK_OAK_LOG]: [
    MATERIAL_OAK_LOG_SIDE,
    MATERIAL_OAK_LOG_SIDE,
    MATERIAL_OAK_LOG_TOP,
    MATERIAL_OAK_LOG_TOP,
    MATERIAL_OAK_LOG_SIDE,
    MATERIAL_OAK_LOG_SIDE,
  ],
  [BLOCK_SAND]: [MATERIAL_SAND, MATERIAL_SAND, MATERIAL_SAND, MATERIAL_SAND, MATERIAL_SAND, MATERIAL_SAND],
  [BLOCK_GLASS]: [MATERIAL_GLASS, MATERIAL_GLASS, MATERIAL_GLASS, MATERIAL_GLASS, MATERIAL_GLASS, MATERIAL_GLASS],
  [BLOCK_BRICKS]: [MATERIAL_BRICKS, MATERIAL_BRICKS, MATERIAL_BRICKS, MATERIAL_BRICKS, MATERIAL_BRICKS, MATERIAL_BRICKS],
    // Bedrock reuses the stone texture: it has to resolve to a slot that already
    // exists in the palette, and a darker rock face would need a new slot that
    // the palette-driven slot map never assigns. Listed explicitly so the
    // intent is visible even though the stone fallback would cover it.
    [BLOCK_BEDROCK]: [MATERIAL_STONE, MATERIAL_STONE, MATERIAL_STONE, MATERIAL_STONE, MATERIAL_STONE, MATERIAL_STONE],
};

/** Face materials for a block id. Unknown ids fall back to stone. */
export function faceMaterialsFor(blockId: number): BlockFaceMaterials {
  return BLOCK_FACE_MATERIALS[blockId] ?? BLOCK_FACE_MATERIALS[BLOCK_STONE];
}

/**
 * Builds the material-key -> slot-index map for the whole palette.
 *
 * Slot indices are assigned in first-seen order, which keeps them stable across
 * runs and makes the resulting geometry groups deterministic.
 */
export function buildMaterialSlotMap(
  blockIds: readonly number[] = PLACEABLE_BLOCKS,
): Map<MaterialKey, number> {
  const slots = new Map<MaterialKey, number>();
  for (const blockId of blockIds) {
    for (const key of faceMaterialsFor(blockId)) {
      if (!slots.has(key)) slots.set(key, slots.size);
    }
  }
  return slots;
}

/** Material key -> slot index for the default palette. */
export const MATERIAL_SLOTS: ReadonlyMap<MaterialKey, number> = buildMaterialSlotMap();

/** Number of distinct material slots the default palette needs. */
export const MATERIAL_SLOT_COUNT = MATERIAL_SLOTS.size;

/** Slot index for a material key, or -1 when the key is not in the palette. */
export function slotForMaterial(key: MaterialKey): number {
  return MATERIAL_SLOTS.get(key) ?? -1;
}

/**
 * Slot index -> material key, indexed by slot.
 *
 * The inverse of {@link MATERIAL_SLOTS}. `buildChunkMaterials()` needs to look up
 * a texture *by slot*, and the forward map only answers the other direction.
 */
export const SLOT_MATERIALS: readonly MaterialKey[] = buildSlotMaterialList();

function buildSlotMaterialList(): MaterialKey[] {
  const list: MaterialKey[] = new Array(MATERIAL_SLOT_COUNT).fill('');
  for (const [key, slot] of MATERIAL_SLOTS) {
    list[slot] = key;
  }
  return list;
}

/** Material key for a slot index, or `null` when the slot is out of range. */
export function materialForSlot(slot: number): MaterialKey | null {
  return SLOT_MATERIALS[slot] ?? null;
}

/** Slot index for one face of a block. */
export function slotForFace(blockId: number, faceIndex: number): number {
  const materials = faceMaterialsFor(blockId);
  return slotForMaterial(materials[faceIndex] ?? materials[0]);
}