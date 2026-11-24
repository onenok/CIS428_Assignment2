/**
 * Layer 1 — chunk geometry construction.
 *
 * Covers U-V-09 (position / normal / uv / index), U-V-10 (material groups) and
 * U-V-11 (slot mapping).
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import * as THREE from 'three';
import { BLOCK_GRASS, BLOCK_STONE } from '../../src/voxel/blockIds.js';
import { buildChunkGeometry, measureQuadExtents, measureUvRange } from '../../src/voxel/chunkGeometry.js';
import { MATERIAL_SLOT_COUNT, slotForFace } from '../../src/voxel/materialMap.js';
import { createVolume, setVoxel } from '../../src/voxel/mesher.js';

describe('chunkGeometry: single voxel', () => {
  it('emits six faces for an isolated voxel', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_STONE);
    const result = buildChunkGeometry(volume);
    assertEqual(result.faceCount, 6);
  });

  it('emits 24 vertices and 36 indices', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_STONE);
    const { geometry } = buildChunkGeometry(volume);
    assertEqual(geometry.getAttribute('position').count, 24);
    assertEqual(geometry.getIndex()!.count, 36);
  });

  it('has one normal per vertex', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_STONE);
    const { geometry } = buildChunkGeometry(volume);
    assertEqual(geometry.getAttribute('normal').count, 24);
  });

  it('has one uv per vertex', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_STONE);
    const { geometry } = buildChunkGeometry(volume);
    assertEqual(geometry.getAttribute('uv').count, 24);
  });

  it('produces unit-length normals', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_STONE);
    const normals = buildChunkGeometry(volume).geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) {
      const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
      assertTrue(Math.abs(length - 1) < 1e-6, `normal ${i} should be unit length`);
    }
  });

  it('places vertices on the voxel bounds', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_STONE);
    const positions = buildChunkGeometry(volume).geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      assertTrue(x === 1 || x === 2, `x ${x} should be a voxel bound`);
      assertTrue(y === 1 || y === 2, `y ${y} should be a voxel bound`);
      assertTrue(z === 1 || z === 2, `z ${z} should be a voxel bound`);
    }
  });

  it('applies the origin offset', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_STONE);
    const positions = buildChunkGeometry(volume, { x: 10, y: 20, z: 30 }).geometry.getAttribute('position');
    let minX = Infinity;
    for (let i = 0; i < positions.count; i++) minX = Math.min(minX, positions.getX(i));
    assertEqual(minX, 11);
  });
});

describe('chunkGeometry: face culling', () => {
  it('emits no interior faces for two adjacent voxels', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_STONE);
    setVoxel(volume, 2, 1, 1, BLOCK_STONE);
    const result = buildChunkGeometry(volume);
    assertEqual(result.faceCount, 10);
  });

  it('emits nothing for an empty volume', () => {
    const volume = createVolume(3, 3, 3);
    const result = buildChunkGeometry(volume);
    assertEqual(result.faceCount, 0);
    assertEqual(result.groups.length, 0);
  });

  it('emits only the outer shell for a solid 3x3x3 block', () => {
    const volume = createVolume(3, 3, 3);
    for (let z = 0; z < 3; z++) {
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) setVoxel(volume, x, y, z, BLOCK_STONE);
      }
    }
    assertEqual(buildChunkGeometry(volume).faceCount, 54);
  });
});

describe('chunkGeometry: material groups', () => {
  it('creates one group for a single-material block', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_STONE);
    const result = buildChunkGeometry(volume);
    assertEqual(result.groups.length, 1);
  });

  it('creates two groups for grass (top and side differ)', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_GRASS);
    const result = buildChunkGeometry(volume);
    assertTrue(result.groups.length >= 2, 'grass needs at least a top and a side material');
  });

  it('assigns groups in ascending slot order', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_GRASS);
    const slots = buildChunkGeometry(volume).groups.map((g) => g.slot);
    for (let i = 1; i < slots.length; i++) {
      assertTrue(slots[i] > slots[i - 1], 'slots should ascend');
    }
  });

  it('covers every index exactly once', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_GRASS);
    const result = buildChunkGeometry(volume);
    const total = result.groups.reduce((sum, g) => sum + g.count, 0);
    assertEqual(total, result.geometry.getIndex()!.count);
  });

  it('uses valid slot indices', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_GRASS);
    for (const group of buildChunkGeometry(volume).groups) {
      assertTrue(group.slot >= 0 && group.slot < MATERIAL_SLOT_COUNT, `slot ${group.slot} out of range`);
    }
  });

  it('maps the grass top face to the grass_top slot', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, BLOCK_GRASS);
    const slots = buildChunkGeometry(volume).groups.map((g) => g.slot);
    assertTrue(slots.includes(slotForFace(BLOCK_GRASS, 2)), 'up face slot should be present');
  });
});

  describe('chunkGeometry: chunk borders', () => {
    // Two chunks that both reach the border draw the same plane twice; the copies
    // are coplanar, so the depth buffer flickers between them along the whole seam.
    it('drops the face shared with a solid neighbour', () => {
      // The voxel sits on the +X border; every other face points into the volume,
      // so only the border face can be affected by the neighbour.
      const volume = createVolume(3, 3, 3);
      setVoxel(volume, 2, 1, 1, BLOCK_STONE);

      const isolated = buildChunkGeometry(volume).faceCount;
      const withSolidNeighbor = buildChunkGeometry(volume, { x: 0, y: 0, z: 0 }, () => BLOCK_STONE).faceCount;

      assertEqual(isolated - withSolidNeighbor, 1, 'exactly the shared face disappears');
    });

    it('keeps the face when the neighbour is air', () => {
      const volume = createVolume(2, 1, 1);
      setVoxel(volume, 1, 0, 0, BLOCK_STONE);

      assertEqual(
        buildChunkGeometry(volume, { x: 0, y: 0, z: 0 }, () => 0).faceCount,
        buildChunkGeometry(volume).faceCount,
        'air across the border changes nothing',
      );
    });

    it('never culls the top or bottom face of the chunk column', () => {
      const volume = createVolume(1, 3, 1);
      setVoxel(volume, 0, 1, 0, BLOCK_STONE);

      // A sampler that claims everything is solid must not swallow the sky faces:
      // the chunk spans the full world height, so nothing exists above or below it.
      const result = buildChunkGeometry(volume, { x: 0, y: 0, z: 0 }, () => BLOCK_STONE);
      assertEqual(result.faceCount, 2, 'only the up and down faces remain');
    });
  });

        // A face drawn with UVs past one tile shows the texture stretched over the whole
        // chunk, which reads as "the ground is a single flat colour".
        describe('chunkGeometry: uv range', () => {
          it('measures every quad as one full tile', () => {
            const volume = createVolume(2, 1, 2);
            setVoxel(volume, 0, 0, 0, BLOCK_STONE);
            setVoxel(volume, 1, 0, 1, BLOCK_STONE);

            const range = measureUvRange(buildChunkGeometry(volume).geometry);
            assertTrue(range !== null, 'uv attribute is present');
            assertEqual(range!.minU, 0);
            assertEqual(range!.maxU, 1);
            assertEqual(range!.minV, 0);
            assertEqual(range!.maxV, 1);
            assertEqual(range!.offTileQuads, 0);
          });

          it('reports quads whose uv was scaled past a tile', () => {
            const volume = createVolume(1, 1, 1);
            setVoxel(volume, 0, 0, 0, BLOCK_STONE);
            const geometry = buildChunkGeometry(volume).geometry;
            const uv = geometry.getAttribute('uv');
            for (let i = 0; i < uv.count; i++) {
              uv.setX(i, uv.getX(i) * 16);
            }

            const range = measureUvRange(geometry);
            assertEqual(range!.maxU, 16);
            assertEqual(range!.offTileQuads, 6, 'every one of the six faces is off-tile');
          });

          it('returns null for a geometry without uv data', () => {
            assertEqual(measureUvRange(new THREE.BufferGeometry()), null);
            assertEqual(measureUvRange(null), null);
          });
        });

        // A quad wider than one voxel is drawn as a smear that drags the texture with it.
        describe('chunkGeometry: quad extents', () => {
          it('measures every face as one voxel wide', () => {
            const volume = createVolume(2, 1, 2);
            setVoxel(volume, 0, 0, 0, BLOCK_STONE);
            setVoxel(volume, 1, 0, 1, BLOCK_STONE);

            const extents = measureQuadExtents(buildChunkGeometry(volume).geometry);
            assertTrue(extents !== null, 'position attribute is present');
            assertEqual(Math.round(extents!.minEdge * 100) / 100, 1);
            assertEqual(Math.round(extents!.maxEdge * 100) / 100, 1.41, 'the diagonal of a 1 m quad');
            assertEqual(extents!.stretchedQuads, 0);
          });

          it('flags a quad whose corners were pulled apart', () => {
            const volume = createVolume(2, 1, 2);
            setVoxel(volume, 0, 0, 0, BLOCK_STONE);
            const geometry = buildChunkGeometry(volume).geometry;
            const position = geometry.getAttribute('position');
            position.setX(1, position.getX(1) + 15);

            const extents = measureQuadExtents(geometry);
            assertTrue(extents!.maxEdge > 2, `max edge was ${extents!.maxEdge}`);
            assertTrue(extents!.stretchedQuads > 0, 'the widened quad is reported');
          });

          it('returns null for a geometry with too few vertices', () => {
            assertEqual(measureQuadExtents(new THREE.BufferGeometry()), null);
          });
        });