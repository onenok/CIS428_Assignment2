/**
 * World generation.
 *
 * Builds the chunk grid described by `WorldGenConfig`:
 *
 *   editable chunk   - full height, editable
 *   solid ring       - full height, not editable
 *   playable ring    - single surface layer only
 *
 * Generation writes voxel data directly (no per-block `markDirty()`), then flags
 * each chunk once, so a 25-chunk world costs 25 rebuilds instead of tens of
 * thousands.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { CHUNK_SIZE_X, CHUNK_SIZE_Z, chunkIndex, worldYToLocalY } from '../voxel/chunkMath.js';
import { VoxelChunkNode } from '../voxel/VoxelChunkNode.js';
import { blockIdForCarvedColumn, blockIdForFullHeightColumn, blockIdForSurfaceOnlyColumn } from './terrainFill.js';
import { allGeneratedChunks, isEditableChunk, isSolidChunk } from './regionMath.js';
import { hasCarvedCenter, type WorldGenConfig } from './WorldGenConfig.js';

/** Fog settings applied to the scene. */
export interface FogSettings {
  readonly color: number;
  readonly near: number;
  readonly far: number;
}

/** Fog tuned so the playable ring fades out before its edge is visible. */
export const DEFAULT_FOG_SETTINGS: FogSettings = {
  color: 0x9fc4e8,
  near: 20,
  far: 46,
};

export interface GenerateWorldResult {
  /** Every chunk node created, keyed by `chunkX,chunkZ`. */
  readonly chunks: Map<string, VoxelChunkNode>;
  /** Chunks the player may edit. */
  readonly editableChunks: VoxelChunkNode[];
  /** Total non-air voxels generated. */
  readonly voxelCount: number;
}

/** Stable key for a chunk coordinate. */
export function chunkNodeKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

/**
 * Fills one chunk's voxel data.
 *
 * `surfaceOnly` chunks get a single layer; everything else is filled from
 * `minY` up to the surface. `carved` additionally digs the central pit into the
 * column — only the editable chunk is ever carved.
 */
export function fillChunkData(
  chunk: VoxelChunkNode,
  config: WorldGenConfig,
  surfaceOnly: boolean,
  carved = false,
): number {
  const volume = chunk.getVolume();
  let solid = 0;

  const pick = surfaceOnly
    ? blockIdForSurfaceOnlyColumn
    : carved
      ? blockIdForCarvedColumn
      : blockIdForFullHeightColumn;

  for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      for (let worldY = config.minY; worldY <= config.maxY; worldY++) {
        const blockId = pick(config, worldY);
        if (blockId === 0) continue;

        const localY = worldYToLocalY(worldY);
        volume.voxels[chunkIndex(localX, localY, localZ)] = blockId;
        solid++;
      }
    }
  }

  return solid;
}

/**
 * Generates the whole world under `parent`.
 *
 * Returns the chunk map so the build system can look up the chunk that owns a
 * given voxel coordinate.
 */
export function generateWorld(
  parent: { add(node: THREE.Object3D): unknown },
  config: WorldGenConfig,
  materials: THREE.Material[],
): GenerateWorldResult {
  const chunks = new Map<string, VoxelChunkNode>();
  const editableChunks: VoxelChunkNode[] = [];
  let voxelCount = 0;

  for (const coord of allGeneratedChunks(config)) {
    const surfaceOnly = !isSolidChunk(config, coord.chunkX, coord.chunkZ);
      // Only the editable chunk becomes a pit; the surrounding rings stay flat so
      // the player has ground to walk on right up to the rim.
      const carved =
        hasCarvedCenter(config) && isEditableChunk(config, coord.chunkX, coord.chunkZ);

    const chunk = VoxelChunkNode.create({
      name: `Chunk_${coord.chunkX}_${coord.chunkZ}`,
      chunkX: coord.chunkX,
      chunkZ: coord.chunkZ,
      materials,
    });

    voxelCount += fillChunkData(chunk, config, surfaceOnly, carved);
    chunk.markDirty();

    parent.add(chunk);
    chunks.set(chunkNodeKey(coord.chunkX, coord.chunkZ), chunk);
    if (isEditableChunk(config, coord.chunkX, coord.chunkZ)) editableChunks.push(chunk);
  }

  // Second pass: every chunk must exist before any of them can look sideways.
    // A chunk that cannot reach its neighbour emits its whole outer shell, so the
    // shared plane draws twice and z-fights.
    for (const chunk of chunks.values()) {
      chunk.setNeighborLookup(
        (chunkX, chunkZ) => chunks.get(chunkNodeKey(chunkX, chunkZ)) ?? null,
      );
      chunk.markDirty();
    }

    return { chunks, editableChunks, voxelCount };
}

  /** Finds the chunk that owns a world voxel coordinate. */
export function findChunkForVoxel(
  chunks: ReadonlyMap<string, VoxelChunkNode>,
  worldX: number,
  worldZ: number,
): VoxelChunkNode | null {
  const chunkX = Math.floor(worldX / CHUNK_SIZE_X);
  const chunkZ = Math.floor(worldZ / CHUNK_SIZE_Z);
  return chunks.get(chunkNodeKey(chunkX, chunkZ)) ?? null;
}

/**
 * Applies fog to the scene.
 *
 * Fog is what hides the edge of the playable ring, so it is part of world
 * generation rather than a cosmetic extra.
 */
export function applyFog(scene: THREE.Scene, settings: FogSettings = DEFAULT_FOG_SETTINGS): THREE.Fog {
  const fog = new THREE.Fog(settings.color, settings.near, settings.far);
  scene.fog = fog;
  return fog;
}