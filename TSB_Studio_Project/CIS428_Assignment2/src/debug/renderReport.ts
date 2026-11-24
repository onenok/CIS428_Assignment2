/**
 * Render report — what the renderer was actually told to draw.
 *
 * The ground texture collapsing into one flat chunk is a rendering question, and
 * a screenshot cannot answer it: it shows the *result* but not the texture
 * settings that caused it. This report records the inputs to the render instead:
 *
 *   - renderer counters (`renderer.info`): draw calls, triangles, geometries
 *   - per chunk: how many faces survived the mesh build, and how many rebuilds ran
 *   - per material: which texture it uses and how that texture samples
 *
 * The sampling block is the important one. A `minFilter` of `NearestFilter` with
 * `generateMipmaps: false` aliases a 16x16 tile into mush at any distance, which
 * is exactly what the "ground looks like one big chunk" report describes.
 */

import type { RenderStats } from './DebugSnapshot.js';
import * as THREE from 'three';

/** How one texture samples, as a serialisable record. */
export interface TextureReport {
  /** Three.js filter constant, e.g. `1006` (NearestFilter). */
  readonly minFilter: number;
  readonly magFilter: number;
  readonly generateMipmaps: boolean;
  /**
   * Anisotropic filtering level.
   *
   * `1` (the Three.js default) makes a texture viewed at a grazing angle — which
   * is every floor in a first-person camera — sample only the coarsest mip, so a
   * 16x16 tile averages into a single colour and a whole chunk draws flat.
   */
  readonly anisotropy: number;
  /** Texture size, or `null` when the texture has no image yet. */
  readonly width: number | null;
  readonly height: number | null;
}

/** How one material is configured. */
export interface MaterialReport {
  readonly name: string;
  readonly type: string;
  readonly visible: boolean;
  readonly transparent: boolean;
  readonly map: TextureReport | null;
}

/** Mesh statistics for one chunk. */
export interface ChunkRenderReport {
  readonly chunkX: number;
  readonly chunkZ: number;
  /** Quads emitted by the mesher. */
  readonly faceCount: number;
  /** Mesh rebuilds since load — a chunk stuck at 0 never rebuilt after an edit. */
  readonly rebuilds: number;
  /** Non-air voxels the player placed. */
  readonly placedBlocks: number;
    /**
     * Geometry group count (one per material slot that has faces).
     *
     * Compared against {@link materialSlots}: three.js binds group *i* to material
     * *i*, so a chunk whose group count exceeds its material count renders part of
     * itself with a fallback material — the "whole chunk collapses into one flat
     * colour" symptom.
     */
    readonly groups?: number;
    /** Length of the material array the chunk was built with. */
    readonly materialSlots?: number;
    /**
     * Materials the mesh is actually rendering with.
     *
     * Compared against {@link materialSlots}. The engine's `MeshNode` keeps its own
     * copy of the material and may substitute a default one, so "the chunk was told
     * about 11 materials" and "the chunk is drawing with 11 materials" are two
     * different facts. A mismatch means every group falls back to one material, and
     * the chunk draws as a single flat colour.
     */
    readonly renderedMaterials?: number;
        /**
         * Largest U and V in the mesh's uv attribute.
         *
         * Every face this mesher emits is one full tile, so both must be exactly 1.
         * A larger value means something multiplied the UVs after the build, which
         * stretches a single tile across the whole chunk — the ground then reads as
         * one flat colour with a smear along whichever axis was scaled.
         */
        readonly maxUv?: number;
        /** Quads whose four corners are not one full 0..1 tile. */
        readonly offTileQuads?: number;
        /**
         * Longest edge of any quad, in metres.
         *
         * Every face is one voxel wide, so this equals the voxel size on a healthy
         * mesh. A larger value means a quad's corners were pulled apart and the face
         * is drawn as a smear carrying the texture with it.
         */
        readonly maxQuadEdge?: number;
        /** Quads wider than two voxels. */
        readonly stretchedQuads?: number;
}

