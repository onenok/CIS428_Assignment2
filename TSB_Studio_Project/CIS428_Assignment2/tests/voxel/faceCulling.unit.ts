/**
 * Layer 1 — face culling.
 *
 * The whole point of the custom mesher is that interior faces are never
 * emitted. These tests pin that rule down so a future optimisation cannot
 * silently regress it.
 */

import { assertDeepEqual, assertEqual, assertFalse, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import {
  collectVisibleFaces,
  countSolidVoxels,
  countVisibleFaces,
  createVolume,
  FACE_DIRECTIONS,
  faceCorners,
  faceNormal,
  getVoxel,
  isFaceVisible,
  isInside,
  setVoxel,
  voxelIndex,
} from '../../src/voxel/mesher.js';

describe('face culling: single voxel', () => {
  it('exposes all six faces of an isolated voxel', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, 1);

    assertEqual(countVisibleFaces(volume), 6, 'an isolated voxel shows 6 faces');
    assertEqual(countSolidVoxels(volume), 1);
  });

  it('reports one face per direction', () => {
    const volume = createVolume(3, 3, 3);
    setVoxel(volume, 1, 1, 1, 1);

    const faces = collectVisibleFaces(volume);
    const directions = faces.map((face) => face.direction).sort();
    assertDeepEqual(directions, [...FACE_DIRECTIONS].sort());
  });
});

describe('face culling: adjacent voxels', () => {
  it('hides the shared face between two neighbours', () => {
    const volume = createVolume(3, 1, 1);
    setVoxel(volume, 0, 0, 0, 1);
    setVoxel(volume, 1, 0, 0, 1);

    // 12 faces minus the 2 that touch each other.
    assertEqual(countVisibleFaces(volume), 10, 'the touching pair of faces is culled');
    assertFalse(isFaceVisible(volume, 0, 0, 0, 'east'), 'west voxel east face is hidden');
    assertFalse(isFaceVisible(volume, 1, 0, 0, 'west'), 'east voxel west face is hidden');
    assertTrue(isFaceVisible(volume, 0, 0, 0, 'west'), 'outer faces stay visible');
    assertTrue(isFaceVisible(volume, 1, 0, 0, 'east'), 'outer faces stay visible');
  });

  it('hides all six faces of a fully enclosed voxel', () => {
    const volume = createVolume(3, 3, 3);
    for (let z = 0; z < 3; z++) {
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          setVoxel(volume, x, y, z, 1);
        }
      }
    }

    for (const direction of FACE_DIRECTIONS) {
      assertFalse(isFaceVisible(volume, 1, 1, 1, direction), `centre voxel ${direction} face must be hidden`);
    }
  });

  it('emits only the shell of a solid 3x3x3 cube', () => {
    const volume = createVolume(3, 3, 3);
    for (let z = 0; z < 3; z++) {
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          setVoxel(volume, x, y, z, 1);
        }
      }
    }

    // 6 sides x 3x3 faces = 54 exposed faces; the 27-voxel interior contributes none.
    assertEqual(countVisibleFaces(volume), 54, 'a 3x3x3 solid cube exposes 54 faces');
    assertEqual(countSolidVoxels(volume), 27);
  });

  it('treats a hollow shell as having inner faces', () => {
    const volume = createVolume(3, 3, 3);
    for (let z = 0; z < 3; z++) {
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          const isShell = x === 0 || y === 0 || z === 0 || x === 2 || y === 2 || z === 2;
          if (isShell) setVoxel(volume, x, y, z, 1);
        }
      }
    }

    // Outer shell 54 + the 6 faces of the empty centre seen from inside.
    assertEqual(countVisibleFaces(volume), 60, 'hollow cube exposes outer and inner faces');
    assertTrue(isFaceVisible(volume, 0, 1, 1, 'east'), 'inner face of the shell is visible');
  });
});

