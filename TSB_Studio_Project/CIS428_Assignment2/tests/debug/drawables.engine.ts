/**
 * Layer 2 — drawable enumeration against the real scene graph.
 *
 * The unit layer can only prove the formatting; the failure this guards against is
 * structural. Engine 19 collapses a `MeshNode` into the node itself
 * (`FeatureFlags.COLLAPSE_MESH_COMPONENT`), so its inner `THREE.Mesh` is never
 * parented and a `constructor.name === 'Mesh'` check silently finds nothing. That
 * produced a report claiming `drawables (0)` while 25 chunks were on screen, which
 * sent the investigation the wrong way for a full pass.
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import * as THREE from 'three';

import { collectDrawableReports } from '../../src/debug/drawables.js';
import { buildChunkMaterials } from '../../src/voxel/chunkGeometry.js';
import { MATERIAL_SLOT_COUNT } from '../../src/voxel/materialMap.js';
import type { VoxelChunkNode } from '../../src/voxel/VoxelChunkNode.js';
import { DEFAULT_WORLD_GEN_CONFIG } from '../../src/world/WorldGenConfig.js';
import { generateWorld } from '../../src/world/WorldGenerator.js';
import { createHeadlessWorld } from '../world/headlessWorld.js';

describe('drawables: real scene graph', () => {
  it('finds one drawable per chunk mesh after the chunks build', async () => {
    const handle = await createHeadlessWorld();
    try {
      const materials = buildChunkMaterials(MATERIAL_SLOT_COUNT, () => null);
      const generated = generateWorld(handle.world, DEFAULT_WORLD_GEN_CONFIG, materials);
      // Generation only marks chunks dirty; the mesh appears on the first rebuild.
      for (const chunk of generated.chunks.values()) {
        (chunk as VoxelChunkNode).rebuildMesh();
      }

      const roots = handle.world.getRootNodes() as unknown as THREE.Object3D[];
      const rows = collectDrawableReports(roots);
      const chunkRows = rows.filter((row) => row.kind === 'Mesh');

      assertEqual(chunkRows.length, generated.chunks.size, 'every chunk should report one mesh');
      for (const row of chunkRows) {
        assertTrue(row.sizeX > 15.9 && row.sizeX < 16.1, `chunk mesh width should be 16, got ${row.sizeX}`);
        assertTrue(row.sizeZ > 15.9 && row.sizeZ < 16.1, `chunk mesh depth should be 16, got ${row.sizeZ}`);
        assertTrue(row.sizeY > 0, 'chunk mesh should have height');
      }
    } finally {
      handle.dispose();
    }
  });

  it('names the owning chunk even though every mesh is called ChunkMesh', async () => {
    const handle = await createHeadlessWorld();
    try {
      const materials = buildChunkMaterials(MATERIAL_SLOT_COUNT, () => null);
      const generated = generateWorld(handle.world, DEFAULT_WORLD_GEN_CONFIG, materials);
      for (const chunk of generated.chunks.values()) {
        (chunk as VoxelChunkNode).rebuildMesh();
      }

      const roots = handle.world.getRootNodes() as unknown as THREE.Object3D[];
      const owners = new Set(
        collectDrawableReports(roots)
          .filter((row) => row.kind === 'Mesh')
          .map((row) => row.owner),
      );

      // Without the owner the rows are indistinguishable, which makes the report useless
      // for locating the geometry that covers the screen.
      assertEqual(owners.size, generated.chunks.size, 'each mesh should report a distinct owner');
      assertTrue(!owners.has(undefined), 'every chunk mesh should have an owner');
    } finally {
      handle.dispose();
    }
  });

  it('reports nothing for an empty scene graph', async () => {
    const handle = await createHeadlessWorld();
    try {
      assertEqual(collectDrawableReports([]).length, 0);
    } finally {
      handle.dispose();
    }
  });
});