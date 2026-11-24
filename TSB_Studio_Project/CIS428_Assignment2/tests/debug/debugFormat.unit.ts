/**
 * Debug overlay formatting tests (layer 1).
 *
 * The overlay writes these lines verbatim, so the layout is asserted here
 * rather than through the DOM.
 */

import { describe, it } from '../../scripts/verify/harness.js';
import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { formatDebugSnapshot } from '../../src/debug/debugFormat.js';
import { DEBUG_OVERLAY_STYLES } from '../../src/debug/DebugOverlay.js';

import type { DebugSnapshot } from '../../src/debug/DebugSnapshot.js';

function makeSnapshot(overrides: Partial<DebugSnapshot> = {}): DebugSnapshot {
  return {
    player: {
      position: { x: 0, y: 11.9, z: 0 },
      block: { x: 0, y: 11, z: 0 },
      chunk: { x: 0, z: 0 },
      yawDegrees: 180,
      grounded: true,
      velocity: { x: 0, y: 0, z: 0 },
    },
    freeCamera: null,
    world: {
      surfaceY: 10,
      groundTopY: 11,
      editable: { minX: -16, maxX: 15, minZ: -16, maxZ: 15, minY: 0, maxY: 255 },
      chunkCount: 25,
    },
    game: {
      phase: 'explore',
      buildMode: false,
      cameraMode: 'first-person',
      placedBlocks: 0,
      target: 'none',
    },
    input: {
      heldKeys: [],
      heldMouse: [],
      recentActions: [],
    },
    perf: {
      fps: 60,
      frameMs: 16.7,
      drawCalls: 42,
      triangles: 125000,
    },
    ...overrides,
  };
}

describe('debug format: player block', () => {
  it('prints the world position with three decimals', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[0], 'XYZ: 0.000 / 11.900 / 0.000');
  });

  it('prints the containing block', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[1], 'Block: 0 / 11 / 0');
  });

  it('prints the chunk', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[2], 'Chunk: 0 / 0');
  });

  it('prints the facing angle', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[3], 'Facing: 180.0°');
  });

  it('prints grounded as true', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[4], 'Grounded: true');
  });

  it('prints grounded as false when airborne', () => {
    const snapshot = makeSnapshot();
    const airborne: DebugSnapshot = {
      ...snapshot,
      player: { ...snapshot.player!, grounded: false },
    };
    const lines = formatDebugSnapshot(airborne);
    assertEqual(lines[4], 'Grounded: false');
  });

  it('signs the velocity components', () => {
    const snapshot = makeSnapshot();
    const falling: DebugSnapshot = {
      ...snapshot,
      player: { ...snapshot.player!, velocity: { x: 1.5, y: -9.81, z: 0 } },
    };
    const lines = formatDebugSnapshot(falling);
    assertEqual(lines[5], 'Velocity: +1.50 / -9.81 / +0.00');
  });

  it('reports a missing pawn instead of crashing', () => {
    const lines = formatDebugSnapshot(makeSnapshot({ player: null }));
    assertEqual(lines[0], 'XYZ: n/a (no pawn)');
  });
});

describe('debug format: world block', () => {
  it('prints the surface height and its top face', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[7], 'Surface Y: 10 (top face 11.0)');
  });

  it('prints the editable bounds', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[8], 'Editable: x[-16..15] z[-16..15] y[0..255]');
  });

  it('prints the chunk count', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[9], 'Chunks: 25 loaded');
  });
});

describe('debug format: game block', () => {
  it('prints the flow phase', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[11], 'Phase: explore');
  });

  it('prints the build mode flag', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[12], 'Build: false');
  });

  it('prints the camera mode', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[13], 'Camera: first-person');
  });

  it('prints the placed block count', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[14], 'Blocks placed: 0');
  });

  it('prints a negative placed count verbatim', () => {
    const snapshot = makeSnapshot();
    const negative: DebugSnapshot = {
      ...snapshot,
      game: { ...snapshot.game, placedBlocks: -2 },
    };
    const lines = formatDebugSnapshot(negative);
    assertEqual(lines[14], 'Blocks placed: -2');
  });

  it('prints the current target', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[15], 'Target: none');
  });
});

