/**
 * Chunk geometry builder.
 *
 * Turns a voxel volume into a `BufferGeometry` with one material group per
 * material slot. This is the piece the engine's `VoxelMeshNode` cannot do: it
 * hard-codes UVs to a full 0..1 quad and uses a single vertex-coloured material,
 * so it cannot show per-face textures.
 *
 * Output layout:
 *   position  - 3 floats per vertex
 *   normal    - 3 floats per vertex
 *   uv        - 2 floats per vertex
 *   index     - 6 indices per face (two triangles)
 *   groups    - one per material slot, in slot order
 *
 * Faces are emitted only when the neighbouring voxel is air, so interior faces
 * cost nothing.
 */

import * as THREE from 'three';

import { slotForFace } from './materialMap.js';
import {
  EMPTY,
  FACE_DIRECTIONS,
  faceCorners,
  faceNormal,
  getVoxel,
  isFaceVisible,
  type NeighborSampler,
  type VoxelVolume,
} from './mesher.js';

/** UV extent of a chunk's geometry, as reported for diagnosis. */
export interface UvRange {
  readonly minU: number;
  readonly maxU: number;
  readonly minV: number;
  readonly maxV: number;
  /** Quads whose four corners are not a full 0..1 tile. */
  readonly offTileQuads: number;
}

/**
 * Measures the UV attribute of a geometry.
 *
 * Every face this mesher emits is one full tile, so `maxU` and `maxV` must be
 * exactly 1. Anything larger means something multiplied the UVs after the build —
 * the engine's `scaleUVsBySize` does exactly that — and a texture stretched over
 * a whole chunk is what "the ground is one flat colour" looks like.
 */
export function measureUvRange(geometry: THREE.BufferGeometry | null | undefined): UvRange | null {
  const uv = geometry?.getAttribute('uv');
  if (!uv || uv.count === 0) {
    return null;
  }

  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < uv.count; i++) {
    minU = Math.min(minU, uv.getX(i));
    maxU = Math.max(maxU, uv.getX(i));
    minV = Math.min(minV, uv.getY(i));
    maxV = Math.max(maxV, uv.getY(i));
  }

  let offTileQuads = 0;
  for (let i = 0; i + 3 < uv.count; i += 4) {
    let quadMinU = Number.POSITIVE_INFINITY;
    let quadMaxU = Number.NEGATIVE_INFINITY;
    let quadMinV = Number.POSITIVE_INFINITY;
    let quadMaxV = Number.NEGATIVE_INFINITY;
    for (let corner = 0; corner < 4; corner++) {
      const u = uv.getX(i + corner);
      const v = uv.getY(i + corner);
      quadMinU = Math.min(quadMinU, u);
      quadMaxU = Math.max(quadMaxU, u);
      quadMinV = Math.min(quadMinV, v);
      quadMaxV = Math.max(quadMaxV, v);
    }
    if (Math.abs(quadMaxU - quadMinU - 1) > 1e-4 || Math.abs(quadMaxV - quadMinV - 1) > 1e-4) {
      offTileQuads++;
    }
  }

  return { minU, maxU, minV, maxV, offTileQuads };
}

/** Quad size statistics of a chunk's geometry, as reported for diagnosis. */
export interface QuadExtents {
  /** Shortest edge of any quad, in metres. */
  readonly minEdge: number;
  /** Longest edge of any quad, in metres. */
  readonly maxEdge: number;
  /** Quads whose longest edge exceeds twice the voxel size. */
  readonly stretchedQuads: number;
}

/**
 * Measures the edge lengths of every quad in a geometry.
 *
 * The mesher emits exactly four vertices per face and every face is one voxel
 * wide, so a healthy chunk has `minEdge === maxEdge === voxelSize` on all axes.
 * A quad with corners pulled apart is drawn as a smear that carries the texture
 * out with it — the "block at the chunk's minimum corner looks right, everything
 * beyond it is a long stripe" symptom.
 */
export function measureQuadExtents(
  geometry: THREE.BufferGeometry | null | undefined,
  voxelSize = 1,
): QuadExtents | null {
  const position = geometry?.getAttribute('position');
  if (!position || position.count < 4) {
    return null;
  }

  let minEdge = Number.POSITIVE_INFINITY;
  let maxEdge = 0;
  let stretchedQuads = 0;

  for (let base = 0; base + 3 < position.count; base += 4) {
    const ax = position.getX(base);
    const ay = position.getY(base);
    const az = position.getZ(base);

    let quadMax = 0;
    for (let corner = 1; corner < 4; corner++) {
      const dx = position.getX(base + corner) - ax;
      const dy = position.getY(base + corner) - ay;
      const dz = position.getZ(base + corner) - az;
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
      quadMax = Math.max(quadMax, length);
      minEdge = Math.min(minEdge, length);
    }
    maxEdge = Math.max(maxEdge, quadMax);
    if (quadMax > voxelSize * 2) {
      stretchedQuads++;
    }
  }

  return { minEdge, maxEdge, stretchedQuads };
}

