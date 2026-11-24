/**
 * Layer 1 — greedy meshing.
 *
 * The engine's `VoxelMeshNode` merges coplanar faces of the same material into
 * larger quads. The user's build system does not need merging (each block keeps
 * its own texture), but the merge algorithm is still the reference for "which
 * faces exist", so it is reimplemented here and pinned by tests.
 *
 * A merged quad is described by its origin, its two in-plane extents and the
 * face direction. Tests assert on quad counts and total covered area rather than
 * on vertex buffers, which keeps them readable.
 */

import { assertDeepEqual, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { createVolume, setVoxel, type FaceDirection, type VoxelVolume } from '../../src/voxel/mesher.js';

export interface GreedyQuad {
  /** Minimum voxel coordinate of the quad, in voxel units. */
  origin: readonly [number, number, number];
  /** Extent along the first in-plane axis. */
  width: number;
  /** Extent along the second in-plane axis. */
  height: number;
  direction: FaceDirection;
  /** Voxel id shared by every cell of the quad. */
  id: number;
}

const AXIS_OF: Record<FaceDirection, 0 | 1 | 2> = {
  east: 0,
  west: 0,
  up: 1,
  down: 1,
  south: 2,
  north: 2,
};

const SIGN_OF: Record<FaceDirection, 1 | -1> = {
  east: 1,
  west: -1,
  up: 1,
  down: -1,
  south: 1,
  north: -1,
};

function sample(volume: VoxelVolume, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0 || x >= volume.sizeX || y >= volume.sizeY || z >= volume.sizeZ) return 0;
  return volume.voxels[x + volume.sizeX * (y + volume.sizeY * z)];
}

/**
 * Greedy-meshes a volume into merged quads.
 *
 * Mirrors the engine's algorithm: for each of the three axes, walk the slices
 * and build a mask of exposed faces, then grow each mask cell into the largest
 * rectangle of identical voxel id.
 */
export function greedyMesh(volume: VoxelVolume): GreedyQuad[] {
  const quads: GreedyQuad[] = [];
  const dims = [volume.sizeX, volume.sizeY, volume.sizeZ] as const;
  const coord = [0, 0, 0];
  const step = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    step[0] = step[1] = step[2] = 0;
    step[d] = 1;

    const mask = new Int32Array(dims[u] * dims[v]);

    for (coord[d] = -1; coord[d] < dims[d]; coord[d]++) {
      let m = 0;
      for (coord[v] = 0; coord[v] < dims[v]; coord[v]++) {
        for (coord[u] = 0; coord[u] < dims[u]; coord[u]++, m++) {
          const a = sample(volume, coord[0], coord[1], coord[2]);
          coord[d] += 1;
          const b = sample(volume, coord[0], coord[1], coord[2]);
          coord[d] -= 1;
          mask[m] = a && b ? 0 : a ? a : -b;
        }
      }

      for (let j = 0; j < dims[v]; j++) {
        for (let i = 0; i < dims[u]; ) {
          const c = mask[j * dims[u] + i];
          if (!c) {
            i++;
            continue;
          }

          let w = 1;
          while (i + w < dims[u] && mask[j * dims[u] + i + w] === c) w++;

          let h = 1;
          grow: for (; j + h < dims[v]; h++) {
            for (let k = 0; k < w; k++) {
              if (mask[(j + h) * dims[u] + i + k] !== c) break grow;
            }
          }

          for (let jj = 0; jj < h; jj++) {
            for (let ii = 0; ii < w; ii++) {
              mask[(j + jj) * dims[u] + i + ii] = 0;
            }
          }

          const origin: [number, number, number] = [coord[0], coord[1], coord[2]];
          origin[u] = i;
          origin[v] = j;
          // The mask sits on the boundary between slice coord[d] and coord[d] + 1.
          origin[d] = coord[d] + 1;

          const direction = directionFor(d, c > 0);
          quads.push({ origin, width: w, height: h, direction, id: Math.abs(c) });

          i += w;
        }
      }
    }
  }

  return quads;
}

function directionFor(axis: number, positive: boolean): FaceDirection {
  if (axis === 0) return positive ? 'east' : 'west';
  if (axis === 1) return positive ? 'up' : 'down';
  return positive ? 'south' : 'north';
}

/** Total surface area covered by the quads, in voxel faces. */
export function totalQuadArea(quads: readonly GreedyQuad[]): number {
  return quads.reduce((sum, quad) => sum + quad.width * quad.height, 0);
}

/** Groups quads by face direction. */
export function quadsByDirection(quads: readonly GreedyQuad[]): Record<FaceDirection, GreedyQuad[]> {
  const grouped: Record<FaceDirection, GreedyQuad[]> = {
    east: [],
    west: [],
    up: [],
    down: [],
    south: [],
    north: [],
  };
  for (const quad of quads) grouped[quad.direction].push(quad);
  return grouped;
}

function fill(volume: VoxelVolume, id: number): void {
  volume.voxels.fill(id);
}