describe('face culling: volume boundaries', () => {
  it('treats out-of-bounds neighbours as air', () => {
    const volume = createVolume(1, 1, 1);
    setVoxel(volume, 0, 0, 0, 1);

    assertEqual(countVisibleFaces(volume), 6, 'a 1x1x1 volume exposes all six faces');
  });

  // Adjacent chunks each draw their own copy of the plane they share, which is a
  // visible thin wall that z-fights wherever solid ground crosses a border.
  it('culls a border face when the neighbour across it is solid', () => {
    const volume = createVolume(2, 1, 1);
    setVoxel(volume, 1, 0, 0, 1);

    const solidNeighbor = (x: number): number => (x >= 2 ? 1 : 0);
    assertFalse(
      isFaceVisible(volume, 1, 0, 0, 'east', solidNeighbor),
      'the shared plane must not be emitted on this side',
    );
    assertTrue(
      isFaceVisible(volume, 1, 0, 0, 'east'),
      'without a neighbour sampler it is still emitted, so the world edge stays closed',
    );
  });

  it('keeps the face when the neighbour across it is air', () => {
    const volume = createVolume(2, 1, 1);
    setVoxel(volume, 1, 0, 0, 1);

    assertTrue(isFaceVisible(volume, 1, 0, 0, 'east', () => 0), 'air across the border keeps the face');
  });

  it('asks the sampler for coordinates outside the volume', () => {
    const volume = createVolume(2, 1, 1);
    setVoxel(volume, 0, 0, 0, 1);

    const asked: string[] = [];
    isFaceVisible(volume, 0, 0, 0, 'west', (x, y, z) => {
      asked.push(`${x},${y},${z}`);
      return 0;
    });

    assertDeepEqual(asked, ['-1,0,0'], 'the sampler receives the local coordinate across the face');
  });

  it('ignores empty cells', () => {
    const volume = createVolume(2, 2, 2);
    assertEqual(countVisibleFaces(volume), 0, 'an empty volume has no faces');
    assertFalse(isFaceVisible(volume, 0, 0, 0, 'up'), 'an empty cell has no visible faces');
  });

  it('does not cull across a gap', () => {
    const volume = createVolume(3, 1, 1);
    setVoxel(volume, 0, 0, 0, 1);
    setVoxel(volume, 2, 0, 0, 1);

    assertEqual(countVisibleFaces(volume), 12, 'separated voxels keep all faces');
  });
});

describe('face culling: geometry helpers', () => {
  it('returns four corners per face', () => {
    for (const direction of FACE_DIRECTIONS) {
      assertEqual(faceCorners(direction).length, 4, `${direction} should have 4 corners`);
    }
  });

  it('returns unit-length axis-aligned normals', () => {
    for (const direction of FACE_DIRECTIONS) {
      const normal = faceNormal(direction);
      const length = Math.hypot(normal[0], normal[1], normal[2]);
      assertEqual(length, 1, `${direction} normal should be unit length`);
    }
  });

  it('places corners on the correct side of the voxel', () => {
    assertDeepEqual(faceCorners('up').map((corner) => corner[1]), [1, 1, 1, 1], 'up face sits at y = 1');
    assertDeepEqual(faceCorners('down').map((corner) => corner[1]), [0, 0, 0, 0], 'down face sits at y = 0');
    assertDeepEqual(faceCorners('east').map((corner) => corner[0]), [1, 1, 1, 1], 'east face sits at x = 1');
    assertDeepEqual(faceCorners('west').map((corner) => corner[0]), [0, 0, 0, 0], 'west face sits at x = 0');
  });
});

describe('face culling: volume accessors', () => {
  it('computes a z-major index', () => {
    const volume = createVolume(4, 5, 6);
    assertEqual(voxelIndex(volume, 0, 0, 0), 0);
    assertEqual(voxelIndex(volume, 1, 0, 0), 1);
    assertEqual(voxelIndex(volume, 0, 1, 0), 4);
    assertEqual(voxelIndex(volume, 0, 0, 1), 20);
  });

  it('rejects out-of-bounds writes without throwing', () => {
    const volume = createVolume(2, 2, 2);
    assertFalse(setVoxel(volume, -1, 0, 0, 1), 'negative x is rejected');
    assertFalse(setVoxel(volume, 2, 0, 0, 1), 'x == sizeX is rejected');
    assertEqual(getVoxel(volume, -1, 0, 0), 0, 'out-of-bounds reads return EMPTY');
  });

  it('reports containment correctly', () => {
    const volume = createVolume(2, 3, 4);
    assertTrue(isInside(volume, 0, 0, 0));
    assertTrue(isInside(volume, 1, 2, 3));
    assertFalse(isInside(volume, 2, 2, 3));
    assertFalse(isInside(volume, 1, 3, 3));
    assertFalse(isInside(volume, 1, 2, 4));
  });
});