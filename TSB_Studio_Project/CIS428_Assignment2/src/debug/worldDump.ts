/**
 * World dump — a readable, Minecraft-save-like text view of the voxel world.
 *
 * The point is to be able to *see* the world without trusting a screenshot:
 * which block id sits at which coordinate, where the air pockets are, whether the
 * ground is actually filled. A screenshot tells you "the ground looks wrong"; this
 * tells you "y=11 is missing from x=4..15".
 *
 * Two formats come out of the same data:
 *
 *   - `dumpWorldText()`  — one character per block, layer by layer, for reading
 *   - `dumpWorldJson()`  — only the non-air blocks, for scripting
 *
 * Pure functions over an abstract source, so they run in the headless harness.
 */

import { BLOCK_AIR, BLOCK_NAMES, blockName } from '../voxel/blockIds.js';

/**
 * One character per block id.
 *
 * Chosen to be visually distinct at a glance: `.` reads as empty, solid letters
 * read as filled. Anything unmapped falls back to `?` so a new block id shows up
 * as "unknown" instead of silently vanishing.
 */
const BLOCK_CHARS: Readonly<Record<number, string>> = {
  0: '.', // air
  1: 'G', // grass
  2: 'D', // dirt
  3: 'S', // stone
  4: 'C', // cobblestone
  5: 'P', // oak planks
  6: 'L', // oak log
  7: 'A', // sand
  8: 'H', // glass (H for "hyaline")
  9: 'B', // bricks
    10: 'K', // bedrock (K for "kern", the German word for core)
};

/** The single-character symbol for a block id. */
export function blockChar(blockId: number): string {
  return BLOCK_CHARS[blockId] ?? '?';
}

/** The legend block printed at the top of a text dump. */
export function blockLegend(): string {
  const ids = Object.keys(BLOCK_CHARS).map(Number).sort((a, b) => a - b);
  return ids.map(id => `${BLOCK_CHARS[id]}=${BLOCK_NAMES[id] ?? `#${id}`}`).join('  ');
}

/** Everything the dumper needs to read one chunk. */
export interface ChunkDumpSource {
  /** Chunk coordinates, used only in the header. */
  readonly chunkX: number;
  readonly chunkZ: number;
  /** World voxel coordinate of the chunk's minimum corner. */
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  /** Reads a block id by world voxel coordinate. */
  getVoxel(worldX: number, worldY: number, worldZ: number): number;
}

/** One non-air block, for the JSON dump. */
export interface DumpedBlock {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly id: number;
  readonly name: string;
}

/** Renders one chunk as text: a header, then one block map per Y layer. */
export function dumpChunkText(source: ChunkDumpSource): string[] {
  const lines: string[] = [];
  lines.push(
    `chunk (${source.chunkX},${source.chunkZ})  `
    + `x[${source.originX}..${source.originX + source.sizeX - 1}]  `
    + `y[${source.originY}..${source.originY + source.sizeY - 1}]  `
    + `z[${source.originZ}..${source.originZ + source.sizeZ - 1}]`,
  );

  // Top-down so the shape reads like the world looks: sky first, ground last.
  for (let layer = source.sizeY - 1; layer >= 0; layer -= 1) {
    const worldY = source.originY + layer;
    const rows: string[] = [];
    for (let z = 0; z < source.sizeZ; z += 1) {
      let row = '';
      for (let x = 0; x < source.sizeX; x += 1) {
        row += blockChar(source.getVoxel(source.originX + x, worldY, source.originZ + z));
      }
      rows.push(row);
    }

    // An entirely empty layer is noise in a 16-layer chunk — but only fully empty
    // ones: a layer with a single block is exactly what we are looking for.
    if (rows.every(row => row === '.'.repeat(source.sizeX))) {
      continue;
    }

    lines.push(`  y=${worldY}`);
    for (let z = 0; z < rows.length; z += 1) {
      lines.push(`    z=${String(source.originZ + z).padStart(3)}  ${rows[z]}`);
    }
  }

  return lines;
}

/** Collects every non-air block in one chunk. */
export function collectBlocks(source: ChunkDumpSource): DumpedBlock[] {
  const blocks: DumpedBlock[] = [];
  for (let y = 0; y < source.sizeY; y += 1) {
    for (let z = 0; z < source.sizeZ; z += 1) {
      for (let x = 0; x < source.sizeX; x += 1) {
        const worldX = source.originX + x;
        const worldY = source.originY + y;
        const worldZ = source.originZ + z;
        const id = source.getVoxel(worldX, worldY, worldZ);
        if (id === BLOCK_AIR) {
          continue;
        }
        blocks.push({ x: worldX, y: worldY, z: worldZ, id, name: blockName(id) });
      }
    }
  }
  return blocks;
}

/** Builds the full text dump for every chunk. */
export function dumpWorldText(sources: readonly ChunkDumpSource[]): string {
  const lines: string[] = [];
  lines.push(`# world dump — ${sources.length} chunk(s)`);
  lines.push(`# ${blockLegend()}`);
  for (const source of sources) {
    lines.push('');
    lines.push(...dumpChunkText(source));
  }
  return lines.join('\n');
}

/** Builds the machine-readable dump: a chunk index plus every non-air block. */
export function dumpWorldJson(sources: readonly ChunkDumpSource[]): string {
  const payload = {
    chunkCount: sources.length,
    chunks: sources.map(source => ({
      chunkX: source.chunkX,
      chunkZ: source.chunkZ,
      origin: { x: source.originX, y: source.originY, z: source.originZ },
      size: { x: source.sizeX, y: source.sizeY, z: source.sizeZ },
      blocks: collectBlocks(source),
    })),
  };
  return JSON.stringify(payload, null, 2);
}