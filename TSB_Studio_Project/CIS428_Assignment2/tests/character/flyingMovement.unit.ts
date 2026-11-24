/**
 * FlyingMovement landing-rule tests.
 *
 * `performMovementStep` needs a physics-backed character controller, so the rule
 * that ends flight is extracted as a pure function and tested here. It used to be
 * `isGrounded && verticalVelocity <= 0`, which cancels flight while hovering —
 * the "flying in mid air then suddenly grounded" bug.
 */

import { describe, it } from '../../scripts/verify/harness.js';
import { assertFalse, assertTrue } from '../../scripts/verify/assert.js';
import { shouldCancelFlightOnGround } from '../../src/character/FlyingMovementNode.js';

const GRACE = 0.25;

function decide(isGrounded: boolean, verticalInput: number, flightAgeSeconds: number): boolean {
  return shouldCancelFlightOnGround({
    isGrounded,
    verticalInput,
    flightAgeSeconds,
    landingGraceSeconds: GRACE,
  });
}

describe('FlyingMovementNode: landing rule', () => {
  it('cancels flight when descending onto the ground', () => {
    assertTrue(decide(true, -1, 1));
  });

  it('keeps flying while hovering over something, even grounded (mid-air hover bug)', () => {
    // The controller reports grounded while hovering because the vertical sweep is
    // blocked; with vertical input at 0 that must not end flight.
    assertFalse(decide(true, 0, 1));
  });

  it('keeps flying while ascending away from the ground', () => {
    assertFalse(decide(true, 1, 1));
  });

  it('keeps flying during the take-off grace window', () => {
    // The frame flight starts the pawn is still standing on the ground.
    assertFalse(decide(true, -1, 0));
    assertFalse(decide(true, -1, GRACE - 0.01));
  });

  it('cancels at exactly the end of the grace window', () => {
    assertTrue(decide(true, -1, GRACE));
  });

  it('never cancels while airborne', () => {
    assertFalse(decide(false, -1, 10));
  });
});