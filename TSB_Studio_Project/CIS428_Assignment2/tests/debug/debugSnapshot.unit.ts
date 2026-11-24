/**
 * Debug snapshot tests (layer 1).
 *
 * The overlay itself needs a DOM, which the harness does not provide, so the
 * maths and the renderer probing are covered here instead.
 */

import { describe, it } from '../../scripts/verify/harness.js';
import { assertClose, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import {
  FrameTimer,
  compassDirection,
  localVelocitiesToWorld,
  radiansToDegrees,
  readRenderStats,
  worldToBlock,
  worldToChunk,
} from '../../src/debug/DebugSnapshot.js';

describe('debug: localVelocitiesToWorld', () => {
  it('keeps forward motion on +Z at yaw 0', () => {
    const world = localVelocitiesToWorld({ forward: 5, right: 0, vertical: 0 }, 0);
    assertClose(world.x, 0);
    assertClose(world.y, 0);
    assertClose(world.z, 5);
  });

  it('keeps right motion on +X at yaw 0', () => {
    const world = localVelocitiesToWorld({ forward: 0, right: 3, vertical: 0 }, 0);
    assertClose(world.x, 3);
    assertClose(world.z, 0);
  });

  it('turns forward motion into -Z at yaw 180 degrees', () => {
    const world = localVelocitiesToWorld({ forward: 5, right: 0, vertical: 0 }, Math.PI);
    assertClose(world.x, 0);
    assertClose(world.z, -5);
  });

  it('turns forward motion into +X at yaw 90 degrees', () => {
    const world = localVelocitiesToWorld({ forward: 5, right: 0, vertical: 0 }, Math.PI / 2);
    assertClose(world.x, 5);
    assertClose(world.z, 0);
  });

  it('passes vertical speed through unchanged', () => {
    const world = localVelocitiesToWorld({ forward: 0, right: 0, vertical: -9.81 }, 1.234);
    assertClose(world.y, -9.81);
  });
});

describe('debug: worldToBlock', () => {
  it('floors positive coordinates', () => {
    const cell = worldToBlock({ x: 1.9, y: 11.9, z: 2.1 });
    assertEqual(cell.x, 1);
    assertEqual(cell.y, 11);
    assertEqual(cell.z, 2);
  });

  it('floors negative coordinates downwards', () => {
    const cell = worldToBlock({ x: -0.1, y: -0.1, z: -1.5 });
    assertEqual(cell.x, -1);
    assertEqual(cell.y, -1);
    assertEqual(cell.z, -2);
  });

  it('keeps exact integers on their own cell', () => {
    const cell = worldToBlock({ x: 0, y: 11, z: 0 });
    assertEqual(cell.x, 0);
    assertEqual(cell.y, 11);
    assertEqual(cell.z, 0);
  });
});

describe('debug: worldToChunk', () => {
  it('puts the origin in chunk 0,0', () => {
    const chunk = worldToChunk({ x: 0, y: 0, z: 0 }, 16);
    assertEqual(chunk.x, 0);
    assertEqual(chunk.z, 0);
  });

  it('keeps the last cell of a chunk inside it', () => {
    const chunk = worldToChunk({ x: 15.9, y: 0, z: 15.9 }, 16);
    assertEqual(chunk.x, 0);
    assertEqual(chunk.z, 0);
  });

  it('moves to the next chunk at the boundary', () => {
    const chunk = worldToChunk({ x: 16, y: 0, z: 16 }, 16);
    assertEqual(chunk.x, 1);
    assertEqual(chunk.z, 1);
  });

  it('handles negative coordinates', () => {
    const chunk = worldToChunk({ x: -1, y: 0, z: -17 }, 16);
    assertEqual(chunk.x, -1);
    assertEqual(chunk.z, -2);
  });
});

describe('debug: radiansToDegrees', () => {
  it('converts zero', () => {
    assertClose(radiansToDegrees(0), 0);
  });

  it('converts half a turn to 180', () => {
    assertClose(radiansToDegrees(Math.PI), 180);
  });

  it('normalises negative angles into [0, 360)', () => {
    const degrees = radiansToDegrees(-Math.PI / 2);
    assertClose(degrees, 270);
  });
});

describe('debug: compassDirection', () => {
  it('maps 0 to north', () => {
    assertEqual(compassDirection(0), 'north');
  });

  it('maps 90 to east', () => {
    assertEqual(compassDirection(90), 'east');
  });

  it('maps 180 to south', () => {
    assertEqual(compassDirection(180), 'south');
  });

  it('maps 270 to west', () => {
    assertEqual(compassDirection(270), 'west');
  });

  it('wraps 360 back to north', () => {
    assertEqual(compassDirection(360), 'north');
  });
});

describe('debug: readRenderStats', () => {
  it('returns null for a missing renderer', () => {
    assertEqual(readRenderStats(null), null);
  });

  it('returns null when neither backend is available', () => {
    assertEqual(readRenderStats({}), null);
  });

  it('reads WebGL counters from info.render.calls', () => {
    const stats = readRenderStats({
      asWebGL: () => ({ info: { render: { calls: 42, triangles: 1000 } } }),
      asWebGPU: () => null,
    });
    assertEqual(stats?.drawCalls, 42);
    assertEqual(stats?.triangles, 1000);
  });

  it('reads WebGPU counters from info.render.drawCalls', () => {
    const stats = readRenderStats({
      asWebGL: () => null,
      asWebGPU: () => ({ info: { render: { drawCalls: 7, triangles: 250 } } }),
    });
    assertEqual(stats?.drawCalls, 7);
    assertEqual(stats?.triangles, 250);
  });

  it('returns null when the backend exposes no info', () => {
    assertEqual(readRenderStats({ asWebGL: () => ({}), asWebGPU: () => null }), null);
  });
});

describe('debug: FrameTimer', () => {
  it('reports zero before any sample', () => {
    const timer = new FrameTimer();
    const stats = timer.sample(0);
    assertEqual(stats.fps, 0);
    assertEqual(stats.frameMs, 0);
  });

  it('reports 60 fps for 1/60 second frames', () => {
    const timer = new FrameTimer();
    let stats = timer.sample(1 / 60);
    for (let i = 0; i < 5; i++) {
      stats = timer.sample(1 / 60);
    }
    assertClose(stats.fps, 60, 0.5);
    assertClose(stats.frameMs, 1000 / 60, 0.5);
  });

  it('averages across samples', () => {
    const timer = new FrameTimer();
    timer.sample(1 / 60);
    const stats = timer.sample(1 / 30);
    assertClose(stats.fps, 40, 0.5);
  });

  it('drops old samples once the window is full', () => {
    const timer = new FrameTimer(2);
    timer.sample(1 / 60);
    timer.sample(1 / 60);
    const stats = timer.sample(1 / 30);
    assertClose(stats.fps, 40, 0.5);
  });

  it('clears on reset', () => {
    const timer = new FrameTimer();
    timer.sample(1 / 60);
    timer.reset();
    const stats = timer.sample(0);
    assertEqual(stats.fps, 0);
  });

  it('ignores non-positive deltas', () => {
    const timer = new FrameTimer();
    timer.sample(1 / 60);
    const stats = timer.sample(-1);
    assertTrue(stats.fps > 0);
  });
});