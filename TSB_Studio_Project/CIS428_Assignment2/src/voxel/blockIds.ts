/**
 * Block id table.
 *
 * Ids are stable integers stored in the chunk's `Uint16Array`. 0 is reserved for
 * air so a freshly allocated array is already an empty chunk.
 *
 * The nine buildable blocks match the palette shown in the hotbar. Ids are
 * grouped by material family so the material-slot dedup in `materialMap.ts`
 * stays readable.
 */

/** Air. Never rendered, never collides. */
export const BLOCK_AIR = 0;

/** Grass: green top, dirt sides and bottom. */
export const BLOCK_GRASS = 1;

/** Dirt: brown on all six faces. */
export const BLOCK_DIRT = 2;

/** Stone: grey on all six faces. */
export const BLOCK_STONE = 3;

/** Cobblestone: darker, mottled grey. */
export const BLOCK_COBBLESTONE = 4;

/** Oak planks: warm wood, horizontal grain. */
export const BLOCK_OAK_PLANKS = 5;

/** Oak log: bark on the sides, rings on top and bottom. */
export const BLOCK_OAK_LOG = 6;

/** Sand: pale yellow. */
export const BLOCK_SAND = 7;

/** Glass: transparent. */
export const BLOCK_GLASS = 8;

/** Bricks: red with mortar lines. */
export const BLOCK_BRICKS = 9;

/**
 * Bedrock: the unbreakable floor of the central pit.
 *
 * Deliberately *not* in {@link PLACEABLE_BLOCKS} — it is generated, never held
 * in the hotbar. Both the break path and the place path refuse it, so it cannot
 * be removed or overwritten from any direction.
 */
export const BLOCK_BEDROCK = 10;

/** Every block the player can place, in hotbar order. */
export const PLACEABLE_BLOCKS: readonly number[] = [
  BLOCK_GRASS,
  BLOCK_DIRT,
  BLOCK_STONE,
  BLOCK_COBBLESTONE,
  BLOCK_OAK_PLANKS,
  BLOCK_OAK_LOG,
  BLOCK_SAND,
  BLOCK_GLASS,
  BLOCK_BRICKS,
];

/** Human-readable names, indexed by block id. */
export const BLOCK_NAMES: Readonly<Record<number, string>> = {
  [BLOCK_AIR]: 'Air',
  [BLOCK_GRASS]: 'Grass',
  [BLOCK_DIRT]: 'Dirt',
  [BLOCK_STONE]: 'Stone',
  [BLOCK_COBBLESTONE]: 'Cobblestone',
  [BLOCK_OAK_PLANKS]: 'Oak Planks',
  [BLOCK_OAK_LOG]: 'Oak Log',
  [BLOCK_SAND]: 'Sand',
  [BLOCK_GLASS]: 'Glass',
  [BLOCK_BRICKS]: 'Bricks',
    [BLOCK_BEDROCK]: 'Bedrock',
};

/** True when the id is a block the player may place. */
export function isPlaceableBlock(blockId: number): boolean {
  return PLACEABLE_BLOCKS.includes(blockId);
}

  /**
   * True when the id is immune to edits.
   *
   * A protected block can be neither removed by breaking nor overwritten by
   * placing. Air is *not* protected: an empty cell is free to fill.
   */
  export function isProtectedBlock(blockId: number): boolean {
    return blockId === BLOCK_BEDROCK;
  }

  /** True when the id may be removed or overwritten. The inverse of {@link isProtectedBlock}. */
  export function isBreakableBlock(blockId: number): boolean {
    return !isProtectedBlock(blockId);
  }

/** Name for a block id, falling back to `Unknown(<id>)`. */
export function blockName(blockId: number): string {
  return BLOCK_NAMES[blockId] ?? `Unknown(${blockId})`;
}