/** One drawn object in the scene, as reported for diagnosis. */
export interface DrawableReport {
  /** Node name, or the class name when the node is unnamed. */
  readonly name: string;
  /** Class of the three.js object: `Mesh`, `LineSegments`, `Points`, ... */
  readonly kind: string;
  /** Name of the nearest named ancestor, which is what the chunk shows up as. */
  readonly owner?: string;
  /** World-space size on each axis, in metres. */
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  /** Centre of the world-space bounding box. */
  readonly centreX?: number;
  readonly centreY?: number;
  readonly centreZ?: number;
  readonly visible?: boolean;
    /** Vertex and index counts, which is how a stale or half-replaced geometry shows up. */
    readonly vertices?: number;
    readonly indices?: number;
    /**
     * One-line material summary: type, colour, side, depth state and map size.
     *
     * The screen being covered by flat colour comes down to *which* material is in
     * front of the camera and whether it writes depth, so those are recorded per
     * drawable rather than once for the whole scene.
     */
    readonly material?: string;
        /** Which drawing path drew this object last, and why it left the GPU path. */
        readonly path?: DrawablePathReport | null;
    }

    /**
     * The drawing path one mesh was drawn by.
     *
     * Engine 19 draws with the experimental `meshlet` pipeline by default, which builds
     * clusters from the geometry at one time and draws them at another. An object whose
     * scene-graph geometry is perfect can therefore still be drawn from stale clusters,
     * so the dump has to say which path drew it rather than assume the scene graph
     * decided.
     */
    export interface DrawablePathReport {
      /** `meshlet` when the GPU drew it, otherwise `standard` or `bundle`. */
      readonly path: string;
      /** Why it was not drawn on the GPU, when the pipeline says. */
      readonly reason: string | null;
    }

    /** Counts of one projection, as `getDrawingStats()` reports them. */
    export interface GpuStatLine {
      readonly camera: string;
      readonly shadow: boolean;
      readonly batches: number;
      /** `path[: reason] count` pairs, largest first. */
      readonly counts: string;
    }

    /** Which pipeline is installed, and what the last complete frame drew with it. */
    export interface GpuReport {
      /** `webgpu` or `webgl`: the two renderers share almost nothing on the draw path. */
      readonly rendererType: string;
      /** Class name of the installed drawing pipeline. */
      readonly pipeline: string;
      /** True when a scene registry feeds the pipeline instead of a per-frame scene walk. */
      readonly sceneRegistry: boolean | null;
      /** Whether path recording is on, so an empty stats list can be read correctly. */
      readonly recording: boolean | null;
      readonly stats: readonly GpuStatLine[];
      readonly drawables: readonly (DrawablePathReport & { readonly name: string })[];
}

/**
 * Scene-wide render state.
 *
 * A procedural sky, a scene environment map and a fog colour can each put a flat
 * wash of colour over a correct scene, and none of them appear in the drawable list
 * as a chunk-sized object. Recording them separately is what separates "our
 * geometry is wrong" from "something else is drawn in front of it".
 */
export interface SceneReport {
  /** `background` colour as `#rrggbb`, `texture`, or `null` when nothing clears. */
  readonly background?: string;
  /** Whether a scene environment map is bound, as the update count or `none`. */
  readonly environment?: string;
  readonly fog?: string;
  readonly clearColor?: string;
  readonly near?: number;
  readonly far?: number;
  readonly fov?: number;
}

/** One post-processing effect, as reported. */
export interface PostEffectReport {
  readonly type: string;
  readonly enabled: boolean;
  /** Primitive settings only, as `key=value` pairs. */
  readonly config: string;
}

/**
 * The post-processing chain.
 *
 * The scene can be provably correct while the picture is not: two dumps taken either
 * side of the failure came back identical in drawables, sizes, materials, background
 * and environment. Whatever covers the screen in that case is downstream of the scene
 * pass, so the effect chain has to be recorded alongside it.
 */
export interface PostReport {
  readonly enabled: boolean;
  readonly effects: readonly PostEffectReport[];
}

/** Everything the render report needs. */
export interface RenderReportInput {
  readonly renderer: RenderStats | null;
  readonly chunks: readonly ChunkRenderReport[];
  readonly materials: readonly MaterialReport[];
  /** Every object that actually gets drawn, with its world-space size. */
  readonly drawables?: readonly DrawableReport[];
    /** Scene-wide render state: background, environment, fog, camera. */
    readonly scene?: SceneReport;
    /** The post-processing chain, which composites the frame after the scene pass. */
    readonly post?: PostReport;
        /** Drawing pipeline and per-path draw counts. */
        readonly gpu?: GpuReport;
  /** Extra context lines (engine version, camera mode, ...). */
  readonly context?: Readonly<Record<string, string | number | boolean>>;
}

