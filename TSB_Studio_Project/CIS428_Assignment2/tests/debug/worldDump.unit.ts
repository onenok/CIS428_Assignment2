import { describe, it } from '../../scripts/verify/harness.js';
import { assertDeepEqual, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import {
  blockChar,
  blockLegend,
  collectBlocks,
  dumpChunkText,
  dumpWorldJson,
  dumpWorldText,
  type ChunkDumpSource,
} from '../../src/debug/worldDump.js';
import { BLOCK_AIR, BLOCK_BEDROCK, BLOCK_GRASS, BLOCK_STONE } from '../../src/voxel/blockIds.js';

const SIZE = 4;

/** A 4x4x4 chunk whose blocks are supplied by the callback. */
function makeSource(get: (x: number, y: number, z: number) => number, chunkX = 0, chunkZ = 0): ChunkDumpSource {
  return {
    chunkX,
    chunkZ,
    originX: chunkX * SIZE,
    originY: 0,
    originZ: chunkZ * SIZE,
    sizeX: SIZE,
    sizeY: SIZE,
    sizeZ: SIZE,
    getVoxel: get,
  };
}

/** Solid stone below `height` in world Y. */
function floorSource(height: number, chunkX = 0, chunkZ = 0): ChunkDumpSource {
  return makeSource((_x, y) => (y < height ? BLOCK_STONE : BLOCK_AIR), chunkX, chunkZ);
}

describe('worldDump: block symbols', () => {
  it('uses a distinct character per block id', () => {
    assertEqual(blockChar(BLOCK_AIR), '.');
    assertEqual(blockChar(BLOCK_GRASS), 'G');
    assertEqual(blockChar(BLOCK_STONE), 'S');
  });

  it('marks an unmapped block id instead of hiding it', () => {
    assertEqual(blockChar(999), '?');
  });

  it('prints a legend with the readable names', () => {
    const legend = blockLegend();
    assertTrue(legend.includes('.=Air'), 'legend should name air');
    assertTrue(legend.includes('S=Stone'), 'legend should name stone');
  });

    it('names bedrock rather than showing it as unknown', () => {
      // A `?` in a dump means "unmapped id", so a mapped bedrock that still prints
      // `?` hides the entire point of the pit.
      assertEqual(blockChar(BLOCK_BEDROCK), 'K');
      assertTrue(blockLegend().includes('K=Bedrock'), 'the pit floor must be nameable');
    });
});

describe('worldDump: chunk text', () => {
  it('writes one header line naming the chunk and its bounds', () => {
    const lines = dumpChunkText(floorSource(2));
    assertTrue(lines[0].includes('chunk (0,0)'), lines[0]);
    assertTrue(lines[0].includes('x[0..3]'), lines[0]);
  });

  it('skips layers that are entirely air', () => {
    const text = dumpChunkText(floorSource(2)).join('\n');
    assertTrue(!text.includes('y=3'), 'the all-air top layer should be omitted');
    assertTrue(text.includes('y=1'), 'a filled layer should be present');
  });

  it('renders one row per Z line with the row prefix', () => {
    const lines = dumpChunkText(floorSource(2));
    const rows = lines.filter(line => line.trimStart().startsWith('z='));
    // 2 filled layers x 4 Z rows
    assertEqual(rows.length, 8);
    assertTrue(rows[0].includes('SSSS'), rows[0]);
  });

  it('keeps a layer that has a single block', () => {
    const source = makeSource((x, y, z) => (x === 1 && y === 2 && z === 1 ? BLOCK_GRASS : BLOCK_AIR));
    const text = dumpChunkText(source).join('\n');
    assertTrue(text.includes('y=2'), 'a single-block layer must not be skipped');
    assertTrue(text.includes('.G..'), 'the lone block should be visible in its row');
  });
});

describe('worldDump: block collection', () => {
  it('collects only non-air blocks with names', () => {
    const blocks = collectBlocks(makeSource((_x, y) => (y === 0 ? BLOCK_STONE : BLOCK_AIR)));
    assertEqual(blocks.length, SIZE * SIZE);
    assertEqual(blocks[0].name, 'Stone');
  });

  it('uses world coordinates, not chunk-local ones', () => {
    const blocks = collectBlocks(floorSource(1, 2, 3));
    assertEqual(blocks[0].x, 2 * SIZE);
    assertEqual(blocks[0].z, 3 * SIZE);
  });
});

describe('worldDump: whole world', () => {
  it('headers the text dump with the chunk count', () => {
    const text = dumpWorldText([floorSource(1), floorSource(1, 1, 0)]);
    assertTrue(text.startsWith('# world dump — 2 chunk(s)'), text.split('\n')[0]);
  });

  it('emits valid JSON with every block', () => {
    const parsed = JSON.parse(dumpWorldJson([floorSource(1)])) as {
      chunkCount: number;
      chunks: { blocks: unknown[] }[];
    };
    assertEqual(parsed.chunkCount, 1);
    assertEqual(parsed.chunks[0].blocks.length, SIZE * SIZE);
  });

  it('round-trips small numbers without precision loss', () => {
    const parsed = JSON.parse(dumpWorldJson([floorSource(1, -1, -1)])) as {
      chunks: { chunkX: number; chunkZ: number }[];
    };
    assertDeepEqual(parsed.chunks[0], { ...parsed.chunks[0], chunkX: -1, chunkZ: -1 });
  });
});