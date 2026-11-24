/**
 * Layer 1 — block ids and material slot mapping.
 *
 * Covers U-M-01 (block id table), U-M-02 (block -> six face materials) and
 * U-M-06 (material slot dedup).
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import {
  BLOCK_AIR,
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
  blockName,
  isPlaceableBlock,
} from '../../src/voxel/blockIds.js';
import {
  BLOCK_FACE_MATERIALS,
  MATERIAL_DIRT,
  MATERIAL_GRASS_SIDE,
  MATERIAL_GRASS_TOP,
  MATERIAL_SLOTS,
  MATERIAL_SLOT_COUNT,
  buildMaterialSlotMap,
  faceMaterialsFor,
  slotForFace,
  slotForMaterial,
} from '../../src/voxel/materialMap.js';

describe('blockIds: table', () => {
  it('reserves 0 for air', () => {
    assertEqual(BLOCK_AIR, 0);
  });

  it('gives every placeable block a distinct non-zero id', () => {
    const ids = new Set(PLACEABLE_BLOCKS);
    assertEqual(ids.size, PLACEABLE_BLOCKS.length);
    assertTrue(!ids.has(BLOCK_AIR), 'air must not be placeable');
  });

  it('exposes nine placeable blocks', () => {
    assertEqual(PLACEABLE_BLOCKS.length, 9);
  });

  it('recognises placeable blocks', () => {
    assertTrue(isPlaceableBlock(BLOCK_GRASS));
    assertTrue(isPlaceableBlock(BLOCK_BRICKS));
    assertTrue(!isPlaceableBlock(BLOCK_AIR));
    assertTrue(!isPlaceableBlock(999));
  });

  it('names blocks', () => {
    assertEqual(blockName(BLOCK_GRASS), 'Grass');
    assertEqual(blockName(BLOCK_OAK_LOG), 'Oak Log');
    assertEqual(blockName(999), 'Unknown(999)');
  });
});

describe('materialMap: face materials', () => {
  it('gives every placeable block six faces', () => {
    for (const blockId of PLACEABLE_BLOCKS) {
      assertEqual(faceMaterialsFor(blockId).length, 6, `block ${blockId} should have 6 faces`);
    }
  });

  it('uses a distinct top for grass', () => {
    const faces = faceMaterialsFor(BLOCK_GRASS);
    assertEqual(faces[2], MATERIAL_GRASS_TOP, 'up face is grass top');
    assertEqual(faces[0], MATERIAL_GRASS_SIDE, 'east face is grass side');
    assertEqual(faces[3], MATERIAL_DIRT, 'down face is dirt');
  });

  it('uses a distinct top for oak log', () => {
    const faces = faceMaterialsFor(BLOCK_OAK_LOG);
    assertTrue(faces[2] !== faces[0], 'log top and side differ');
    assertEqual(faces[2], faces[3], 'log top and bottom match');
  });

  it('repeats one material for uniform blocks', () => {
    const faces = faceMaterialsFor(BLOCK_STONE);
    assertTrue(faces.every((f) => f === faces[0]), 'stone is uniform');
  });

  it('falls back to stone for unknown ids', () => {
    assertEqual(faceMaterialsFor(999)[0], faceMaterialsFor(BLOCK_STONE)[0]);
  });

  it('covers every placeable block', () => {
    for (const blockId of PLACEABLE_BLOCKS) {
      assertTrue(BLOCK_FACE_MATERIALS[blockId] != null, `missing entry for block ${blockId}`);
    }
  });
});

describe('materialMap: slot dedup', () => {
  it('collapses nine blocks into fewer slots', () => {
    assertTrue(MATERIAL_SLOT_COUNT < PLACEABLE_BLOCKS.length * 6, 'dedup must reduce the slot count');
  });

  it('needs exactly 11 slots for the default palette', () => {
      assertEqual(MATERIAL_SLOT_COUNT, 11);
  });

  it('assigns contiguous slot indices from 0', () => {
    const indices = [...MATERIAL_SLOTS.values()].sort((a, b) => a - b);
    for (let i = 0; i < indices.length; i++) assertEqual(indices[i], i);
  });

  it('is deterministic across rebuilds', () => {
    const rebuilt = buildMaterialSlotMap();
    assertEqual(rebuilt.size, MATERIAL_SLOTS.size);
    for (const [key, slot] of MATERIAL_SLOTS) {
      assertEqual(rebuilt.get(key), slot, `slot for ${key} should be stable`);
    }
  });

  it('shares one slot between faces of the same block', () => {
      assertEqual(slotForFace(BLOCK_DIRT, 0), slotForFace(BLOCK_DIRT, 5));
      assertEqual(slotForFace(BLOCK_STONE, 0), slotForFace(BLOCK_STONE, 3));
  });

    it('gives different blocks different slots', () => {
      assertTrue(slotForFace(BLOCK_STONE, 0) !== slotForFace(BLOCK_COBBLESTONE, 0), 'stone and cobblestone differ');
    });

  it('returns -1 for an unknown material key', () => {
    assertEqual(slotForMaterial('does_not_exist'), -1);
  });

  it('maps every face of every block to a valid slot', () => {
    for (const blockId of PLACEABLE_BLOCKS) {
      for (let face = 0; face < 6; face++) {
        const slot = slotForFace(blockId, face);
        assertTrue(slot >= 0 && slot < MATERIAL_SLOT_COUNT, `block ${blockId} face ${face} -> ${slot}`);
      }
    }
  });
});