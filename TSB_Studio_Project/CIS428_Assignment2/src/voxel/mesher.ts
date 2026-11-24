/**
 * Voxel meshing utilities.
 *
 * The engine's `VoxelMeshNode` performs greedy meshing internally but keeps the
 * implementation private and hard-codes UVs to a full 0..1 quad, which makes it
 * unusable for textured blocks. This module re-implements the parts we need as
 * pure functions so they can be unit-tested without a renderer.
 *
 * Coordinate convention (matches the engine's `VoxelState`):
 *   index = x + sizeX * (y + sizeY * z)
 *   x -> east/west, y -> up/down, z -> north/south
 */

/** A voxel id of 0 means "empty". Any other value is a palette index. */
export const EMPTY = 0;

export interface VoxelVolume {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  /** Flat array of voxel ids, length = sizeX * sizeY * sizeZ. */
  voxels: Uint16Array;
}

export type FaceDirection = 'east' | 'west' | 'up' | 'down' | 'south' | 'north';

export const FACE_DIRECTIONS: readonly FaceDirection[] = ['east', 'west', 'up', 'down', 'south', 'north'];

/** Unit offset applied to a voxel coordinate to reach the neighbour across a face. */
export const FACE_OFFSETS: Readonly<Record<FaceDirection, readonly [number, number, number]>> = {
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
  south: [0, 0, 1],
  north: [0, 0, -1],
};

export function createVolume(sizeX: number, sizeY: number, sizeZ: number): VoxelVolume {
  if (sizeX <= 0 || sizeY <= 0 || sizeZ <= 0) {
    throw new Error(`createVolume: dimensions must be positive, got ${sizeX}x${sizeY}x${sizeZ}`);
  }
  return { sizeX, sizeY, sizeZ, voxels: new Uint16Array(sizeX * sizeY * sizeZ) };
}

export function isInside(volume: VoxelVolume, x: number, y: number, z: number): boolean {
  return x >= 0 && y >= 0 && z >= 0 && x < volume.sizeX && y < volume.sizeY && z < volume.sizeZ;
}

export function voxelIndex(volume: VoxelVolume, x: number, y: number, z: number): number {
  return x + volume.sizeX * (y + volume.sizeY * z);
}

/** Reads a voxel id. Out-of-bounds reads return `EMPTY` rather than throwing. */
export function getVoxel(volume: VoxelVolume, x: number, y: number, z: number): number {
  if (!isInside(volume, x, y, z)) return EMPTY;
  return volume.voxels[voxelIndex(volume, x, y, z)];
}

/** Writes a voxel id. Out-of-bounds writes are ignored and return `false`. */
export function setVoxel(volume: VoxelVolume, x: number, y: number, z: number, id: number): boolean {
  if (!isInside(volume, x, y, z)) return false;
  volume.voxels[voxelIndex(volume, x, y, z)] = id;
  return true;
}

/**
 * Reads a voxel that lies outside the volume, in the volume's own local
 * coordinates (so the caller may pass `-1` or `sizeX`).
 *
 * Without one, out-of-bounds reads are air, which makes every chunk emit its
 * full outer shell. Adjacent chunks then each draw the plane between them: two
 * coplanar quads fighting for the same depth values, visible underground as thin
 * vertical walls that shimmer. Supplying a sampler that reaches into the
 * neighbouring chunk removes both the wall and the wasted geometry.
 *
 * Returning `EMPTY` for a missing neighbour keeps the world edge correct: there
 * really is air beyond the last chunk.
 */
export type NeighborSampler = (x: number, y: number, z: number) => number;

/**
 * True when the face of `(x, y, z)` pointing in `direction` is exposed to air.
 *
 * A face is hidden when the neighbouring voxel is solid. Neighbours outside the
 * volume are read through `sampleNeighbor`; without it they count as air, so the
 * outer shell of an isolated volume is always visible.
 */
