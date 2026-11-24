/**
 * FlyingMovementNode - character movement with a flight mode.
 *
 * Extends `CharacterMovementNode` so the physics character controller, collision
 * resolution, ground detection and jump logic all keep working. Flight only
 * changes how vertical motion is produced:
 *
 *   grounded  -> normal gravity + jump (unchanged)
 *   flying    -> no gravity; ascend/descend driven by the fly keys
 *
 * Landing cancels flight automatically: the character controller still reports
 * `isGrounded`, so touching the ground while flying drops back to walking.
 *
 * The engine's `MovementMode` enum only has Walking/Falling, so flight is a
 * separate boolean rather than a third enum value. That keeps every engine
 * consumer of `getMovementMode()` correct without patching the enum.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

export interface FlyingMovementOptions extends ENGINE.CharacterMovementOptions {
  /** Vertical speed while flying, in units per second. */
  flySpeed?: number;
  /** Damp lambda for vertical acceleration while flying. */
  flyAccelerationLambda?: number;
  /** Damp lambda for vertical deceleration while flying. */
  flyDecelerationLambda?: number;
}

/**
 * Speed multiplier applied while the sprint key is held.
 *
 * 1.5 matches Minecraft's walk (4.317 m/s) to sprint (5.612 m/s) ratio. Applied
 * through the engine's `speedMultipliers` map rather than by scaling `maxSpeed`,
 * because the map stacks multiplicatively with other sources (a future slow
 * effect and sprint should combine, not overwrite each other).
 */
export const SPRINT_SPEED_MULTIPLIER = 1.5;

/** Key used in the engine's `speedMultipliers` map for sprinting. */
const SPRINT_MULTIPLIER_KEY = 'sprint';

/**
 * Decides whether a grounded report should end flight.
 *
 * Extracted as a pure function because the real `performMovementStep` needs a
 * physics-backed character controller to observe, which a headless test cannot
 * cheaply provide — and because this rule is exactly the thing that was wrong
 * (it used to be `isGrounded && verticalVelocity <= 0`, which fires while hovering
 * and cancels flight mid-air).
 *
 * All three conditions must hold:
 *   - `isGrounded`: the controller actually reports something below us,
 *   - `verticalInput < 0`: the player is actively descending. Hovering keeps the
 *     input at 0 and ascending at +1, so neither can ever cancel flight,
 *   - past the grace window: on the take-off frame the pawn is still standing on
 *     the ground, so one tap of the fly key would otherwise cancel itself.
 */
export function shouldCancelFlightOnGround(params: {
  isGrounded: boolean;
  verticalInput: number;
  flightAgeSeconds: number;
  landingGraceSeconds: number;
}): boolean {
  return params.isGrounded
    && params.verticalInput < 0
    && params.flightAgeSeconds >= params.landingGraceSeconds;
}

@ENGINE.GameClass()
export class FlyingMovementNode extends ENGINE.CharacterMovementNode {
  /** Vertical speed while flying, in units per second. */
  public flySpeed: number = 8;

  /** Damp lambda for vertical acceleration while flying. */
  public flyAccelerationLambda: number = 12;

  /** Damp lambda for vertical deceleration while flying. */
  public flyDecelerationLambda: number = 8;

  /** True while the pawn is flying. */
  public isFlying: boolean = false;

  /** -1 = descend, 0 = hover, +1 = ascend. Set by the controller each tick. */
  public verticalInput: number = 0;

    /**
     * Seconds since flight was last enabled.
     *
     * The frame flight turns on, the pawn is still resting on the ground, so the
     * first `computeCharacterMovement` call reports `isGrounded = true`. Landing
     * detection has to ignore that frame or one tap of the fly key would cancel
     * itself. Accumulated from `deltaTime` (not `performance.now()`) so headless
     * tests can drive it deterministically.
     */
    private flightAgeSeconds: number = 0;

    /**
     * How long after take-off the ground report is still ignored.
     *
     * Rapier's character controller reports `isGrounded = true` whenever the
     * downward sweep is blocked, which includes the frames right after lift-off.
     * 0.25s is comfortably longer than that while still short enough that a real
     * landing is never missed.
     */
    private readonly landingGraceSeconds: number = 0.25;

  public override initialize(options?: FlyingMovementOptions): void {
    super.initialize(options);
    this.flySpeed = options?.flySpeed ?? this.flySpeed;
    this.flyAccelerationLambda = options?.flyAccelerationLambda ?? this.flyAccelerationLambda;
    this.flyDecelerationLambda = options?.flyDecelerationLambda ?? this.flyDecelerationLambda;
  }