/** Reads the sampling settings off a real texture. */
export function describeTexture(texture: THREE.Texture | null): TextureReport | null {
  if (!texture) {
    return null;
  }

  const image = texture.image as { width?: number; height?: number } | undefined;
  return {
    minFilter: texture.minFilter,
    magFilter: texture.magFilter,
    generateMipmaps: texture.generateMipmaps,
        anisotropy: texture.anisotropy,
    width: image?.width ?? null,
    height: image?.height ?? null,
  };
}

/** Reads a material's render-relevant settings. */
export function describeMaterial(material: THREE.Material): MaterialReport {
  // Not every material has a `map`; only the textured ones do, so the lookup is
  // narrowed rather than assumed.
  const map = (material as THREE.Material & { map?: THREE.Texture | null }).map ?? null;
  return {
    name: material.name,
    type: material.type,
    visible: material.visible,
    transparent: material.transparent,
    map: describeTexture(map),
  };
}

/**
 * Human-readable name for a Three.js filter constant.
 *
 * The values are three.js's own (`NearestFilter = 1003` … `LinearMipmapLinearFilter
 * = 1008`). Getting this table wrong makes the report actively lie: it printed
 * "LinearFilter" for a texture that was actually `NearestFilter`, which sent the
 * first investigation down the wrong path.
 */
export function filterName(filter: number): string {
  switch (filter) {
    case 1003: return 'NearestFilter';
    case 1004: return 'NearestMipmapNearestFilter';
    case 1005: return 'NearestMipmapLinearFilter';
    case 1006: return 'LinearFilter';
    case 1007: return 'LinearMipmapNearestFilter';
    case 1008: return 'LinearMipmapLinearFilter';
    default: return `Filter(${filter})`;
  }
}

/** Filters that sample a mip chain, and therefore need `generateMipmaps`. */
const MIPMAP_FILTERS: ReadonlySet<number> = new Set([1004, 1005, 1007, 1008]);

/** Filters that sample a single level, which aliases when minified. */
const SINGLE_LEVEL_FILTERS: ReadonlySet<number> = new Set([1003, 1006]);

/**
 * Widest side a legitimate drawable can have before it is reported.
 *
 * A chunk is 16 m across, which is the largest thing this game authors. Anything
 * near or past that is a single quad stretched over the world — the exact shape a
 * collapsed ground reads as.
 */
const OVERSIZED_DRAWABLE_METRES = 24;

/**
 * Whether a drawable is a sky dome rather than authored world geometry.
 *
 * A procedural sky is a 10000 m shell around the camera by design, so reporting it as
 * oversized is noise. It still belongs in the list: a sky whose depth state changed
 * can cover correct geometry, and the `material` column is what shows that.
 */
function isSkyLike(item: DrawableReport): boolean {
  const label = `${item.name} ${item.owner ?? ''}`.toLowerCase();
  return label.includes('sky') || label.includes('environment');
}

/** True when the texture asks for a mip chain but is not allowed to build one. */
export function isMipmapBroken(texture: TextureReport | null): boolean {
  if (!texture) {
    return false;
  }
  return MIPMAP_FILTERS.has(texture.minFilter) && !texture.generateMipmaps;
}

/** True when minification will alias (single-level sampling, no mip chain). */
export function isMinificationAliased(texture: TextureReport | null): boolean {
  if (!texture) {
    return false;
  }
  return SINGLE_LEVEL_FILTERS.has(texture.minFilter);
}