/** One material group in the built geometry. */
export interface GeometryGroup {
  /** Material slot index. */
  readonly slot: number;
  /** First index in the index buffer. */
  readonly start: number;
  /** Number of indices in this group. */
  readonly count: number;
}

export interface ChunkGeometryResult {
  readonly geometry: THREE.BufferGeometry;
  /** Groups in ascending slot order. */
  readonly groups: readonly GeometryGroup[];
  /** Number of faces emitted. */
  readonly faceCount: number;
}

/** UV rectangle for one face of a tile. Full tile by default. */
const FULL_TILE_UV: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * Builds geometry for a voxel volume.
 *
 * `origin` shifts every vertex, so a chunk can be built in local coordinates and
 * then positioned by the node transform.
 *
 * `sampleNeighbor` is what removes the plane shared with an adjacent chunk — see
 * {@link NeighborSampler}. Without it every chunk draws its whole outer shell,
 * and two neighbours draw the same plane twice.
 */
export function buildChunkGeometry(
  volume: VoxelVolume,
  origin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  sampleNeighbor?: NeighborSampler,
): ChunkGeometryResult {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Bucket indices per slot so groups come out contiguous.
  const slotIndices = new Map<number, number[]>();
  let faceCount = 0;

  for (let z = 0; z < volume.sizeZ; z++) {
    for (let y = 0; y < volume.sizeY; y++) {
      for (let x = 0; x < volume.sizeX; x++) {
        const id = getVoxel(volume, x, y, z);
        if (id === EMPTY) continue;

        for (let faceIndex = 0; faceIndex < FACE_DIRECTIONS.length; faceIndex++) {
          const direction = FACE_DIRECTIONS[faceIndex];
                    if (!isFaceVisible(volume, x, y, z, direction, sampleNeighbor)) continue;

          const slot = slotForFace(id, faceIndex);
          if (slot < 0) continue;

          const baseVertex = positions.length / 3;
          const corners = faceCorners(direction);
          const normal = faceNormal(direction);

          for (let corner = 0; corner < 4; corner++) {
            const [cx, cy, cz] = corners[corner];
            positions.push(origin.x + x + cx, origin.y + y + cy, origin.z + z + cz);
            normals.push(normal[0], normal[1], normal[2]);
            const [u, v] = FULL_TILE_UV[corner];
            uvs.push(u, v);
          }

          const bucket = slotIndices.get(slot);
          const quad = [baseVertex, baseVertex + 1, baseVertex + 2, baseVertex, baseVertex + 2, baseVertex + 3];
          if (bucket) {
            bucket.push(...quad);
          } else {
            slotIndices.set(slot, quad);
          }

          faceCount++;
        }
      }
    }
  }

  const groups: GeometryGroup[] = [];
  const sortedSlots = [...slotIndices.keys()].sort((a, b) => a - b);
  for (const slot of sortedSlots) {
    const bucket = slotIndices.get(slot)!;
    const start = indices.length;
    indices.push(...bucket);
    groups.push({ slot, start, count: bucket.length });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  for (const group of groups) {
    geometry.addGroup(group.start, group.count, group.slot);
  }

  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  return { geometry, groups, faceCount };
}

/**
 * Builds the material array for a chunk.
 *
 * The array index must equal the material slot index, so slots with no faces in
 * this chunk still get a placeholder entry; otherwise three.js would bind the
 * wrong material to a group.
 *
 * `alphaTest` is only set when a texture is actually bound. With `map: null` the
 * shader has no alpha channel to test against, and a non-zero `alphaTest` makes
 * every fragment fail the test — the whole chunk renders black. Slots without a
 * texture therefore get a plain opaque material.
 */
export function buildChunkMaterials(
  slotCount: number,
  textureForSlot: (slot: number) => THREE.Texture | null,
  options: { transparentSlots?: ReadonlySet<number> } = {},
): THREE.Material[] {
  const materials: THREE.Material[] = [];
  const transparentSlots = options.transparentSlots ?? new Set<number>();

  for (let slot = 0; slot < slotCount; slot++) {
    const texture = textureForSlot(slot);
    const transparent = transparentSlots.has(slot);
    materials.push(
      new THREE.MeshLambertMaterial({
        map: texture,
        transparent,
        opacity: transparent ? 0.6 : 1,
        alphaTest: texture && !transparent ? 0.5 : 0,
        side: transparent ? THREE.DoubleSide : THREE.FrontSide,
      }),
    );
  }

  return materials;
}

/** Disposes a geometry and every material in a material array. */
export function disposeChunkResources(
  geometry: THREE.BufferGeometry | null,
  materials: readonly THREE.Material[] | null,
): void {
  geometry?.dispose();
  if (!materials) return;
  for (const material of materials) material.dispose();
}