describe('greedyMesh: single voxel', () => {
  it('produces six quads of area 1', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, 1);

    const quads = greedyMesh(volume);
    assertEqual(quads.length, 6, 'one quad per face');
    assertEqual(totalQuadArea(quads), 6, 'each quad covers one voxel face');
    for (const quad of quads) {
      assertEqual(quad.width, 1);
      assertEqual(quad.height, 1);
    }
  });

  it('assigns one quad to each direction', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, 1);

    const grouped = quadsByDirection(greedyMesh(volume));
    for (const [direction, quads] of Object.entries(grouped)) {
      assertEqual(quads.length, 1, `${direction} should have exactly one quad`);
    }
  });
});

describe('greedyMesh: merging', () => {
  it('merges a flat 4x4 slab into one quad per side', () => {
    const volume = createVolume(4, 1, 4);
    fill(volume, 1);

    const quads = greedyMesh(volume);
    // Top and bottom merge to 4x4; the four sides merge to 4x1 each.
    assertEqual(quads.length, 6, 'a flat slab still has six sides');
    assertEqual(totalQuadArea(quads), 4 * 4 * 2 + 4 * 1 * 4, 'area equals the slab surface');
  });

  it('merges the top face of a solid cube into a single quad', () => {
    const volume = createVolume(4, 4, 4);
    fill(volume, 1);

    const grouped = quadsByDirection(greedyMesh(volume));
    assertEqual(grouped.up.length, 1, 'the top face merges into one quad');
    assertEqual(grouped.up[0].width, 4);
    assertEqual(grouped.up[0].height, 4);
    assertEqual(grouped.down.length, 1, 'the bottom face merges into one quad');
  });

  it('does not merge across different voxel ids', () => {
    const volume = createVolume(2, 1, 1);
    setVoxel(volume, 0, 0, 0, 1);
    setVoxel(volume, 1, 0, 0, 2);

    const grouped = quadsByDirection(greedyMesh(volume));
    assertEqual(grouped.up.length, 2, 'different materials stay separate');
    assertDeepEqual(
      grouped.up.map((quad) => quad.id).sort(),
      [1, 2],
      'both materials are represented',
    );
  });

  it('does not merge across a gap', () => {
    const volume = createVolume(3, 1, 1);
    setVoxel(volume, 0, 0, 0, 1);
    setVoxel(volume, 2, 0, 0, 1);

    const grouped = quadsByDirection(greedyMesh(volume));
    assertEqual(grouped.up.length, 2, 'the empty middle cell breaks the run');
  });
});

describe('greedyMesh: interior faces', () => {
  it('emits no interior quads for a solid cube', () => {
    const volume = createVolume(3, 3, 3);
    fill(volume, 1);

    const quads = greedyMesh(volume);
    // Six sides, each merged into a single 3x3 quad.
    assertEqual(quads.length, 6, 'a solid cube meshes to six quads');
    assertEqual(totalQuadArea(quads), 54, 'surface area of a 3x3x3 cube is 54');
  });

  it('emits inner quads for a hollow shell', () => {
    const volume = createVolume(3, 3, 3);
    for (let z = 0; z < 3; z++) {
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          const isShell = x === 0 || y === 0 || z === 0 || x === 2 || y === 2 || z === 2;
          if (isShell) setVoxel(volume, x, y, z, 1);
        }
      }
    }

    const quads = greedyMesh(volume);
    assertEqual(totalQuadArea(quads), 60, 'outer 54 plus inner 6');
  });

  it('produces no quads for an empty volume', () => {
    const volume = createVolume(4, 4, 4);
    assertEqual(greedyMesh(volume).length, 0);
  });
});

describe('greedyMesh: quad placement', () => {
  it('places the top quad at y = 1 for a single voxel at y = 0', () => {
    const volume = createVolume(1, 1, 1);
    setVoxel(volume, 0, 0, 0, 1);

    const grouped = quadsByDirection(greedyMesh(volume));
    assertEqual(grouped.up[0].origin[1], 1, 'the top face sits on the upper boundary');
    assertEqual(grouped.down[0].origin[1], 0, 'the bottom face sits on the lower boundary');
  });

  it('places the east quad at x = 1 for a single voxel at x = 0', () => {
    const volume = createVolume(1, 1, 1);
    setVoxel(volume, 0, 0, 0, 1);

    const grouped = quadsByDirection(greedyMesh(volume));
    assertEqual(grouped.east[0].origin[0], 1);
    assertEqual(grouped.west[0].origin[0], 0);
  });

  it('keeps quad origins inside the volume bounds', () => {
    const volume = createVolume(4, 4, 4);
    fill(volume, 1);

    for (const quad of greedyMesh(volume)) {
      const axis = AXIS_OF[quad.direction];
      const sign = SIGN_OF[quad.direction];
      const boundary = sign > 0 ? 4 : 0;
      assertEqual(quad.origin[axis], boundary, `${quad.direction} quad should sit on the boundary`);
      assertTrue(quad.width > 0 && quad.height > 0, 'quads must have positive extent');
    }
  });
});