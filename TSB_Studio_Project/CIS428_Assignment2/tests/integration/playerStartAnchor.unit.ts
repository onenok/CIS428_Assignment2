/**
 * The shipped `PlayerStart` must be usable by the engine's ground snap.
 *
 * `onBeforeBeginPlay` runs before the first physics step, so the pawn is spawned
 * while Rapier's scene queries are still empty: the character controller finds no
 * ground and the player free-falls into the terrain. `PlayerStart.snapToGround`
 * removes that race — it raycasts down and places the capsule on the hit — and
 * the engine's `resolveSpawnGround()` calls `syncSceneQueries()` first precisely
 * for this case.
 *
 * Snap is a *probe*, though, not a teleport: the ray starts
 * `SPAWN_GROUND_PROBE_UP` above the marker and is `SPAWN_GROUND_PROBE_DISTANCE`
 * long, so it only reaches floors in `[y - 6, y + 2]`. A marker parked high above
 * the surface logs `no walkable floor ... spawning at the marker position` and
 * falls back to the old free-fall — the bug comes back silently.
 *
 * That is what this file pins: the scene sets the flag, and the marker sits close
 * enough to the ground for the probe to find it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it } from '../../scripts/verify/harness.js';
import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { GROUND_SURFACE_Y } from '../../src/world/WorldGenConfig.js';

/**
 * Mirrors of the engine constants in `GameMode`.
 *
 * Copied rather than imported because they are module-private inside the engine
 * bundle. If an engine upgrade changes them, the numbers below are what the
 * failure message should be compared against.
 */
const PROBE_UP = 2;
const PROBE_DISTANCE = 8;

/** Lowest and highest floor Y the probe can reach from `anchorY`. */
function probeWindow(anchorY: number): { lowest: number; highest: number } {
  return { lowest: anchorY + PROBE_UP - PROBE_DISTANCE, highest: anchorY + PROBE_UP };
}

/** The scene sits two directories above `tests/integration`. */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCENE_PATH = path.join(PROJECT_ROOT, 'assets', 'default.genesys-scene');

interface SceneNode {
  readonly '$bc'?: string;
  readonly name?: string;
  readonly snapToGround?: boolean;
  readonly position?: { readonly _?: readonly number[] };
}

/** Every node in the scene, flattened. Written defensively: it is parsed JSON. */
function flattenScene(): SceneNode[] {
  const text = readFileSync(SCENE_PATH, 'utf8');
  const scene = JSON.parse(text) as { '$root'?: SceneNode };
  const out: SceneNode[] = [];

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }

    const node = value as Record<string, unknown>;
    if (typeof node['$bc'] === 'string') {
      out.push(node as unknown as SceneNode);
    }
    for (const [key, child] of Object.entries(node)) {
      // `$ref` points back at an object already in `$objects`; following it would
      // duplicate nodes. `uuid` is a string, harmless either way.
      if (key === '$ref') continue;
      walk(child);
    }
  };

  walk(scene['$root']);
  return out;
}

describe('I-P player start anchor', () => {
  const starts = flattenScene().filter(node => node['$bc'] === 'ENGINE.PlayerStart');

  it('has a PlayerStart in the shipped scene', () => {
    assertTrue(starts.length > 0, `no PlayerStart found in ${SCENE_PATH}`);
  });

  it('enables snapToGround, so the spawn does not depend on a physics step', () => {
    for (const start of starts) {
      assertEqual(start.snapToGround, true, `PlayerStart "${start.name}" must snap to the ground`);
    }
  });

  it('keeps the marker close enough to the surface for the probe to reach it', () => {
    for (const start of starts) {
      const anchorY = start.position?._?.[1];
      assertTrue(typeof anchorY === 'number', 'PlayerStart must have a numeric Y');

      const window = probeWindow(anchorY as number);
      assertTrue(
        GROUND_SURFACE_Y >= window.lowest && GROUND_SURFACE_Y <= window.highest,
        `PlayerStart y=${anchorY} probes ${window.lowest}..${window.highest}, which misses `
          + `the ground at ${GROUND_SURFACE_Y}; keep the marker within `
          + `${PROBE_DISTANCE - PROBE_UP} of the surface it stands on`,
      );
    }
  });

  it('probes a six-metre window, so the mirrored constants stay honest', () => {
    // A wrong mirror of the engine constants would make the check above pass for
    // any anchor. This asserts the shape the engine actually implements.
    const window = probeWindow(0);
    assertEqual(window.lowest, -6);
    assertEqual(window.highest, 2);
  });
}, 'unit');