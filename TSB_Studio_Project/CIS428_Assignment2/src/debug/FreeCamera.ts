/**
 * A detached spectator camera for debugging.
 *
 * Minecraft's F3+C equivalent: the camera leaves the pawn and can be flown
 * around freely, which is the only way to see the player model, check the
 * collider wireframe from outside, or confirm where the spawn point actually is.
 *
 * The camera is a `ViewTargetCameraNode` pushed onto the world's view-target
 * stack. That stack is what `World.getActiveCamera()` reads, so pushing is all
 * that is needed to take over rendering — the pawn's own camera is untouched and
 * comes back the moment this one is popped.
 *
 * Movement is deliberately simple: WASD on the horizontal plane, Space/Ctrl for
 * vertical, and the mouse yaw/pitch is driven by the caller (the game mode owns
 * the pointer-lock deltas). No physics, no collision — a debug camera that can
 * clip through the world is more useful than one that cannot.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

/** Metres per second at full stick. */
const MOVE_SPEED = 12;

/** Radians per pixel of mouse movement. */
const LOOK_SENSITIVITY = 0.0025;

/** Clamps pitch so the camera never flips over. */
const MAX_PITCH = Math.PI / 2 - 0.01;

/** Input state the game mode feeds in each frame. */
export interface FreeCameraInput {
  /** -1 back, 0 none, +1 forward. */
  forward: number;
  /** -1 left, 0 none, +1 right. */
  right: number;
  /** -1 down, 0 none, +1 up. */
  up: number;
  /** Mouse delta in pixels since the last frame. */
  lookDeltaX: number;
  lookDeltaY: number;
}

/** A zeroed input state, used when nothing is held. */
export const IDLE_FREE_CAMERA_INPUT: Readonly<FreeCameraInput> = Object.freeze({
  forward: 0,
  right: 0,
  up: 0,
  lookDeltaX: 0,
  lookDeltaY: 0,
});

/**
 * Owns the detached camera node and its orientation.
 *
 * Yaw and pitch are kept as plain numbers rather than read back from the
 * `THREE.Euler` each frame: accumulating deltas into Euler angles loses
 * precision and can flip at the poles.
 */
export class FreeCamera {
  private readonly node: ENGINE.ViewTargetCameraNode;
  private yaw = 0;
  private pitch = 0;
  private active = false;

  /** World-space velocity from the last update, in metres per second. */
  private velocityX = 0;
  private velocityY = 0;
  private velocityZ = 0;

  private constructor(node: ENGINE.ViewTargetCameraNode) {
    this.node = node;
  }

  /**
   * Creates the camera node and adds it to the world.
   *
   * `world.add()` starts the node's lifecycle automatically when the world is
   * already playing, so no explicit `beginPlay()` call is needed (and calling
   * one would throw).
   */
  public static create(world: ENGINE.World, fov: number): FreeCamera {
    const node = ENGINE.ViewTargetCameraNode.create({
      name: 'FreeCamera',
      fov,
      near: 0.1,
      far: 1000,
    });
    world.add(node);
    return new FreeCamera(node);
  }

  /** True while this camera is the one being rendered. */
  public get isActive(): boolean {
    return this.active;
  }

  /** The underlying node, for callers that need the camera object itself. */
  public get cameraNode(): ENGINE.ViewTargetCameraNode {
    return this.node;
  }

  /**
   * Takes over rendering, starting from `position` looking along `yaw`.
   *
   * The starting orientation is copied from the pawn so the switch is not
   * disorienting — the view continues from where the player was looking.
   */
  public activate(position: THREE.Vector3, yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clampPitch(pitch);
    this.node.setWorldPosition(position.clone());
    this.applyRotation();
    this.node.setActive(true);
    this.active = true;
  }

  /** Hands rendering back to the pawn camera. */
  public deactivate(): void {
    if (!this.active) {
      return;
    }
    this.node.setActive(false);
    this.active = false;
  }

  /** Applies one frame of input. No-op while inactive. */
  public update(deltaTime: number, input: FreeCameraInput): void {
    if (!this.active) {
      return;
    }

    this.yaw -= input.lookDeltaX * LOOK_SENSITIVITY;
    this.pitch = clampPitch(this.pitch - input.lookDeltaY * LOOK_SENSITIVITY);
    this.applyRotation();

    const step = MOVE_SPEED * deltaTime;
    if (input.forward === 0 && input.right === 0 && input.up === 0) {
        this.velocityX = 0;
        this.velocityY = 0;
        this.velocityZ = 0;
        return;
      }

      // Horizontal movement follows yaw only, so looking up does not slow the
      // camera down the way a full 3D forward vector would.
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const dx = (-sin * input.forward + cos * input.right) * step;
      const dz = (-cos * input.forward - sin * input.right) * step;
      const dy = input.up * step;

      const position = this.node.getWorldPosition();
      position.x += dx;
      position.y += dy;
      position.z += dz;
      this.node.setWorldPosition(position);

      // Report speed rather than the per-frame step, so the readout is
      // framerate-independent and comparable to the pawn's velocity.
      this.velocityX = dx / deltaTime;
      this.velocityY = dy / deltaTime;
      this.velocityZ = dz / deltaTime;
    }

    /** World-space position of the camera. */
    public getPosition(): THREE.Vector3 {
      return this.node.getWorldPosition();
    }

    /** World-space velocity in metres per second, from the last update. */
    public getVelocity(): THREE.Vector3 {
      return new THREE.Vector3(this.velocityX, this.velocityY, this.velocityZ);
    }

    /** Current yaw in radians. */
    public getYaw(): number {
      return this.yaw;
    }

    /** Current pitch in radians. */
    public getPitch(): number {
      return this.pitch;
    }

  /** Removes the node from the world and releases the camera. */
  public destroy(): void {
    this.deactivate();
    this.node.removeFromParent();
  }

  private applyRotation(): void {
    this.node.setWorldRotation(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }
}

/** Keeps pitch inside the range where the camera does not flip. */
function clampPitch(pitch: number): number {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
}