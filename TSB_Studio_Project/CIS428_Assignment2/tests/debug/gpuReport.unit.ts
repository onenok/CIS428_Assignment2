/**
 * Layer 1 — drawing-pipeline reporting.
 *
 * Engine 19 draws with the experimental `meshlet` pipeline by default, so the
 * scene graph no longer decides what the picture contains. These cases pin the
 * three answers the dump has to get right: which renderer, which pipeline, and
 * which path drew each mesh — plus the degrade path, because a F4 dump that throws
 * produces no evidence at all.
 */

import { assertDeepEqual, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { collectGpuReport, readDrawablePath, readDrawingPipeline } from '../../src/debug/gpuReport.js';

/** A fake pipeline whose class name is what the report prints. */
class MeshletDrawingPipeline {
    public readonly isMeshletDrawingPipeline = true;

  public recordDrawingPaths = false;

  public constructor(private readonly stats: readonly unknown[] | null) {
  }

    public getDrawingStats(): readonly unknown[] | null {
    return this.stats;
  }

  public getDrawingPath(object: object): { path: string; reason: string | null } | null {
    return (object as { path?: { path: string; reason: string | null } }).path ?? null;
  }
}

/** The classic path: no GPU flag, but the same stats reader. */
class StandardDrawingPipeline {
    public recordDrawingPaths = false;

    public getDrawingStats(): readonly unknown[] {
      return [];
    }

    public getDrawingPath(): null {
      return null;
    }
}

/** Wraps a pipeline the way `IGenesysRenderer.asWebGPU()` exposes it. */
function webgpuRenderer(pipeline: unknown): unknown {
  return { asWebGPU: () => ({ drawingPipeline: pipeline }) };
}

describe('gpuReport: renderer and pipeline', () => {
  it('says webgl and names the standard path for a WebGL renderer', () => {
    const report = collectGpuReport({ asWebGL: () => ({}) });
    assertEqual(report.rendererType, 'webgl');
    assertTrue(report.pipeline.includes('standard'), report.pipeline);
    assertEqual(report.sceneRegistry, null);
  });

  it('reports unknown when there is no renderer at all', () => {
    const report = collectGpuReport(null);
    assertEqual(report.rendererType, 'unknown');
    assertEqual(report.stats.length, 0);
  });

  it('names the installed WebGPU pipeline by its runtime flag, not its class name', () => {
    const report = collectGpuReport(webgpuRenderer(new MeshletDrawingPipeline([])));
    assertEqual(report.rendererType, 'webgpu');
      assertEqual(report.pipeline, 'meshlet');
    });

    // The shipped bundle minifies class names: a dump from it read `pipeline: _6`.
    // The flag is what survives, so the name must come from the flag.
    it('names the classic path standard even after minification', () => {
      const report = collectGpuReport(webgpuRenderer(new StandardDrawingPipeline()));
      assertEqual(report.pipeline, 'standard');
  });
});

describe('gpuReport: path recording', () => {
  it('turns recording on and reports it', () => {
    const pipeline = new MeshletDrawingPipeline([]);
    const report = collectGpuReport(webgpuRenderer(pipeline), { recordPaths: true });
    assertEqual(pipeline.recordDrawingPaths, true);
    assertEqual(report.recording, true);
  });

  it('leaves recording alone when not asked', () => {
    const pipeline = new MeshletDrawingPipeline([]);
    const report = collectGpuReport(webgpuRenderer(pipeline));
    assertEqual(pipeline.recordDrawingPaths, false);
    assertEqual(report.recording, false);
  });

  // Recording is per frame, so the first dump after enabling it legitimately has
  // nothing. That must read as "no stats", not as "nothing was drawn".
  it('reports no stats before a frame has been recorded', () => {
    const report = collectGpuReport(webgpuRenderer(new MeshletDrawingPipeline(null)));
    assertEqual(report.stats.length, 0);
  });

  it('formats one line per projection, largest count first', () => {
    const report = collectGpuReport(webgpuRenderer(new MeshletDrawingPipeline([
      {
        camera: 'PerspectiveCamera',
        shadow: false,
        batches: 12,
        counts: { 'standard: transparent': 2, meshlet: 300, 'standard: not a node material': 5 },
      },
      { camera: 'DirectionalLight', shadow: true, batches: 3, counts: { meshlet: 3 } },
    ])));

    assertEqual(report.stats.length, 2);
    assertEqual(report.stats[0].camera, 'PerspectiveCamera');
    assertEqual(report.stats[0].batches, 12);
    assertTrue(report.stats[0].counts.startsWith('meshlet 300'), report.stats[0].counts);
    assertEqual(report.stats[1].shadow, true);
  });

  it('prints nothing drawn when every count is zero', () => {
    const report = collectGpuReport(webgpuRenderer(new MeshletDrawingPipeline([
      { camera: 'Camera', shadow: false, batches: 0, counts: { meshlet: 0 } },
    ])));
    assertEqual(report.stats[0].counts, 'nothing drawn');
  });

  // A pipeline that throws must not take the whole dump with it.
  it('degrades to no stats when the pipeline throws', () => {
    const report = collectGpuReport(webgpuRenderer({
      getDrawingStats: () => {
        throw new Error('not attached to a scene');
      },
    }));
    assertEqual(report.stats.length, 0);
    assertEqual(report.rendererType, 'webgpu');
  });
});

describe('gpuReport: per-object path', () => {
  it('reads the path and the reason an object left the GPU path', () => {
    const pipeline = new MeshletDrawingPipeline([]);
    const object = { path: { path: 'standard', reason: 'not a node material' } };
    assertDeepEqual(readDrawablePath(pipeline, object), { path: 'standard', reason: 'not a node material' });
  });

  it('returns null for an object nothing recorded yet', () => {
    assertEqual(readDrawablePath(new MeshletDrawingPipeline([]), {}), null);
    assertEqual(readDrawablePath(new MeshletDrawingPipeline([]), null), null);
  });

  it('reaches the pipeline through the renderer wrapper', () => {
    const pipeline = new MeshletDrawingPipeline([]);
    assertEqual(readDrawingPipeline(webgpuRenderer(pipeline)), pipeline);
    assertEqual(readDrawingPipeline({ asWebGL: () => ({}) }), null);
  });
});