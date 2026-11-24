/**
 * Layer 1 — NPC spawn resolution.
 *
 * The interesting part is the feet-to-pawn-origin conversion (`MovementPawn`'s origin is
 * the middle of the body, so it is half a height above the feet) and the fallback when
 * the scene has no marker. Both are pure, so no world is needed.
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import {
  LOOMKEEPER_FALLBACK_FEET,
  LOOMKEEPER_SPAWN_MARKER,
  NPC_HEIGHT,
  isFinitePoint,
  pawnCentreFromFeet,
  resolveNpcSpawn,
} from '../../src/character/npcSpawn.js';

describe('npcSpawn: feet to pawn origin', () => {
  it('lifts the origin by half the body height', () => {
    // `MovementPawn` centres its collider on the pawn origin, so handing it the feet
    // drops the NPC half a body into the ground — which is exactly what happened when
    // this briefly returned the feet unchanged.
    const origin = pawnCentreFromFeet({ x: 3, y: 11, z: -5 });
    assertEqual(origin.x, 3);
    assertEqual(origin.y, 11 + NPC_HEIGHT / 2);
    assertEqual(origin.z, -5);
  });

  it('leaves the horizontal position alone', () => {
    // A marker is placed where the NPC should stand, so sliding it in X/Z would
    // make the editor preview lie.
    const origin = pawnCentreFromFeet({ x: -12.5, y: 0, z: 7.25 });
    assertEqual(origin.x, -12.5);
    assertEqual(origin.z, 7.25);
  });
});

describe('npcSpawn: marker resolution', () => {
  it('uses the marker when the scene has one', () => {
    const spawn = resolveNpcSpawn({ x: 20, y: 11, z: -20 });
    assertEqual(spawn.source, 'marker');
    assertEqual(spawn.feet.x, 20);
    assertEqual(spawn.feet.z, -20);
    // Pawn origin sits half a body above the feet, matching the centred collider.
    assertEqual(spawn.pawnOrigin.y, 11 + NPC_HEIGHT / 2);
  });

  it('falls back when there is no marker', () => {
    const spawn = resolveNpcSpawn(null);
    assertEqual(spawn.source, 'fallback');
    assertEqual(spawn.feet.x, LOOMKEEPER_FALLBACK_FEET.x);
    assertEqual(spawn.feet.y, LOOMKEEPER_FALLBACK_FEET.y);
    assertEqual(spawn.feet.z, LOOMKEEPER_FALLBACK_FEET.z);
  });

  it('rejects a non-finite marker instead of teleporting to NaN', () => {
    // A broken scene file must not delete the NPC silently: NaN positions make
    // the model disappear with no error anywhere.
    const spawn = resolveNpcSpawn({ x: Number.NaN, y: 11, z: 0 });
    assertEqual(spawn.source, 'fallback');
    assertTrue(isFinitePoint(spawn.pawnOrigin), 'the resolved origin must be usable');
  });

  it('accepts a marker below the surface', () => {
    // The pit floor is a legitimate place to stand the NPC.
    const spawn = resolveNpcSpawn({ x: 8, y: 3, z: 8 });
    assertEqual(spawn.source, 'marker');
    assertEqual(spawn.feet.y, 3);
  });

  it('keeps the fallback NPC behind the player', () => {
    // N3 depends on the Loomkeeper speaking before it is seen, which only works
    // while the fallback sits at +Z.
    assertTrue(LOOMKEEPER_FALLBACK_FEET.z > 0, 'the fallback must stay behind the spawn');
    assertEqual(LOOMKEEPER_SPAWN_MARKER, 'LoomkeeperSpawn');
  });
});