  /** Enables or disables flight. Disabling restores normal gravity. */
  public setFlying(flying: boolean): void {
    if (this.isFlying === flying) {
      return;
    }
    this.isFlying = flying;
      this.flightAgeSeconds = 0;
    if (!flying) {
      this.verticalInput = 0;
      // Hand control back to gravity from a standstill so the pawn does not
      // inherit a large upward velocity from the last flight frame.
      this.setVelocities(this.getVelocities().forward, this.getVelocities().right, 0);
    }
  }

  /** Enables or disables sprinting by maintaining a speed multiplier entry. */
    public setSprinting(sprinting: boolean): void {
      if (sprinting) {
        this.speedMultipliers.set(SPRINT_MULTIPLIER_KEY, SPRINT_SPEED_MULTIPLIER);
      } else {
        this.speedMultipliers.delete(SPRINT_MULTIPLIER_KEY);
      }
    }

    /** True while the sprint multiplier is applied. */
    public get isSprinting(): boolean {
      return this.speedMultipliers.has(SPRINT_MULTIPLIER_KEY);
    }

    /**
   * Flight overrides the vertical component of the movement step. Horizontal
   * movement, collision resolution and ground detection are inherited unchanged.
   */
  protected override performMovementStep(deltaTime: number, immediateBodySync: boolean = false): void {
    if (!this.isFlying) {
      super.performMovementStep(deltaTime, immediateBodySync);
      return;
    }

    const root = this.getRoot();
    if (!root) {
      return;
    }

    const clampedDelta = Math.min(deltaTime, 0.2);
        this.flightAgeSeconds += clampedDelta;
        // `effectiveSpeedModifier` includes `speedMultipliers`, which plain
        // `speedModifier` does not — using the latter here would silently drop sprint
        // while flying.
        const maxSpeed = this.maxSpeed * this.effectiveSpeedModifier;

    const forwardVelocity = this.updateVelocity({
      input: this.forwardInput,
      maxSpeed,
      currentSpeed: this.getVelocities().forward,
      accelerationLambda: this.accelerationLambda,
      decelerationLambda: this.decelerationLambda,
      deltaTime: clampedDelta,
    });
    const rightVelocity = this.updateVelocity({
      input: this.rightInput,
      maxSpeed,
      currentSpeed: this.getVelocities().right,
      accelerationLambda: this.accelerationLambda,
      decelerationLambda: this.decelerationLambda,
      deltaTime: clampedDelta,
    });

    const currentVertical = this.getVelocities().vertical;
    const targetVertical = this.verticalInput * this.flySpeed;
    const lambda = this.verticalInput !== 0 ? this.flyAccelerationLambda : this.flyDecelerationLambda;
    const verticalVelocity = THREE.MathUtils.damp(currentVertical, targetVertical, lambda, clampedDelta);

    this.setVelocities(forwardVelocity, rightVelocity, verticalVelocity);

    const deltaPosition = new THREE.Vector3(0, 0, 0);
    deltaPosition.add(root.forwardDirection().multiplyScalar(forwardVelocity * clampedDelta));
    deltaPosition.add(root.rightDirection().multiplyScalar(rightVelocity * clampedDelta));
    deltaPosition.y += verticalVelocity * clampedDelta;

    if (this.hasCharacterController && root instanceof ENGINE.PrimitiveNode) {
      const physicsEngine = this.getPhysicsEngine();
      if (physicsEngine) {
        const { isGrounded, actualMovement } = physicsEngine.computeCharacterMovement(
          this, root, deltaPosition.toArray(), false, clampedDelta, immediateBodySync,
        );
        root.position.x += actualMovement.x;
        root.position.y += actualMovement.y;
        root.position.z += actualMovement.z;
        root.setPhysicsTransformUpdateFlags({
          sendPosition: true,
          sendRotation: false,
          receivePosition: false,
          receiveRotation: false,
        });
        // While flying the ground report is not trustworthy: the character controller
                // reports `isGrounded` whenever the downward sweep is blocked, which also
                // happens while hovering (vertical displacement ~0) and on the frames right
                // after lift-off. Overwriting the grounded flag here would make the pawn
                // look landed mid-air and cancel flight — so it is deliberately left alone.
                if (shouldCancelFlightOnGround({
                  isGrounded,
                  verticalInput: this.verticalInput,
                  flightAgeSeconds: this.flightAgeSeconds,
                  landingGraceSeconds: this.landingGraceSeconds,
                })) {
          this.setFlying(false);
        }
      }
    } else {
      root.addWorldPosition(deltaPosition);
    }

    if (this.lookRightInput.value !== 0) {
      const rotationAmount = this.calculateRotationAmount(this.lookRightInput, this.lookRightSpeed, clampedDelta);
      root.addWorldRotation(ENGINE.MathHelpers.makeRotation({ yaw: rotationAmount }));
    }
  }

  public override getEditorClassIcon(): string | null {
    return 'Icon_Path';
  }
}