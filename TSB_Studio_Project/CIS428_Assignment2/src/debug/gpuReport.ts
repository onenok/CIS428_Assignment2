/**
 * Which drawing pipeline the renderer actually uses, and which path draws each mesh.
 *
 * Engine 19 defaults `WebGPURendererParameters.drawingPipeline` to `meshlet`, an
 * experimental GPU-driven pipeline that clusters geometry in compute shaders and
 * feeds itself from a scene registry. Every earlier round of this investigation
 * assumed the classic three.js path: the scene graph describes the draw, and a
 * wrong picture therefore means wrong geometry, wrong UVs or a wrong material.
 * With the meshlet pipeline that assumption does not hold — the picture is
 * produced from clusters that were built at a different time than the current
 * geometry, so a mesh can be correct in the scene graph and still be drawn as
 * something else entirely.
 *
 * That is why this report exists: one line per projection showing what actually
 * drew, and per-object paths showing either `meshlet` or the reason the object
 * fell back to the regular pipeline.
 */

import type { DrawablePathReport, GpuReport, GpuStatLine } from './renderReport.js';

/** Recording is off by default, so the first dump after enabling it has no counts yet. */
export interface GpuReportOptions {
  /** Turn recording on. Cheap enough for a debug build, but it walks every render item. */
  readonly recordPaths?: boolean;
}

/** The pipeline members this report reads, all optional: a plain WebGL renderer has none of them. */
interface PipelineLike {
  recordDrawingPaths?: boolean;
  getDrawingStats?: () => readonly GpuStatLike[] | null;
  getDrawingPath?: (object: object) => { path?: unknown; reason?: unknown } | null;
}

interface GpuStatLike {
  readonly camera?: unknown;
  readonly shadow?: unknown;
  readonly batches?: unknown;
  readonly counts?: Readonly<Record<string, number>>;
}

interface WebGpuLike {
  drawingPipeline?: PipelineLike | null;
  backend?: { isWebGPUBackend?: boolean };
}

interface RendererLike {
  asWebGPU?: () => WebGpuLike | null;
  asWebGL?: () => unknown;
}

/**
 * Names the pipeline in a way a production build cannot erase.
 *
 * `constructor.name` is the obvious answer and is wrong: the built bundle minifies
 * class names, so a dump from the shipped game read `pipeline: _6` and told us
 * nothing. The engine's pipeline classes carry runtime flags instead, and the
 * absence of every GPU flag means the classic path is installed.
 */
function pipelineName(pipeline: PipelineLike | null | undefined): string {
  if (!pipeline) {
    return 'none';
  }
  const flags = pipeline as {
    isMeshletDrawingPipeline?: boolean;
    isVisibilityBufferDrawingPipeline?: boolean;
  };
  if (flags.isMeshletDrawingPipeline === true) {
    return 'meshlet';
  }
  if (flags.isVisibilityBufferDrawingPipeline === true) {
    return 'visibilityBuffer';
  }
  // No GPU-path flag and a stats reader: the classic per-object path.
  if (typeof pipeline.getDrawingStats === 'function') {
    return 'standard';
  }
  const named = (pipeline as { constructor?: { name?: string } }).constructor?.name;
  return named && named.length > 2 ? named : 'unknown';
}

/** Formats one projection's counts as a single line, largest count first. */
function formatStat(stat: GpuStatLike): GpuStatLine {
  const counts = Object.entries(stat.counts ?? {})
    // A count of zero means the pass never took that path; printing it only makes the
    // line longer without telling the reader anything.
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${key} ${count}`)
    .join(', ');
  const camera = typeof stat.camera === 'string' ? stat.camera : 'camera';
  return {
    camera,
    shadow: stat.shadow === true,
    batches: typeof stat.batches === 'number' ? stat.batches : 0,
    counts: counts || 'nothing drawn',
  };
}

/**
 * Turns path recording on, and reports what the last complete frame drew.
 *
 * Never throws: an F4 dump that fails is worse than a dump with a missing section.
 */
export function collectGpuReport(renderer: unknown, options?: GpuReportOptions): GpuReport {
  const candidate = renderer as RendererLike | null;
  const webgpu = candidate?.asWebGPU?.() ?? null;

  if (!webgpu) {
    return {
      rendererType: candidate?.asWebGL ? 'webgl' : 'unknown',
      pipeline: 'standard (WebGL backend)',
      sceneRegistry: null,
      recording: null,
      stats: [],
      drawables: [],
    };
  }

  const pipeline = webgpu.drawingPipeline ?? null;
  const supportsPaths = typeof pipeline?.getDrawingStats === 'function';

  let recording: boolean | null = null;
  if (pipeline && supportsPaths) {
    try {
      if (options?.recordPaths === true) pipeline.recordDrawingPaths = true;
      recording = pipeline.recordDrawingPaths === true;
    } catch {
      recording = null;
    }
  }

  const stats: GpuStatLine[] = [];
  try {
    const reported = pipeline?.getDrawingStats?.() ?? [];
    for (const stat of reported ?? []) stats.push(formatStat(stat));
  } catch {
    // A pipeline that throws here is itself worth knowing about, but not worth losing the dump.
  }

  return {
    rendererType: 'webgpu',
    pipeline: pipelineName(pipeline),
    // The registry feeds the meshlet pipeline instead of walking the scene, so a stale
    // registry entry is one of the ways a static scene can draw the wrong geometry.
    sceneRegistry: typeof (pipeline as { attachScene?: unknown } | null)?.attachScene === 'function' ? true : null,
    recording,
    stats,
    drawables: [],
  };
}

/** Reads the path a mesh was last drawn by, or `null` before anything recorded it. */
export function readDrawablePath(
  pipeline: unknown,
  object: object | null | undefined,
): DrawablePathReport | null {
  if (!object) {
    return null;
  }
  const getter = (pipeline as PipelineLike | null)?.getDrawingPath;
  if (typeof getter !== 'function') {
    return null;
  }
  try {
    const record = getter.call(pipeline, object);
    const path = typeof record?.path === 'string' ? record.path : null;
    if (path === null) {
      return null;
    }
    return { path, reason: typeof record?.reason === 'string' ? record.reason : null };
  } catch {
    return null;
  }
}

/** Reaches the drawing pipeline of the live renderer, for per-object path reads. */
export function readDrawingPipeline(renderer: unknown): unknown {
  const candidate = renderer as RendererLike | null;
  return candidate?.asWebGPU?.()?.drawingPipeline ?? null;
}