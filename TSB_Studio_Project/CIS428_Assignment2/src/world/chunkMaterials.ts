/**
 * Chunk material set for the playable world.
 *
 * `generateWorld()` needs one `THREE.Material` per palette slot, in slot order.
 * Building that array is a three-step job — make a placeholder texture per
 * material key, map slot -> key, then hand both to `buildChunkMaterials()` — and
 * both the game mode and the tests need the same result, so it lives here rather
 * than being duplicated.
 *
 * Glass is the only transparent slot: it is rendered with `transparent: true`
 * and a lower opacity so the player can see through a placed pane.
 */

import * as THREE from 'three';

import { buildChunkMaterials } from '../voxel/chunkGeometry.js';
import {
  BLOCK_FACE_MATERIALS,
  MATERIAL_GLASS,
  MATERIAL_SLOT_COUNT,
  MATERIAL_SLOTS,
  materialForSlot,
  slotForMaterial,
} from '../voxel/materialMap.js';
import { makePlaceholderTextureSet } from '../voxel/placeholderTexture.js';

/** Slots rendered with transparency. */
export const TRANSPARENT_SLOTS: ReadonlySet<number> = new Set(
  [slotForMaterial(MATERIAL_GLASS)].filter(slot => slot >= 0),
);

/** One placeholder texture per palette material key. */
export function makeChunkTextures(): Map<string, THREE.CanvasTexture> {
  // Placeholder textures are painted onto a DOM canvas, which does not exist in
  // the headless test environment. Falling back to an empty set keeps the
  // material array the right length (one entry per slot) with no texture bound.
  if (typeof document === 'undefined') {
    return new Map<string, THREE.CanvasTexture>();
  }
  return makePlaceholderTextureSet([...MATERIAL_SLOTS.keys()]);
}

/** The material array for a chunk, indexed by palette slot. */
export function makeChunkMaterials(
  textures: ReadonlyMap<string, THREE.Texture> = makeChunkTextures(),
): THREE.Material[] {
  return buildChunkMaterials(
    MATERIAL_SLOT_COUNT,
    slot => {
      const key = materialForSlot(slot);
      return key ? textures.get(key) ?? null : null;
    },
    { transparentSlots: TRANSPARENT_SLOTS },
  );
}

/**
 * Texture for one block's side face, for the placement preview.
 *
 * The preview is a single box, so it can only show one texture; the side face is
 * the one the player sees most of.
 */
export function textureForBlock(
  blockId: number,
  textures: ReadonlyMap<string, THREE.Texture>,
): THREE.Texture | null {
  const materials = BLOCK_FACE_MATERIALS[blockId];
  if (!materials) {
    return null;
  }
  return textures.get(materials[0]) ?? null;
}