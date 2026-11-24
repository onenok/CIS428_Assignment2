import { describe, it } from '../../scripts/verify/harness.js';
import { assertEqual, assertFalse, assertTrue } from '../../scripts/verify/assert.js';
import {
  buildRenderReport,
  filterName,
  isMinificationAliased,
  isMipmapBroken,
  type MaterialReport,
  type TextureReport,
} from '../../src/debug/renderReport.js';

// Three.js's own values (verified against the installed build):
// NearestFilter=1003, NearestMipmapNearestFilter=1004, NearestMipmapLinearFilter=1005,
// LinearFilter=1006, LinearMipmapNearestFilter=1007, LinearMipmapLinearFilter=1008.
const NEAREST = 1003;
const NEAREST_MIPMAP_LINEAR = 1005;

function texture(overrides: Partial<TextureReport> = {}): TextureReport {
  return {
    minFilter: NEAREST_MIPMAP_LINEAR,
    magFilter: NEAREST,
    generateMipmaps: true,
        anisotropy: 8,
    width: 16,
    height: 16,
    ...overrides,
  };
}

describe('renderReport: texture diagnosis', () => {
  it('flags nearest minification as aliasing', () => {
    assertTrue(isMinificationAliased(texture({ minFilter: NEAREST })));
  });

  it('accepts a nearest-mipmap min filter', () => {
    assertFalse(isMinificationAliased(texture()));
  });

  it('flags a mipmap filter with mipmaps disabled', () => {
    assertTrue(isMipmapBroken(texture({ generateMipmaps: false })));
  });

  it('does not complain about a plain filter without mipmaps', () => {
    assertFalse(isMipmapBroken(texture({ minFilter: NEAREST, generateMipmaps: false })));
  });

  it('treats a missing texture as healthy', () => {
    assertFalse(isMipmapBroken(null));
    assertFalse(isMinificationAliased(null));
  });

  it('names the filter constants it knows', () => {
    assertEqual(filterName(NEAREST), 'NearestFilter');
    assertEqual(filterName(NEAREST_MIPMAP_LINEAR), 'NearestMipmapLinearFilter');
    assertEqual(filterName(4242), 'Filter(4242)');
  });
});

