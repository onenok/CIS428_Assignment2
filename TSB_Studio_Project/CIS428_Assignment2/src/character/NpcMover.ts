/**
 * NPC translation helper.
 *
 * The Loomkeeper moves by walking to a target position, not by tweening. That
 * matters because:
 *
 *   - `NpcMovementNode` already turns the actor towards its target and stops at
 *     a configurable distance, so no custom steering code is needed
 *   - it has no animation state machine, which is exactly the "no walk animation"
 *     behaviour the design asks for
 *   - `TweenMovementNode` would slide the model without turning it and without
 *     any collision, which reads as a bug rather than as movement
 *
 * `AIController` is not used because it only drives the newer Mover system
 * (`MoverNode` + `MoverCharacterPawn`), and this project is on the legacy
 * `CharacterPawn` stack.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

export interface NpcMoverOptions {
  /** Movement speed in metres per second. */
  readonly speed?: number;
  /** How close the NPC must get before it stops. */
  readonly stopDistance?: number;
  /** Turn rate in radians per second. */
  readonly turnSpeed?: number;
}

/** Default walking speed. Slow enough to read as "walking", not "dashing". */
export const DEFAULT_NPC_SPEED = 2.5;

/** Default stop distance in metres. */
export const DEFAULT_NPC_STOP_DISTANCE = 1.2;

/** Default turn rate in radians per second. */
export const DEFAULT_NPC_TURN_SPEED = 4;

/**
 * Creates the movement node for an NPC.
 *
 * Speed and turn rate are constructor options, not settable properties, so they
 * must be passed to `create()`. The node is returned rather than attached so the
 * caller decides where it goes in the NPC's hierarchy.
 */
export function createNpcMovementNode(options: NpcMoverOptions = {}): ENGINE.NpcMovementNode {
  const stopDistance = options.stopDistance ?? DEFAULT_NPC_STOP_DISTANCE;

  // Engine 19 renamed `movementSpeed` to `maxSpeed` and folded the old
    // `turnSpeed` option into `lookRightSpeed`, which is the yaw rate.
    return ENGINE.NpcMovementNode.create({
    name: 'NpcMovement',
      maxSpeed: options.speed ?? DEFAULT_NPC_SPEED,
      lookRightSpeed: options.turnSpeed ?? DEFAULT_NPC_TURN_SPEED,
    useNavigationServer: false,
    pathFollowingAccuracy: 0.25,
    actorFollowingDistance: stopDistance,
    stopDistance,
  });
}

/**
 * Sends an NPC to a world position.
 *
 * With `useNavigationServer = false` the node walks in a straight line, which is
 * what a flat build world needs; there is no navmesh to path through.
 */
export function moveNpcTo(
  node: ENGINE.NpcMovementNode,
  target: { x: number; y: number; z: number },
  stopDistance?: number,
): void {
  node.setTargetPosition(new THREE.Vector3(target.x, target.y, target.z), stopDistance);
}

/** Stops the NPC where it is. */
export function stopNpc(node: ENGINE.NpcMovementNode): void {
  node.stopMovement();
}

/** True when the NPC has arrived at its current target. */
export function hasNpcArrived(node: ENGINE.NpcMovementNode): boolean {
  return node.hasReachedCurrentTarget();
}