/**
 * Preset design library.
 *
 * A preset is a small voxel model the player can stamp into the world. Designs
 * are stored as sparse cell lists (not dense arrays) because most presets are
 * hollow shells and a dense 16x16x16 array per design would be wasteful.
 *
 * Coordinates inside a design are relative to its own origin, which is the
 * minimum corner of its bounding box. `applyPreset()` translates them to world
 * space.
 */

import type { VoxelCell } from '../build/placement.js';

/** One voxel inside a preset design. */
export interface PresetBlock extends VoxelCell {
  /** Block id from `blockIds.ts`. */
  readonly blockId: number;
}

/** A single stampable design. */
export interface PresetDesign {
  /** Stable identifier, unique across all categories. */
  readonly id: string;
  /** Display name shown on the design button. */
  readonly name: string;
  /** Category id this design belongs to. */
  readonly categoryId: string;
  /** Sparse voxel list, coordinates relative to the design origin. */
  readonly blocks: readonly PresetBlock[];
}

/** A group of designs shown on one tab. */
export interface PresetCategory {
  /** Stable identifier, unique across all categories. */
  readonly id: string;
  /** Display name shown on the tab button. */
  readonly name: string;
  /** Designs belonging to this category. */
  readonly designs: readonly PresetDesign[];
}

/** Id of the synthetic "show everything" tab. */
export const ALL_CATEGORY_ID = 'all';

/** Display name of the synthetic "show everything" tab. */
export const ALL_CATEGORY_NAME = 'All';

/** Builds a design from a compact block list. */
function design(
  id: string,
  name: string,
  categoryId: string,
  blocks: readonly PresetBlock[],
): PresetDesign {
  return { id, name, categoryId, blocks };
}

/** Builds a solid box of one block id, used to keep the sample data short. */
function box(
  blockId: number,
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0,
): PresetBlock[] {
  const blocks: PresetBlock[] = [];
  for (let z = 0; z < sizeZ; z++) {
    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        blocks.push({ x: x + offsetX, y: y + offsetY, z: z + offsetZ, blockId });
      }
    }
  }
  return blocks;
}

/**
 * Sample library.
 *
 * These are placeholder designs so the UI and the apply path can be built and
 * tested before the real models are authored. Each category has at least two
 * designs so the tab layout has something to lay out.
 */
export const PRESET_CATEGORIES: readonly PresetCategory[] = [
  {
    id: 'structure',
    name: 'Structures',
    designs: [
      design('structure-hut', 'Hut', 'structure', [
        ...box(5, 5, 1, 5),
        ...box(5, 3, 1, 1, 0, 1, 0),
        ...box(5, 3, 1, 1, 0, 1, 4),
        ...box(5, 1, 3, 1, 0, 1, 0),
        ...box(5, 1, 3, 1, 4, 1, 0),
      ]),
      design('structure-tower', 'Tower', 'structure', [
        ...box(4, 3, 8, 3),
        ...box(3, 5, 1, 5, -1, 8, -1),
      ]),
    ],
  },
  {
    id: 'furniture',
    name: 'Furniture',
    designs: [
      design('furniture-table', 'Table', 'furniture', [
        ...box(5, 3, 1, 3, 0, 2, 0),
        ...box(6, 1, 2, 1, 0, 0, 0),
        ...box(6, 1, 2, 1, 2, 0, 0),
        ...box(6, 1, 2, 1, 0, 0, 2),
        ...box(6, 1, 2, 1, 2, 0, 2),
      ]),
      design('furniture-chair', 'Chair', 'furniture', [
        ...box(5, 2, 1, 2, 0, 1, 0),
        ...box(5, 2, 2, 1, 0, 2, 0),
      ]),
    ],
  },
  {
    id: 'nature',
    name: 'Nature',
    designs: [
      design('nature-tree', 'Tree', 'nature', [
        ...box(6, 1, 4, 1),
        ...box(1, 5, 3, 5, -2, 4, -2),
      ]),
      design('nature-rock', 'Rock', 'nature', [
        ...box(3, 3, 2, 3),
        ...box(3, 1, 1, 1, 1, 2, 1),
      ]),
    ],
  },
];

/** Every design across every category, flattened. */
export function allDesigns(categories: readonly PresetCategory[] = PRESET_CATEGORIES): PresetDesign[] {
  const out: PresetDesign[] = [];
  for (const category of categories) out.push(...category.designs);
  return out;
}

/** Looks up a design by id. Returns `null` when not found. */
export function findDesign(
  designId: string,
  categories: readonly PresetCategory[] = PRESET_CATEGORIES,
): PresetDesign | null {
  for (const category of categories) {
    const found = category.designs.find((d) => d.id === designId);
    if (found) return found;
  }
  return null;
}

/**
 * Designs to show for a tab.
 *
 * The synthetic `all` tab returns every design; any other id returns that
 * category's designs, or an empty list when the id is unknown.
 */
export function designsForCategory(
  categoryId: string,
  categories: readonly PresetCategory[] = PRESET_CATEGORIES,
): readonly PresetDesign[] {
  if (categoryId === ALL_CATEGORY_ID) return allDesigns(categories);
  return categories.find((c) => c.id === categoryId)?.designs ?? [];
}

/** Tab list including the synthetic "all" tab first. */
export function categoryTabs(
  categories: readonly PresetCategory[] = PRESET_CATEGORIES,
): readonly { id: string; name: string }[] {
  return [
    { id: ALL_CATEGORY_ID, name: ALL_CATEGORY_NAME },
    ...categories.map((c) => ({ id: c.id, name: c.name })),
  ];
}