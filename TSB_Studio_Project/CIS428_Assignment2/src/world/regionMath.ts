/**
 * Region maths for world generation.
 *
 * The world is described as three concentric square rings of chunks. These
 * helpers answer "which chunks belong to which ring" without touching voxel
 * data, so they can be unit-tested in isolation.
 *
 * Chunk coordinates are signed integers; chunk (0, 0) is the editable chunk.
 */

import type { WorldGenConfig } from './WorldGenConfig.js';

export interface ChunkRange {
  /** Inclusive minimum chunk coordinate. */
  readonly minChunkX: number;
  /** Inclusive maximum chunk coordinate. */
  readonly maxChunkX: number;
  /** Inclusive minimum chunk coordinate. */
  readonly minChunkZ: number;
  /** Inclusive maximum chunk coordinate. */
  readonly maxChunkZ: number;
}

export interface ChunkCoord2D {
  readonly chunkX: number;
  readonly chunkZ: number;
}

/**
 * Inclusive chunk range covered by a square ring of the given radius.
 *
 * radius 0 -> a single chunk; radius 1 -> 3x3 chunks; radius 2 -> 5x5 chunks.
 */
export function chunkRangeForRadius(radius: number): ChunkRange {
  if (radius < 0) throw new Error(`chunkRangeForRadius: radius must be >= 0, got ${radius}`);
  return {
    minChunkX: -radius,
    maxChunkX: radius,
    minChunkZ: -radius,
    maxChunkZ: radius,
  };
}

/** The editable region: the innermost square of chunks. */
export function editableChunkRange(config: WorldGenConfig): ChunkRange {
  return chunkRangeForRadius(config.editableRadius);
}

/**
 * The solid region minus the editable region: a square ring of chunks that is
 * generated at full height but cannot be edited.
 *
 * Returned as an explicit coordinate list because the ring is not a rectangle.
 */
export function solidRingChunks(config: WorldGenConfig): ChunkCoord2D[] {
  const outer = config.solidRadius;
  const inner = config.editableRadius;
  const chunks: ChunkCoord2D[] = [];

  for (let chunkZ = -outer; chunkZ <= outer; chunkZ++) {
    for (let chunkX = -outer; chunkX <= outer; chunkX++) {
      const insideInner = Math.abs(chunkX) <= inner && Math.abs(chunkZ) <= inner;
      if (!insideInner) chunks.push({ chunkX, chunkZ });
    }
  }

  return chunks;
}

/**
 * The playable region minus the solid region: the outermost ring of chunks,
 * which only receives a single surface layer.
 */
export function playableRingChunks(config: WorldGenConfig): ChunkCoord2D[] {
  const outer = config.playableRadius;
  const inner = config.solidRadius;
  const chunks: ChunkCoord2D[] = [];

  for (let chunkZ = -outer; chunkZ <= outer; chunkZ++) {
    for (let chunkX = -outer; chunkX <= outer; chunkX++) {
      const insideInner = Math.abs(chunkX) <= inner && Math.abs(chunkZ) <= inner;
      if (!insideInner) chunks.push({ chunkX, chunkZ });
    }
  }

  return chunks;
}

/** True when the chunk lies inside the editable region. */
export function isEditableChunk(config: WorldGenConfig, chunkX: number, chunkZ: number): boolean {
  const radius = config.editableRadius;
  return Math.abs(chunkX) <= radius && Math.abs(chunkZ) <= radius;
}

/** True when the chunk lies inside the full-height solid region. */
export function isSolidChunk(config: WorldGenConfig, chunkX: number, chunkZ: number): boolean {
  const radius = config.solidRadius;
  return Math.abs(chunkX) <= radius && Math.abs(chunkZ) <= radius;
}

/** True when the chunk lies inside the surface-only playable region. */
export function isPlayableChunk(config: WorldGenConfig, chunkX: number, chunkZ: number): boolean {
  const radius = config.playableRadius;
  return Math.abs(chunkX) <= radius && Math.abs(chunkZ) <= radius;
}

/** Every chunk that receives any geometry, in row-major order. */
export function allGeneratedChunks(config: WorldGenConfig): ChunkCoord2D[] {
  const radius = config.playableRadius;
  const chunks: ChunkCoord2D[] = [];
  for (let chunkZ = -radius; chunkZ <= radius; chunkZ++) {
    for (let chunkX = -radius; chunkX <= radius; chunkX++) {
      chunks.push({ chunkX, chunkZ });
    }
  }
  return chunks;
}

/** Converts a chunk range to the inclusive voxel range it covers. */
export function chunkRangeToVoxelRange(
  range: ChunkRange,
  chunkSize: number,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return {
    minX: range.minChunkX * chunkSize,
    maxX: (range.maxChunkX + 1) * chunkSize - 1,
    minZ: range.minChunkZ * chunkSize,
    maxZ: (range.maxChunkZ + 1) * chunkSize - 1,
  };
}