export function isFaceVisible(
  volume: VoxelVolume,
  x: number,
  y: number,
  z: number,
  direction: FaceDirection,
  sampleNeighbor?: NeighborSampler,
): boolean {
  if (getVoxel(volume, x, y, z) === EMPTY) return false;
  const [dx, dy, dz] = FACE_OFFSETS[direction];
  return getVoxelAcross(volume, x + dx, y + dy, z + dz, sampleNeighbor) === EMPTY;
}

/**
 * Reads a voxel, falling back to `sampleNeighbor` outside the volume.
 *
 * Exported because the mesher and the collision builder must agree on what lies
 * across a chunk border, otherwise the player can walk into a wall they cannot
 * see, or fall through ground that is drawn.
 */
export function getVoxelAcross(
  volume: VoxelVolume,
  x: number,
  y: number,
  z: number,
  sampleNeighbor?: NeighborSampler,
): number {
  if (isInside(volume, x, y, z)) {
    return volume.voxels[voxelIndex(volume, x, y, z)];
  }
  return sampleNeighbor ? sampleNeighbor(x, y, z) : EMPTY;
}

export interface VisibleFace {
  x: number;
  y: number;
  z: number;
  direction: FaceDirection;
  /** Voxel id occupying the cell. */
  id: number;
}

/**
 * Enumerates every face that would be visible from outside the volume.
 *
 * This is the "no interior faces" rule: a face between two solid voxels is
 * skipped, so a fully enclosed voxel contributes nothing.
 */
export function collectVisibleFaces(
  volume: VoxelVolume,
  sampleNeighbor?: NeighborSampler,
): VisibleFace[] {
  const faces: VisibleFace[] = [];

  for (let z = 0; z < volume.sizeZ; z++) {
    for (let y = 0; y < volume.sizeY; y++) {
      for (let x = 0; x < volume.sizeX; x++) {
        const id = getVoxel(volume, x, y, z);
        if (id === EMPTY) continue;

        for (const direction of FACE_DIRECTIONS) {
          if (isFaceVisible(volume, x, y, z, direction, sampleNeighbor)) {
            faces.push({ x, y, z, direction, id });
          }
        }
      }
    }
  }

  return faces;
}

/** Counts visible faces without allocating the full list. */
export function countVisibleFaces(
  volume: VoxelVolume,
  sampleNeighbor?: NeighborSampler,
): number {
  let count = 0;

  for (let z = 0; z < volume.sizeZ; z++) {
    for (let y = 0; y < volume.sizeY; y++) {
      for (let x = 0; x < volume.sizeX; x++) {
        if (getVoxel(volume, x, y, z) === EMPTY) continue;
        for (const direction of FACE_DIRECTIONS) {
          if (isFaceVisible(volume, x, y, z, direction, sampleNeighbor)) count++;
        }
      }
    }
  }

  return count;
}

/** Number of non-empty voxels. */
export function countSolidVoxels(volume: VoxelVolume): number {
  let count = 0;
  for (let i = 0; i < volume.voxels.length; i++) {
    if (volume.voxels[i] !== EMPTY) count++;
  }
  return count;
}

/**
 * The six corner positions of a unit cube face, in counter-clockwise order when
 * viewed from outside, expressed in voxel units relative to the voxel origin.
 *
 * Order: bottom-left, bottom-right, top-right, top-left.
 */
export function faceCorners(direction: FaceDirection): readonly (readonly [number, number, number])[] {
  switch (direction) {
    case 'east':
      return [
        [1, 0, 1],
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
      ];
    case 'west':
      return [
        [0, 0, 0],
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0],
      ];
    case 'up':
      return [
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
        [0, 1, 0],
      ];
    case 'down':
      return [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ];
    case 'south':
      return [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
      ];
    case 'north':
      return [
        [1, 0, 0],
        [0, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];
  }
}

/** Outward-facing unit normal for a face direction. */
export function faceNormal(direction: FaceDirection): readonly [number, number, number] {
  return FACE_OFFSETS[direction];
}