/** Builds the report as plain text, one fact per line. */
export function buildRenderReport(input: RenderReportInput): string {
  const lines: string[] = [];
  lines.push('# render report');

  for (const [key, value] of Object.entries(input.context ?? {})) {
    lines.push(`${key}: ${value}`);
  }

  lines.push('');
  lines.push('## renderer');
  if (input.renderer) {
    lines.push(`drawCalls: ${input.renderer.drawCalls}`);
    lines.push(`triangles: ${input.renderer.triangles}`);
      // Without this the numbers cannot be trusted: an off-screen capture inside the same
      // frame resets them, so "4 draw calls" may describe the sky capture, not the world.
      lines.push(`scope: ${input.renderer.scoped ?? 'unknown'}`);
      if (input.renderer.geometries !== undefined) {
        lines.push(`geometries: ${input.renderer.geometries} textures: ${input.renderer.textures ?? '?'}`);
      }
  } else {
    lines.push('drawCalls: n/a (renderer unavailable)');
    lines.push('triangles: n/a');
  }

  if (input.gpu) {
      const gpu = input.gpu;
      lines.push('');
      lines.push('## drawing');
      lines.push(`renderer: ${gpu.rendererType}`);
      lines.push(`pipeline: ${gpu.pipeline}`);
      lines.push(`sceneRegistry: ${gpu.sceneRegistry === null ? 'n/a' : gpu.sceneRegistry ? 'on' : 'off'}`);
      lines.push(`recording: ${gpu.recording === null ? 'n/a' : gpu.recording ? 'on' : 'off'}`);
      if (gpu.stats.length === 0) {
        lines.push('stats: none recorded yet');
      }
      for (const stat of gpu.stats) {
        lines.push(`${stat.camera}${stat.shadow ? ' (shadow)' : ''}: ${stat.batches} batches; ${stat.counts}`);
      }
      for (const drawable of gpu.drawables) {
        lines.push(`path ${drawable.name}: ${drawable.path}${drawable.reason === null ? '' : ` (${drawable.reason})`}`);
      }
    }

    lines.push('');
  lines.push(`## chunks (${input.chunks.length})`);
    lines.push('chunkX chunkZ faces rebuilds placed groups slots rendered maxUv offTile maxEdge stretched');
  for (const chunk of input.chunks) {
    lines.push(
      `${String(chunk.chunkX).padStart(6)} ${String(chunk.chunkZ).padStart(6)} `
      + `${String(chunk.faceCount).padStart(5)} ${String(chunk.rebuilds).padStart(8)} `
        + `${String(chunk.placedBlocks).padStart(6)} `
        + `${String(chunk.groups ?? '?').padStart(6)} ${String(chunk.materialSlots ?? '?').padStart(5)} `
        + `${String(chunk.renderedMaterials ?? '?').padStart(8)} `
                + `${(chunk.maxUv === undefined ? '?' : chunk.maxUv.toFixed(3)).padStart(6)} `
                + `${String(chunk.offTileQuads ?? '?').padStart(7)} `
                        + `${(chunk.maxQuadEdge === undefined ? '?' : chunk.maxQuadEdge.toFixed(2)).padStart(7)} `
                        + `${String(chunk.stretchedQuads ?? '?').padStart(9)}`,
    );
                      if (chunk.stretchedQuads !== undefined && chunk.stretchedQuads > 0) {
                        lines.push(
                          `  WARNING: chunk (${chunk.chunkX},${chunk.chunkZ}) has ${chunk.stretchedQuads} quads `
                          + `wider than two voxels (max edge ${chunk.maxQuadEdge?.toFixed(2) ?? '?'}) `
                          + '— those faces are drawn as smears that drag the texture with them',
                        );
                      }
              if (chunk.maxUv !== undefined && chunk.maxUv > 1.0001) {
                lines.push(
                  `  WARNING: chunk (${chunk.chunkX},${chunk.chunkZ}) has UVs up to ${chunk.maxUv.toFixed(2)} `
                  + '— the texture is stretched over the whole chunk instead of one tile per face',
                );
              }
              if (chunk.offTileQuads !== undefined && chunk.offTileQuads > 0) {
                lines.push(
                  `  WARNING: chunk (${chunk.chunkX},${chunk.chunkZ}) has ${chunk.offTileQuads} quads `
                  + 'that are not one full tile — the mesher emitted partial UVs',
                );
              }
      if (chunk.groups !== undefined && chunk.materialSlots !== undefined
        && chunk.groups > chunk.materialSlots) {
        lines.push(
          `  WARNING: chunk (${chunk.chunkX},${chunk.chunkZ}) has ${chunk.groups} groups `
          + `but ${chunk.materialSlots} materials — extra groups render with a fallback material`,
        );
      }
      if (chunk.renderedMaterials !== undefined && chunk.materialSlots !== undefined
        && chunk.renderedMaterials !== chunk.materialSlots) {
        lines.push(
          `  WARNING: chunk (${chunk.chunkX},${chunk.chunkZ}) renders with `
          + `${chunk.renderedMaterials} materials but was given ${chunk.materialSlots} — `
          + 'the engine substituted a material, so every face draws the same colour',
        );
      }
  }

  lines.push('');
  lines.push(`## materials (${input.materials.length})`);
  for (const material of input.materials) {
    const map = material.map;
    lines.push(
      `${material.name} [${material.type}] visible=${material.visible} transparent=${material.transparent}`,
    );
    if (!map) {
      lines.push('  map: none');
      continue;
    }
    lines.push(
      `  size=${map.width ?? '?'}x${map.height ?? '?'} `
      + `minFilter=${filterName(map.minFilter)} magFilter=${filterName(map.magFilter)} `
      + `generateMipmaps=${map.generateMipmaps} anisotropy=${map.anisotropy}`,
    );
          if (map.anisotropy <= 1) {
            lines.push(
              '  WARNING: anisotropy=1 — a floor seen at a grazing angle samples the coarsest mip, '
              + 'so a whole chunk of ground averages into one flat colour',
            );
          }
    if (isMipmapBroken(map)) {
      lines.push('  WARNING: mipmap filter without mipmaps — texture will be sampled from one level');
    }
    if (isMinificationAliased(map)) {
      lines.push('  WARNING: nearest minification aliases at distance — expect moire and flat colour');
    }
  }

  if (input.scene) {
      lines.push('');
      lines.push('## scene');
      const scene = input.scene;
      lines.push(`background: ${scene.background ?? 'none'}`);
      lines.push(`environment: ${scene.environment ?? 'none'}`);
      lines.push(`fog: ${scene.fog ?? 'none'}`);
      lines.push(`clearColor: ${scene.clearColor ?? 'unknown'}`);
      lines.push(`camera: near=${scene.near ?? '?'} far=${scene.far ?? '?'} fov=${scene.fov ?? '?'}`);
    }

    if (input.post) {
    lines.push('');
    lines.push(`## post (${input.post.effects.length}, ${input.post.enabled ? 'enabled' : 'disabled'})`);
    for (const effect of input.post.effects) {
      lines.push(`${effect.enabled ? 'on ' : 'off'} ${effect.type.padEnd(16)} ${effect.config}`);
    }
  }

  if (input.drawables) {
    lines.push('');
    lines.push(`## drawables (${input.drawables.length})`);
      lines.push('kind name owner sizeX sizeY sizeZ centreX centreY centreZ visible verts inds path material');
    for (const item of input.drawables) {
      lines.push(
        `${item.kind.padEnd(12)} ${(item.name || '-').padEnd(20)} ${(item.owner ?? '-').padEnd(20)} `
        + `${item.sizeX.toFixed(2).padStart(7)} ${item.sizeY.toFixed(2).padStart(7)} `
        + `${item.sizeZ.toFixed(2).padStart(7)} `
        + `${(item.centreX ?? 0).toFixed(2).padStart(8)} ${(item.centreY ?? 0).toFixed(2).padStart(8)} `
          + `${(item.centreZ ?? 0).toFixed(2).padStart(8)} ${String(item.visible !== false).padEnd(5)} `
          + `${(item.vertices ?? 0).toString().padStart(6)} ${(item.indices ?? 0).toString().padStart(6)} `
                    + `${item.path ? `${item.path.path}${item.path.reason ? `/${item.path.reason}` : ''}` : '-'} `
          + `${item.material ?? '-'}`,
      );
    }
      // A chunk is 16 m wide. A sky dome is legitimately far larger, so the size warning
      // alone cannot say "this is a bug" — it says "look here", and the material column
      // says whether it is drawn in front of the world.
      for (const item of input.drawables) {
        const widest = Math.max(item.sizeX, item.sizeY, item.sizeZ);
        if (widest > OVERSIZED_DRAWABLE_METRES && !isSkyLike(item)) {
          lines.push(
            `  WARNING: drawable '${item.name || item.kind}' under '${item.owner ?? '-'}' is `
            + `${widest.toFixed(1)} m across — far larger than a chunk (16 m), so it is `
            + 'geometry that was never authored',
          );
        }
      }
  }

  return lines.join('\n');
}