describe('renderReport: report text', () => {
  const materials: MaterialReport[] = [{
    name: 'chunk-stone',
    type: 'MeshLambertMaterial',
    visible: true,
    transparent: false,
    map: texture(),
  }];

  it('lists renderer counters', () => {
    const report = buildRenderReport({
        renderer: { drawCalls: 12, triangles: 340, scoped: 'frame' },
      chunks: [],
      materials: [],
    });
    assertTrue(report.includes('drawCalls: 12'), report);
    assertTrue(report.includes('triangles: 340'), report);
  });

    // An off-screen capture inside the same frame resets three.js's counters, so a low
    // reading is only meaningful next to what it covers.
    it('says what the renderer counters cover', () => {
      const report = buildRenderReport({
        renderer: { drawCalls: 4, triangles: 14, scoped: 'last render call' },
        chunks: [],
        materials: [],
      });
      assertTrue(report.includes('scope: last render call'), report);
    });

  it('says so when the renderer is unavailable', () => {
    const report = buildRenderReport({ renderer: null, chunks: [], materials: [] });
    assertTrue(report.includes('renderer unavailable'), report);
  });

  it('lists one row per chunk', () => {
    const report = buildRenderReport({
      renderer: null,
      chunks: [
        { chunkX: 0, chunkZ: 0, faceCount: 640, rebuilds: 3, placedBlocks: 1 },
        { chunkX: 1, chunkZ: 0, faceCount: 7, rebuilds: 0, placedBlocks: 0 },
      ],
      materials: [],
    });
    assertTrue(report.includes('faces rebuilds placed'), report);
    assertTrue(report.includes('640'), report);
    assertTrue(report.includes('  7 '), report);
  });

      it('reports group and material counts per chunk', () => {
        const report = buildRenderReport({
          renderer: null,
          chunks: [{ chunkX: 0, chunkZ: 0, faceCount: 10, rebuilds: 1, placedBlocks: 0, groups: 6, materialSlots: 10 }],
          materials: [],
        });
        assertTrue(report.includes('groups slots rendered'), report);
                assertFalse(report.includes('WARNING'), report);
              });

              // The engine's MeshNode keeps its own copy of the material and may substitute
              // a default; "given 11" and "drawing with 11" are different facts.
              it('warns when the mesh renders with a different material count', () => {
                const report = buildRenderReport({
                  renderer: null,
                  chunks: [{
                    chunkX: 0, chunkZ: 0, faceCount: 10, rebuilds: 1, placedBlocks: 0,
                    groups: 3, materialSlots: 11, renderedMaterials: 1,
                  }],
                  materials: [],
                });
                assertTrue(report.includes('WARNING'), report);
                assertTrue(report.includes('renders with 1 materials'), report);
                assertTrue(report.includes('substituted a material'), report);
              });

              it('stays quiet when the rendered material count matches', () => {
                const report = buildRenderReport({
                  renderer: null,
                  chunks: [{
                    chunkX: 0, chunkZ: 0, faceCount: 10, rebuilds: 1, placedBlocks: 0,
                    groups: 3, materialSlots: 11, renderedMaterials: 11,
                  }],
                  materials: [],
                });
        assertFalse(report.includes('WARNING'), report);
      });

                    // anisotropy=1 is the Three.js default and is invisible in a screenshot,
                    // yet it is enough to flatten a receding floor into one colour.
                    it('reports anisotropy and warns when it is left at the default', () => {
                const report = buildRenderReport({
                  renderer: null,
                  chunks: [],
                  materials: [{ ...materials[0], map: texture({ anisotropy: 1 }) }],
                });
                assertTrue(report.includes('anisotropy=1'), report);
                assertTrue(report.includes('WARNING'), report);
                    });

                    it('does not warn about anisotropy when it is set', () => {
                const report = buildRenderReport({ renderer: null, chunks: [], materials });
                assertTrue(report.includes('anisotropy=8'), report);
                assertFalse(report.includes('anisotropy=1'), report);
                    });

      // three.js binds group i to material i, so extra groups draw with a fallback
      // material — the "whole chunk is one flat colour" symptom.
      it('warns when a chunk has more groups than materials', () => {
        const report = buildRenderReport({
          renderer: null,
          chunks: [{ chunkX: 2, chunkZ: -1, faceCount: 10, rebuilds: 1, placedBlocks: 0, groups: 6, materialSlots: 1 }],
          materials: [],
        });
        assertTrue(report.includes('WARNING'), report);
        assertTrue(report.includes('chunk (2,-1)'), report);
      });

  it('reports the sampling settings of each material', () => {
    const report = buildRenderReport({ renderer: null, chunks: [], materials });
    assertTrue(report.includes('chunk-stone [MeshLambertMaterial]'), report);
    assertTrue(report.includes('minFilter=NearestMipmapLinearFilter'), report);
    assertTrue(report.includes('generateMipmaps=true'), report);
    assertFalse(report.includes('WARNING'), report);
  });

  it('warns when the sampling settings would make ground alias away', () => {
    const broken: MaterialReport[] = [{
      ...materials[0],
      map: texture({ minFilter: NEAREST, generateMipmaps: false }),
    }];
    const report = buildRenderReport({ renderer: null, chunks: [], materials: broken });
    assertTrue(report.includes('WARNING'), report);
  });

  it('records context lines', () => {
    const report = buildRenderReport({
      renderer: null,
      chunks: [],
      materials: [],
      context: { phase: 'explore', isFlying: true },
    });
    assertTrue(report.includes('phase: explore'), report);
    assertTrue(report.includes('isFlying: true'), report);
  });

      // A texture stretched over a whole chunk still looks like "the ground is one
    // colour"; the uv attribute is the only place that fact shows up.
    it('reports the UV extent of each chunk', () => {
      const report = buildRenderReport({
        renderer: null,
        chunks: [{
          chunkX: 0, chunkZ: 0, faceCount: 10, rebuilds: 1, placedBlocks: 0,
          maxUv: 1, offTileQuads: 0,
        }],
        materials: [],
      });
      assertTrue(report.includes('maxUv offTile'), report);
      assertTrue(report.includes('1.000'), report);
      assertFalse(report.includes('WARNING'), report);
    });

    it('warns when the UVs are scaled past one tile', () => {
      const report = buildRenderReport({
        renderer: null,
        chunks: [{
          chunkX: 2, chunkZ: 1, faceCount: 10, rebuilds: 1, placedBlocks: 0,
          maxUv: 16, offTileQuads: 640,
        }],
        materials: [],
      });
      assertTrue(report.includes('UVs up to 16.00'), report);
      assertTrue(report.includes('stretched over the whole chunk'), report);
      assertTrue(report.includes('640 quads'), report);
    });

      // Stretched quads and stretched UVs are different faults with the same symptom,
      // so they get separate warnings.
    it('warns when a quad is wider than a voxel', () => {
      const report = buildRenderReport({
        renderer: null,
        chunks: [{
          chunkX: 0, chunkZ: 0, faceCount: 10, rebuilds: 1, placedBlocks: 0,
          maxQuadEdge: 16, stretchedQuads: 4,
        }],
        materials: [],
      });
      assertTrue(report.includes('4 quads'), report);
      assertTrue(report.includes('drawn as smears'), report);
    });

          // A chunk is 16 x 11 x 16 m; a drawable far larger than that is geometry nobody
          // asked for, and it is the only thing that can smear the ground across the screen.
          it('lists every drawable with its world size', () => {
            const report = buildRenderReport({
              renderer: null,
              chunks: [],
              materials: [],
              drawables: [{
                name: 'Chunk_0_0', kind: 'Mesh', owner: 'Chunk_0_0',
                sizeX: 16, sizeY: 11, sizeZ: 16, centreX: 8, centreY: 5.5, centreZ: 8, visible: true,
              }],
            });
            assertTrue(report.includes('## drawables (1)'), report);
            assertTrue(report.includes('Mesh'), report);
            assertTrue(report.includes('Chunk_0_0'), report);
            assertTrue(report.includes('16.00'), report);
          });

          it('prints an empty drawable section when nothing is drawn', () => {
            const report = buildRenderReport({
              renderer: null, chunks: [], materials: [], drawables: [],
            });
            assertTrue(report.includes('## drawables (0)'), report);
          });

                    it('warns about a drawable far wider than a chunk', () => {
                      const report = buildRenderReport({
                        renderer: null,
                        chunks: [],
                        materials: [],
                        drawables: [{
                          name: 'GroundPlane', kind: 'Mesh', owner: 'Scene',
                          sizeX: 400, sizeY: 0.01, sizeZ: 400, centreX: 0, centreY: 0, centreZ: 0, visible: true,
                        }],
                      });
                      assertTrue(report.includes('WARNING'), report);
                      assertTrue(report.includes('GroundPlane'), report);
                      assertTrue(report.includes('400.0 m across'), report);
                    });

                    it('does not warn about a chunk-sized drawable', () => {
                      const report = buildRenderReport({
                        renderer: null,
                        chunks: [],
                        materials: [],
                        drawables: [{
                          name: 'ChunkMesh', kind: 'Mesh', owner: 'Chunk_0_0',
                          sizeX: 16, sizeY: 11, sizeZ: 16, centreX: 8, centreY: 5.5, centreZ: 8, visible: true,
                        }],
                      });
                      assertFalse(report.includes('far larger than a chunk'), report);
                    });

                                        // A sky dome is 10000 m by design, so the size warning must not fire on it.
                                        // It still needs to be listed: a sky with changed depth state covers the world.
                                        it('does not call a sky dome oversized geometry', () => {
                                          const report = buildRenderReport({
                                            renderer: null,
                                            chunks: [],
                                            materials: [],
                                            drawables: [{
                                              name: '-', kind: 'Mesh', owner: 'Sky',
                                              sizeX: 10000, sizeY: 10000, sizeZ: 10000,
                                              centreX: 9, centreY: 0, centreZ: -12.5, visible: true,
                                            }],
                                          });
                                          assertTrue(report.includes('## drawables (1)'), report);
                                          assertFalse(report.includes('far larger than a chunk'), report);
                                        });

                                        it('prints the material summary and vertex counts of each drawable', () => {
                                          const report = buildRenderReport({
                                            renderer: null,
                                            chunks: [],
                                            materials: [],
                                            drawables: [{
                                              name: 'ChunkMesh', kind: 'Mesh', owner: 'Chunk_0_0',
                                              sizeX: 16, sizeY: 11, sizeZ: 16, visible: true,
                                              vertices: 4096, indices: 6144,
                                              material: 'MeshLambertMaterial #ffffff front depthWrite depthTest map=16x16',
                                            }],
                                          });
                                          assertTrue(report.includes('verts'), report);
                                          assertTrue(report.includes('4096'), report);
                                          assertTrue(report.includes('6144'), report);
                                          assertTrue(report.includes('depthWrite'), report);
                                          assertTrue(report.includes('map=16x16'), report);
                                        });

                                        // The background, environment map and fog can each wash the screen in one
                                        // flat colour, and none of them appears as a chunk-sized drawable.
                                        it('prints the scene background, environment and fog', () => {
                                          const report = buildRenderReport({
                                            renderer: null,
                                            chunks: [],
                                            materials: [],
                                            scene: {
                                              background: '#9fc4e8',
                                              environment: 'texture(v7)',
                                              fog: 'Fog #9fc4e8 near=20 far=46',
                                              clearColor: '#000000',
                                              near: 0.1,
                                              far: 1000,
                                              fov: 70,
                                            },
                                          });
                                          assertTrue(report.includes('## scene'), report);
                                          assertTrue(report.includes('background: #9fc4e8'), report);
                                          assertTrue(report.includes('environment: texture(v7)'), report);
                                          assertTrue(report.includes('fog: Fog #9fc4e8 near=20 far=46'), report);
                                          assertTrue(report.includes('camera: near=0.1 far=1000 fov=70'), report);
                                        });

                                        // The picture can be wrong with the scene provably unchanged, which puts
                                        // the difference downstream of the scene pass.
                                        it('prints the post-processing chain with per-effect settings', () => {
                                          const report = buildRenderReport({
                                            renderer: null,
                                            chunks: [],
                                            materials: [],
                                            post: {
                                              enabled: true,
                                              effects: [
                                                { type: 'ao', enabled: false, config: 'radius=0.250' },
                                                { type: 'bloom', enabled: true, config: 'strength=1.500' },
                                              ],
                                            },
                                          });
                                          assertTrue(report.includes('## post (2, enabled)'), report);
                                          assertTrue(report.includes('off ao'), report);
                                          assertTrue(report.includes('on  bloom'), report);
                                          assertTrue(report.includes('strength=1.500'), report);
                                        });

                                                                                  // The scene graph can be perfect and the picture still wrong: the
                                                                                  // default pipeline draws from clusters built at another time. The
                                                                                  // dump has to say which path drew, not assume the graph decided.
                                                                                  it('prints the drawing pipeline and the path of each drawable', () => {
                                                                                    const report = buildRenderReport({
                                                                                      renderer: null,
                                                                                      chunks: [],
                                                                                      materials: [],
                                                                                      gpu: {
                                                                                        rendererType: 'webgpu',
                                                                                        pipeline: 'MeshletDrawingPipeline',
                                                                                        sceneRegistry: true,
                                                                                        recording: true,
                                                                                        stats: [{ camera: 'PerspectiveCamera', shadow: false, batches: 12, counts: 'meshlet 300' }],
                                                                                        drawables: [],
                                                                                      },
                                                                                      drawables: [{
                                                                                        name: 'ChunkMesh',
                                                                                        kind: 'Mesh',
                                                                                        owner: 'VoxelChunkNode',
                                                                                        sizeX: 16,
                                                                                        sizeY: 11,
                                                                                        sizeZ: 16,
                                                                                        path: { path: 'standard', reason: 'not a node material' },
                                                                                      }],
                                                                                    });
                                                                                    assertTrue(report.includes('## drawing'), report);
                                                                                    assertTrue(report.includes('renderer: webgpu'), report);
                                                                                    assertTrue(report.includes('pipeline: MeshletDrawingPipeline'), report);
                                                                                    assertTrue(report.includes('sceneRegistry: on'), report);
                                                                                    assertTrue(report.includes('PerspectiveCamera: 12 batches; meshlet 300'), report);
                                                                                    assertTrue(report.includes('standard/not a node material'), report);
                                                                                  });

                                                                                  it('says so when recording has not produced counts yet', () => {
                                                                                    const report = buildRenderReport({
                                                                                      renderer: null,
                                                                                      chunks: [],
                                                                                      materials: [],
                                                                                      gpu: {
                                                                                        rendererType: 'webgl',
                                                                                        pipeline: 'standard (WebGL backend)',
                                                                                        sceneRegistry: null,
                                                                                        recording: null,
                                                                                        stats: [],
                                                                                        drawables: [],
                                                                                      },
                                                                                    });
                                                                                    assertTrue(report.includes('pipeline: standard (WebGL backend)'), report);
                                                                                    assertTrue(report.includes('recording: n/a'), report);
                                                                                    assertTrue(report.includes('stats: none recorded yet'), report);
                                                                                  });
});