describe('debug format: perf block', () => {
  it('prints fps and frame time', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertTrue(lines.includes('FPS: 60  Frame: 16.7 ms'));
  });

  it('prints renderer counters', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertTrue(lines.includes('Draw calls: 42  Triangles: 125000'));
  });

  it('prints n/a when the renderer is unavailable', () => {
    const snapshot = makeSnapshot();
    const noRenderer: DebugSnapshot = {
      ...snapshot,
      perf: { ...snapshot.perf, drawCalls: null, triangles: null },
    };
    const lines = formatDebugSnapshot(noRenderer);
    assertTrue(lines.includes('Draw calls: n/a  Triangles: n/a'));
  });
});

describe('debug format: layout', () => {
  it('separates the four sections with blank lines', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertEqual(lines[6], '');
    assertEqual(lines[10], '');
    assertEqual(lines[16], '');
  });

  it('always produces the same number of lines', () => {
    const withPawn = formatDebugSnapshot(makeSnapshot());
    const withoutPawn = formatDebugSnapshot(makeSnapshot({ player: null }));
    assertEqual(withPawn.length, withoutPawn.length);
  });
});

describe('debug overlay: styles', () => {
  it('does not intercept pointer events', () => {
    assertEqual(DEBUG_OVERLAY_STYLES.pointerEvents, 'none');
  });

  it('anchors to the top right, clear of the engine stats panel', () => {
    assertEqual(DEBUG_OVERLAY_STYLES.top, '8px');
    assertEqual(DEBUG_OVERLAY_STYLES.right, '8px');
  });

  it('uses a fixed position so it survives scrolling', () => {
    assertEqual(DEBUG_OVERLAY_STYLES.position, 'fixed');
  });

  it('preserves whitespace for the multi-line readout', () => {
    assertEqual(DEBUG_OVERLAY_STYLES.whiteSpace, 'pre');
  });

  it('sits above the gameplay HUD', () => {
    assertTrue(Number(DEBUG_OVERLAY_STYLES.zIndex) >= 1000);
  });
});
describe('debug format: input block', () => {
  it('prints a dash when nothing is held', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    assertTrue(lines.includes('Keys: -'));
    assertTrue(lines.includes('Mouse: -'));
    assertTrue(lines.includes('Actions: -'));
  });

  it('separates held keys with spaces', () => {
    const lines = formatDebugSnapshot(makeSnapshot({
      input: { heldKeys: ['ControlLeft', 'KeyW'], heldMouse: [], recentActions: [] },
    }));
    assertTrue(lines.includes('Keys: ControlLeft KeyW'));
  });

  it('prints held mouse buttons by name', () => {
    const lines = formatDebugSnapshot(makeSnapshot({
      input: { heldKeys: [], heldMouse: ['left', 'middle'], recentActions: [] },
    }));
    assertTrue(lines.includes('Mouse: left middle'));
  });

  it('prints recent actions with their age in seconds', () => {
    const lines = formatDebugSnapshot(makeSnapshot({
      input: {
        heldKeys: [],
        heldMouse: [],
        recentActions: [{ name: 'flyDown', ageSeconds: 0.1 }],
      },
    }));
    assertTrue(lines.includes('Actions:'));
    assertTrue(lines.includes('  flyDown (0.1s)'));
  });

  it('puts each action on its own line', () => {
    const lines = formatDebugSnapshot(makeSnapshot({
      input: {
        heldKeys: [],
        heldMouse: [],
        recentActions: [
          { name: 'toggleFlight', ageSeconds: 2.3 },
          { name: 'flyDown', ageSeconds: 0.1 },
        ],
      },
    }));
    assertTrue(lines.includes('  toggleFlight (2.3s)'));
    assertTrue(lines.includes('  flyDown (0.1s)'));
  });

  it('places the input block after the game block', () => {
    const lines = formatDebugSnapshot(makeSnapshot());
    const targetIndex = lines.indexOf('Target: none');
    const inputIndex = lines.indexOf('--- Input ---');
    assertTrue(targetIndex >= 0);
    assertTrue(inputIndex > targetIndex);
  });
});
