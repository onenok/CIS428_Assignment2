/**
 * Isometric block icons for the hotbar.
 *
 * The hotbar used to render nothing but the block name, which overflowed its
 * 56px slot and was not centred. A real texture would be the obvious fix, but
 * the hotbar is DOM and the textures are `THREE.Texture`s — binding one to a
 * slot means a canvas readback per slot.
 *
 * Instead the icon is derived from the same colour table the placeholder
 * textures use (`PLACEHOLDER_SPECS`), so the hotbar cannot drift from the world:
 * change a block's base colour and both the texture and the icon move together.
 *
 * The three visible faces of a cube get the conventional isometric shading —
 * top brightest, left mid, right darkest — which is what makes a flat colour
 * read as a cube rather than as a swatch.
 */

import { BLOCK_GLASS } from '../voxel/blockIds.js';
import { faceMaterialsFor } from '../voxel/materialMap.js';
import { PLACEHOLDER_SPECS } from '../voxel/placeholderTexture.js';

/** Edge length of an icon, in CSS pixels. */
export const BLOCK_ICON_SIZE = 32;

/** Face indices into `BLOCK_FACE_MATERIALS`, in `FACE_DIRECTIONS` order. */
const FACE_UP = 2;
const FACE_EAST = 0;
const FACE_NORTH = 5;

/**
 * Brightness multiplier per visible face.
 *
 * Chosen so the three faces stay distinguishable for near-grey blocks: a stone
 * cube with equal faces is unreadable at 32px.
 */
export const BLOCK_ICON_SHADE = {
  top: 1.15,
  left: 0.8,
  right: 0.62,
} as const;

/** Opacity used for translucent blocks so glass does not look like stone. */
export const BLOCK_ICON_TRANSPARENT_OPACITY = 0.55;

/** Fallback colour when a material key has no placeholder spec. */
const FALLBACK_RGB: readonly [number, number, number] = [255, 0, 255];

export interface BlockIconColors {
  readonly top: string;
  readonly left: string;
  readonly right: string;
  /** `1` for opaque blocks, {@link BLOCK_ICON_TRANSPARENT_OPACITY} for glass. */
  readonly opacity: number;
}

/** Base RGB for a material key, falling back to magenta (the "missing" colour). */
export function materialBaseRgb(materialKey: string): readonly [number, number, number] {
  return PLACEHOLDER_SPECS[materialKey]?.base ?? FALLBACK_RGB;
}

/** Multiplies an RGB triple by `factor` and clamps to 0..255. */
export function shadeRgb(rgb: readonly [number, number, number], factor: number): string {
  const channel = (value: number): number => Math.max(0, Math.min(255, Math.round(value * factor)));
  return `rgb(${channel(rgb[0])}, ${channel(rgb[1])}, ${channel(rgb[2])})`;
}

/** The three face colours a block icon is drawn from. */
export function blockIconColors(blockId: number): BlockIconColors {
  const materials = faceMaterialsFor(blockId);

  return {
    top: shadeRgb(materialBaseRgb(materials[FACE_UP]), BLOCK_ICON_SHADE.top),
    left: shadeRgb(materialBaseRgb(materials[FACE_NORTH]), BLOCK_ICON_SHADE.left),
    right: shadeRgb(materialBaseRgb(materials[FACE_EAST]), BLOCK_ICON_SHADE.right),
    opacity: blockId === BLOCK_GLASS ? BLOCK_ICON_TRANSPARENT_OPACITY : 1,
  };
}

/**
 * The icon as a standalone SVG string.
 *
 * Hexagon outline split into three quads: a diamond top face and two
 * parallelogram sides. The numbers are a 32x32 grid, so the shape scales by
 * changing the wrapper's width/height rather than the path data.
 */
export function blockIconSvg(blockId: number): string {
  const { top, left, right, opacity } = blockIconColors(blockId);

  return [
    `<svg viewBox="0 0 ${BLOCK_ICON_SIZE} ${BLOCK_ICON_SIZE}" width="${BLOCK_ICON_SIZE}" height="${BLOCK_ICON_SIZE}"`,
    ` xmlns="http://www.w3.org/2000/svg" opacity="${opacity}" shape-rendering="crispEdges">`,
    `<polygon points="16,0 32,8 16,16 0,8" fill="${top}" />`,
    `<polygon points="0,8 16,16 16,32 0,24" fill="${left}" />`,
    `<polygon points="32,8 16,16 16,32 32,24" fill="${right}" />`,
    '</svg>',
  ].join('');
}