/**
 * The player's character.
 *
 * Extends the engine's `DefaultCharacterPawn` (which already provides the
 * onKeyDown / onMouseDown delegate hooks the controller forwards to) and
 * customises the six CharacterPawn extension points:
 *
 *   createCollision()          - Minecraft-style 0.6 x 1.8 x 0.6 box collider
 *   createMovementNode()       - CharacterMovementNode (inherited, unchanged)
 *   getInitialCameraPositions()- FIRST PERSON: pivot and camera coincide
 *   setupCamera()              - inherited (branches on the positions above)
 *   setupAnimationNode()       - inherited (engine mannequin animconfig)
 *   setupVisualNode()          - inherited (engine mannequin model)
 *
 * First person is chosen here because the god-view camera is a separate
 * `ViewTargetCameraNode` pushed onto the world camera stack, not a pawn camera.
 * Keeping the pawn camera first-person means switching modes is a single
 * push/pop and the pawn never has to rebuild its camera hierarchy.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { FlyingMovementNode } from './FlyingMovementNode.js';
import { PLAYER_MODEL_HEIGHT, PLAYER_MODEL_PATH } from './PlayerModel.js';
import {
  PLAYER_MODEL_ROTATION_ORDER,
  PLAYER_MODEL_UPRIGHT_ROTATION,
  PLAYER_MODEL_UPRIGHT_YAW,
  fitModel,
  skinnedBoundsInParent,
  isImplausibleFit,
  measureLocalBounds,
} from './modelFit.js';

/**
 * Player collider width and depth, in metres.
 *
 * Minecraft's player box is 0.6 x 1.8 x 0.6. The engine's default is a capsule
 * 0.9 wide, which rounds the feet and the shoulders: the player slides off block
 * corners instead of standing on the flat edge, and cannot fit through a
 * 1-block-wide gap that a Minecraft player fits through. A box also makes the
 * F3+B collider wireframe line up with the block grid, which is what makes
 * "standing exactly on a block edge" predictable.
 */
export const PLAYER_COLLISION_WIDTH = 0.6;

/** Player collider height, in metres (Minecraft: 1.8). */
export const PLAYER_COLLISION_HEIGHT = 1.8;

/**
 * Eye height above the pawn origin, in metres.
 *
 * The collider is shifted up so the pawn origin is the centre of its bottom face
 * — the Minecraft convention, which is what makes a standing position a whole
 * number. The eye is therefore measured from the feet: 1.62 leaves the camera
 * just below the top of the 1.8 m box.
 */
export const PLAYER_EYE_HEIGHT = 1.62;

/**
 * Edge length of the debug cube drawn at the pawn origin, in metres.
 *
 * The origin is the centre of the collider's bottom face, so the cube sits on the
 * floor with the player and makes the spawn height readable at a glance. Set it
 * to 0 to remove the marker. It is only shown while the collider wireframe is on
 * (F3+B), since it is a debug readout rather than scenery.
 */
export const PLAYER_ROOT_MARKER_SIZE = 0.2;

/**
 * First-person arm, in metres — Minecraft proportions (a 4 × 12 × 4 pixel arm on a
 * 16-pixel block is 0.25 × 0.75 × 0.25, shrunk to fit this game's framing).
 *
 * The arm is a mesh of its own under the camera pivot rather than the pawn's body
 * model with most of it hidden: the body is hidden in first person (otherwise the
 * camera sits inside the head), and a model cannot have one of its arms drawn while
 * the rest is culled. A separate box also costs a single draw call.
 */
const ARM_WIDTH = 0.12;
const ARM_LENGTH = 0.26;

/**
 * Where the arm's *elbow* sits in camera space, in metres.
 *
 * The swing rotates the arm about the elbow, not about the hand. A forearm pivoting
 * at the wrist reads as the whole limb spinning in place; pivoting at the elbow is
 * what makes the hand arc away from the viewer. The elbow is deliberately off the
 * bottom-right of the frame, so the player sees a forearm coming in from the corner
 * rather than a floating box.
 *
 * The node at this position is the pivot and the geometry extends `ARM_LENGTH / 2`
 * *above* it in local space — local `+Y` points up and away from the camera, so the
 * far end of the box is the hand.
 *
 * The numbers are chosen against the engine's fixed 60° vertical FOV
 * (`CAMERA_FOV`): at 0.30 m the visible frame is 0.34 m tall and 0.66 m wide, so an
 * elbow at `y = -0.33` sits below the bottom edge while the hand at `y = +0.12` is
 * still inside the frame.
 *
 * Being this close also is what keeps it visible: it is nearer than any wall the
 * player can stand against, so the ordinary depth test never lets terrain cover it.
 * The near plane is 0.1, so the nearest face stays clear of it.
 */
const ARM_ELBOW_OFFSET = new THREE.Vector3(0.234, -0.334, -0.297);

/**
 * Tilted so the player looks slightly down the arm and sees three faces of the
 * box. A box facing the camera flat-on reads as a coloured rectangle; the third
 * face is what makes it read as a limb.
 */
const ARM_TILT = new THREE.Euler(-0.5, -0.35, 0.12, 'YXZ');

/** Skin tone for the arm; the pawn's mannequin has no material to borrow. */
const ARM_COLOR = 0xe8b48f;

/**
 * How long one swing takes, in seconds.
 *
 * Six logic ticks at Minecraft's 20 Hz. Short enough that holding the button feels
 * like repeated hits rather than one slow wave.
 */
const SWING_DURATION = 0.3;

/**
 * Peak swing displacement, in metres, and peak swing rotation, in radians.
 *
 * **The sign is tied to which side of the pivot the mesh hangs on, and it is easy to
 * get backwards.** The geometry sits at local `+Y` (the hand is the far end), so
 * `Rx(+θ)` swings the hand *toward* the camera — at this size that fills the frame
 * with the back of the box, which is exactly the bug this comment exists to prevent.
 * `Rx(-θ)` swings the hand *away*, extending the arm forward toward whatever the
 * player is aiming at. Keep the sign negative, and if the mesh is ever moved back
 * below the pivot, flip it again.
 *
 * The yaw and roll are small: they exist to stop the arm from rotating on a single
 * axis, not to be a second animation.
 */
const SWING_PITCH = 0.85;
const SWING_YAW = 0.25;
const SWING_ROLL = 0.15;
const SWING_PUSH = 0.03;
const SWING_DROP = 0.02;

@ENGINE.GameClass()
export class MyCharacterPawn extends ENGINE.DefaultCharacterPawn {
  /**
     * Eye height above the pawn origin, in metres.
     *
     * The pawn origin is the centre of the collider's bottom face, so this is the
     * eye height above the feet.
     */
    public eyeHeight: number = PLAYER_EYE_HEIGHT;

  /** Whether the player's own model is rendered. First person starts hidden. */
  private bodyVisible = false;

    /** The debug cube at the pawn origin, if it was created. */
    private rootMarker: ENGINE.MeshNode | null = null;

    /**
         * The first-person arm's wrist pivot, if it was created.
         *
         * The swing rotates this node; the box hangs below it as a child.
         */
        private firstPersonArm: ENGINE.SceneNode | null = null;

      /**
       * Swing animation state.
       *
       * `swingProgress` runs 0 → 1 and is advanced by `tickPrePhysics`, so one swing
       * takes `SWING_DURATION` seconds of wall time regardless of frame rate. There is
       * no separate fixed-tick accumulator and no partial-tick interpolation between the
       * logic step and the render step: this engine ticks once per frame with a real
       * `deltaTime`, so advancing by `deltaTime / SWING_DURATION` already gives the same
       * speed at 30 and 300 fps. An accumulator would add a frame of latency for nothing.
       */
      private swingProgress = 0;
      private isSwinging = false;

  public override initialize(options?: ENGINE.CharacterPawnOptions): void {
    super.initialize(options);
      this.addRootMarker();
        this.addFirstPersonArm();
    }

    /**
       * Adds a small unlit cube at the pawn origin, which is the centre of the
       * collider's bottom face — in other words, where the player's feet are.
       *
         * It is a debugging aid, not scenery, so it starts hidden and is switched on by
         * the same key that draws the collider wireframe (F3+B). Showing it always would
         * put a bright magenta cube at the player's feet in every screenshot.
         *
       * `MeshBasicMaterial` rather than a lit material, and `depthTest` off, so the
       * marker stays bright and visible through the ground — a shaded cube half
       * buried in the terrain would answer nothing.
       */
      private addRootMarker(): void {
      if (PLAYER_ROOT_MARKER_SIZE <= 0) {
        return;
      }

      const marker = ENGINE.MeshNode.create({
        name: 'RootMarker',
        geometry: new THREE.BoxGeometry(
          PLAYER_ROOT_MARKER_SIZE,
          PLAYER_ROOT_MARKER_SIZE,
          PLAYER_ROOT_MARKER_SIZE,
        ),
        material: new THREE.MeshBasicMaterial({
          color: 0xff00ff,
          depthTest: false,
          transparent: true,
          opacity: 0.85,
        }),
        physicsOptions: { enabled: false },
        castShadow: false,
      });
      marker.renderOrder = 999;
        marker.visible = false;
      this.add(marker);
        this.rootMarker = marker;
    }

    /**
     * Shows or hides the pawn-origin marker.
     *
     * Driven by the collider-debug key (F3+B) so the cube appears exactly when the
     * player is already looking at physics debug output.
     */
    public setRootMarkerVisible(visible: boolean): void {
      if (this.rootMarker) {
        this.rootMarker.visible = visible;
      }
  }

    /**
     * Builds the first-person arm and parents it to the camera pivot.
     *
     * The pivot is the node the look-up/down input drives, so the arm follows the
     * view without any per-frame code. Parenting to the pivot rather than to the pawn
     * root is what makes it stay in the bottom-right corner of the screen instead of
     * swinging when the player turns.
     *
     * The arm is an ordinary opaque mesh very close to the camera: nearer than any
          * wall the player can stand against, so the ordinary depth test never lets the
          * world cover it. Drawing it with the depth test (or depth write) off does *not*
          * work here — the voxel terrain is a separate render pass that ignores
          * `renderOrder` and painted straight over the arm.
     */
    private addFirstPersonArm(): void {
      const pivot = this.cameraPivot;
      if (!pivot) {
        return;
      }

          // The elbow. `applyFirstPersonArmPose()` rewrites this node's position and
                // rotation every frame, so `ARM_ELBOW_OFFSET` / `ARM_TILT` are its resting pose.
                const elbow = ENGINE.SceneNode.create({
        name: 'FirstPersonArm',
                  position: ARM_ELBOW_OFFSET.clone(),
        rotation: ARM_TILT.clone(),
        visible: false,
                });

                // The forearm, extending *up* from the elbow in local space. `+Y` points up and
                // away from the camera, so the far end of the box is the hand and the near end —
                // the one in the corner of the frame, and the one the swing rotates about — is
                // the elbow.
                //
                // A plain depth-tested, depth-writing material. Both flags matter: with the
                // depth test off the arm is drawn but the ground still paints over it, because
                // the terrain is a separate pass that ignores `renderOrder`; with the depth
                // *write* off the terrain's own depth test sees no arm and covers it anyway.
                const arm = ENGINE.MeshNode.create({
                  name: 'FirstPersonArmMesh',
                  geometry: new THREE.BoxGeometry(ARM_WIDTH, ARM_LENGTH, ARM_WIDTH),
                  material: new THREE.MeshLambertMaterial({ color: ARM_COLOR }),
                  position: new THREE.Vector3(0, ARM_LENGTH / 2, 0),
        physicsOptions: { enabled: false },
        castShadow: false,
                  receiveShadow: false,
      });
                elbow.add(arm);
                pivot.add(elbow);
                this.firstPersonArm = elbow;
                this.applyFirstPersonArmPose();
              }

        /**
         * Starts a swing, or restarts one that is already running.
         *
         * Restarting on every click is what makes a held button read as repeated hits;
         * Minecraft lets the previous swing be cut short the same way.
         */
        public triggerSwing(): void {
          if (!this.firstPersonArm) {
            return;
          }
          this.isSwinging = true;
          this.swingProgress = 0;
        }

        /** True while the hand is mid-swing. Exposed for tests and for HUD hooks. */
        public get isSwingActive(): boolean {
          return this.isSwinging;
        }

        /** Advances the swing animation. The arm's pose is rewritten from the result. */
        public override tickPrePhysics(deltaTime: number): void {
          super.tickPrePhysics(deltaTime);

          if (!this.isSwinging) {
            return;
          }

          this.swingProgress += deltaTime / SWING_DURATION;
          if (this.swingProgress >= 1) {
            this.swingProgress = 1;
            this.isSwinging = false;
          }
          this.applyFirstPersonArmPose();
        }

        /**
                 * Writes the current swing frame onto the elbow node.
         *
         * Two curves rather than one, because a single `sin` gives a symmetric out-and-back
         * that feels mechanical. `swingArc` (`sin(sqrt(p)·π)`) peaks a quarter of the way in
         * and decays slowly, so the hand snaps out and drifts back; `swingSnap`
         * (`sin(p·π)`) peaks at the halfway point and drives the sideways flick.
         *
                 * The hand extends *forward, away from the camera*, while the elbow stays in the
                 * corner of the frame. See `SWING_PITCH` for why the sign matters.
         *
         * The arm is hidden, not merely transparent, when the body is shown (see
         * `hideBody`), so this method is safe to call at any time.
         */
        private applyFirstPersonArmPose(): void {
                  const elbow = this.firstPersonArm;
                  if (!elbow) {
            return;
          }

          // Progress of 0 also covers "not swinging", where both curves are 0 and the pose
          // collapses back to the resting values below.
          const p = this.swingProgress;
          const swingArc = Math.sin(Math.sqrt(p) * Math.PI);
          const swingSnap = Math.sin(p * Math.PI);

                  // The elbow itself barely moves: a punch is the forearm rotating, not the whole
                  // limb sliding forward. The small push toward the camera and drop sell the weight.
                  elbow.position.set(
                    ARM_ELBOW_OFFSET.x - swingArc * SWING_PUSH * 0.4,
                    ARM_ELBOW_OFFSET.y - swingArc * SWING_DROP,
                    ARM_ELBOW_OFFSET.z + swingArc * SWING_PUSH,
          );
                  elbow.rotation.set(
                    ARM_TILT.x - swingArc * SWING_PITCH,
            ARM_TILT.y + swingSnap * SWING_YAW,
            ARM_TILT.z + swingArc * SWING_ROLL,
          );
    }

  /** The flight-capable movement node, if the pawn was built with one. */
  public get flyingMovement(): FlyingMovementNode | null {
    const node = this.movementNode;
    return node instanceof FlyingMovementNode ? node : null;
  }

  /** Enables or disables flight. No-op when the movement node cannot fly. */
  public setFlying(flying: boolean): void {
    this.flyingMovement?.setFlying(flying);
  }

  public get isFlying(): boolean {
    return this.flyingMovement?.isFlying ?? false;
  }

  /** -1 descend, 0 hover, +1 ascend. Ignored unless flying. */
  public setVerticalInput(value: number): void {
    const movement = this.flyingMovement;
    if (movement) {
      movement.verticalInput = value;
    }
  }

    /**
     * Enables or disables sprinting.
     *
     * Routed to the movement node rather than multiplying a speed here, because the
     * node owns the velocity integration and already exposes stacked speed
     * multipliers (so a future slow effect and sprint combine instead of the last
     * one winning).
     */
    public setSprinting(sprinting: boolean): void {
      this.flyingMovement?.setSprinting(sprinting);
    }

    /** True while the sprint multiplier is applied. */
    public get isSprinting(): boolean {
      return this.flyingMovement?.isSprinting ?? false;
    }

    /**
     * Requests a jump. No-op when the pawn has no flight-capable movement node.
     *
     * Exposed so the game mode can own the Space key outright: the controller now
     * swallows Space so that `flyUp` and `jump` cannot both fire, which means the
     * engine's own jump handling never runs and the jump has to be triggered here.
     */
    public requestJump(): void {
      this.flyingMovement?.jump();
    }

    /**
     * True when the movement node reports the pawn standing on something.
     *
         * Reads the strict `isGrounded` accessor, which engine 20 renamed from
         * `getGrounded()`. It reports the state as of the last movement step, so it is
         * already false on the first frame of a jump even while still touching the
         * floor.
         *
         * @gotcha the *coyote-time* variant is a separate accessor,
         * `canGroundJump` (`grounded || airTime < coyoteTime`). Do not use this getter
         * as a "can I jump" test.
     */
    public get isGrounded(): boolean {
            return this.flyingMovement?.isGrounded ?? false;
    }

  protected override createMovementNode(): ENGINE.BasePawnMovementNode {
    return FlyingMovementNode.create({ name: 'MovementNode' });
  }

      /**
       * Replaces the inherited capsule with Minecraft's axis-aligned box, whose origin
       * is the centre of its bottom face — so the pawn's `y` is its feet, and standing
       * on a block reads as a whole number.
       *
       * The box therefore sits *above* the node origin, which is why
       * `MyGameMode.resolveSpawnGround` subtracts half a body from the engine's own
       * floor answer.
       *
       * `CollisionShapeNode` is the engine's "geometry only defines a collider" node.
       * A `BoxGeometry` becomes a Rapier cuboid (the engine's compound-part builder
             * falls through to `kind: "box"` using the geometry's bounding box), so the
             * collider is exactly `PLAYER_COLLISION_WIDTH` x `PLAYER_COLLISION_HEIGHT`.
             *
       * `contributeToParentCollider` is what the base class sets: the collider joins
       * the pawn's kinematic body instead of spawning a second body that the
       * movement node would then have to drag along.
       *
       * @gotcha `createCollision` runs before `super.initialize`, so it cannot read
       * any option or field set during initialisation — the size has to be a
       * module constant, not a tunable property.
       */
      protected override createCollision(): ENGINE.SceneNode | null {
        return ENGINE.CollisionShapeNode.create({
          name: 'Collision',
          geometry: new THREE.BoxGeometry(
            PLAYER_COLLISION_WIDTH,
            PLAYER_COLLISION_HEIGHT,
            PLAYER_COLLISION_WIDTH,
          ),
          position: new THREE.Vector3(0, PLAYER_COLLISION_HEIGHT / 2, 0),
                selfHidden: true,
                physicsOptions: {
                  enabled: true,
                  contributeToParentCollider: true,
                },
              });
            }

    /**
     * Builds the visual model, then hides it in game.
     *
     * First person means the camera sits inside the model, so the model must not
     * render or the player sees the inside of their own head. `setHiddenInGame`
     * is used rather than `visible = false` because it keeps the shadow and the
     * animation running, and it leaves the model visible in the editor.
     *
     * The model is `assets/models/steve-minecraft.glb` — a skinned, animated glTF —
     * so it needs no half-body lift the way the engine's mannequin did: its own feet
     * are already at y = 0. `modelUrl` resolves asynchronously, so the height is only
     * known after the mesh arrives; {@link fitModelToFeet} measures it then.
     */
    protected override setupVisualNode(): ENGINE.SceneNode | null {
      const visual = ENGINE.ModelMeshNode.create({
        name: 'PlayerModel',
        modelUrl: PLAYER_MODEL_PATH as ENGINE.ModelPath,
        physicsOptions: { enabled: false },
        castShadow: true,
      });

      visual.onMeshLoaded.add(() => this.fitModelToFeet(visual));
      // Attaching here is required: `CharacterPawn.initialize()` throws when the visual
      // node has no parent, and a node that never entered play makes `endPlay()` fail
      // its state assertion on teardown.
      this.add(visual);
      visual.setHiddenInGame(true);
      return visual;
    }

    /**
     * Scales the loaded model to `PLAYER_MODEL_HEIGHT` and puts its feet on the origin.
     *
     * Two things have to happen before measuring:
     *
     *   1. The glb is a Sketchfab export and ships a display disc (`Circle_0`) under the
     *      character. It is not part of the player, so it is removed — and it has to be
     *      removed *before* measuring, because `Box3.setFromObject` traverses every
     *      child regardless of visibility. Left in, it both renders as a platform at the
     *      feet and inflates the bounds from 4.0 × 8.0 × 2.0 to 16.4 × 11.0 × 16.4,
     *      which makes the character come out at roughly half its intended size.
     *   2. The scale is derived by measuring, because `modelUrl` resolves
     *      asynchronously and the export's units are nobody's metres.
     *
     * The pawn origin is the **feet** — the player's collider is a box that sits above
     * the origin, deliberately, so standing on a block reads as a whole number. The
     * model's own feet are therefore placed at local y = 0.
     */
    private fitModelToFeet(mesh: ENGINE.ModelMeshNode): void {
      this.stripDisplayGeometry(mesh);
      this.standUpright(mesh);

      // Prefer the skinned bounds: for a posed skeleton they are the only measurement that
      // describes what is on screen. Fall back to the plain box for a static mesh.
      const bounds = skinnedBoundsInParent(mesh) ?? measureLocalBounds(mesh);
      if (!bounds) {
        console.warn('[MyCharacterPawn] player model fit failed: empty bounds');
        return;
      }

      // The player pawn's origin is its feet, so the anchor is local y = 0.
      const fit = fitModel(bounds, PLAYER_MODEL_HEIGHT, 0);
      if (!fit) {
        console.warn('[MyCharacterPawn] player model fit failed: degenerate bounds', bounds);
        return;
      }

      mesh.scale.setScalar(fit.scale);
      mesh.position.y = fit.offsetY;

      // Scaling moved the skinned bounds, so re-ground from the scaled pose rather than
      // trusting the pre-scale offset.
      const scaled = skinnedBoundsInParent(mesh);
      if (scaled) {
        mesh.position.y -= scaled.minY;
      }

      const fitted = scaled ?? measureLocalBounds(mesh);
      const fittedHeight = fitted?.height ?? Number.NaN;
      if (isImplausibleFit(fittedHeight, PLAYER_MODEL_HEIGHT)) {
        // Loud on purpose: a wrong size throws nothing and is easy to miss on screen.
        console.warn(
          `[MyCharacterPawn] player model is ${fittedHeight.toFixed(3)} m tall, expected ${PLAYER_MODEL_HEIGHT} m`,
        );
      }
    }

    /**
     * Turns the model back up if it arrived lying on its back.
     *
     * The Steve asset is a Sketchfab export: `Sketchfab_model` carries a −90° X matrix
     * (Z-up to Y-up) and `GLTF_SceneRootNode` below it carries the +90° that cancels it.
     * If a loader drops the outer wrapper the character ends up flat. The direction is
     * taken from the **head bone**, not from the bounding box, because this model is
     * skinned: its geometry bounds report an upright 4.0 × 8.0 × 2.0 even while the
     * bones draw it lying down.
     */
    private standUpright(mesh: ENGINE.ModelMeshNode): void {
      // Constant correction, not a measurement: see PLAYER_MODEL_UPRIGHT_ROTATION for
      // why nothing measurable on a skinned mesh can tell us this.
      mesh.rotation.order = PLAYER_MODEL_ROTATION_ORDER;
      mesh.rotation.set(
        PLAYER_MODEL_UPRIGHT_ROTATION,
        PLAYER_MODEL_UPRIGHT_YAW,
        0,
      );
    }

    /**
     * Removes the display disc that Sketchfab exports include under the model.
     *
     * Matched by name rather than by size or position, because a size heuristic would
     * also catch the character's own flat parts. `Circle_0` is the name the exporter
     * gives the sketch platform.
     */
    private stripDisplayGeometry(mesh: ENGINE.ModelMeshNode): void {
      const doomed: THREE.Object3D[] = [];
      mesh.traverse(object => {
        if (/^circle/i.test(object.name)) {
          doomed.push(object);
        }
      });
      for (const object of doomed) {
        object.removeFromParent();
      }
    }

        /**
         * Re-applies the first-person body hiding once the pawn is in a world.
         *
         * Two things make this necessary:
         *  - `initialize()` runs before the pawn is parented to a world, so the
         *    layer change in `setHiddenInGame()` was a no-op.
         *  - the glTF arrives later still, and each mesh it adds starts on layer 0.
         *
         * Re-asserting on `beginPlay` covers the first case; the `onMeshLoaded`
         * subscription covers every (re)load.
         */
        public override beginPlay(): boolean {
          const started = super.beginPlay();
          if (!started) {
            return false;
          }

          this.hideBody();
          const model = this.visualNode;
          if (model instanceof ENGINE.ModelMeshNode) {
            model.onMeshLoaded.add(() => this.hideBody());
          }
          return true;
        }

        /** Applies the current body-visibility state to the loaded meshes. */
        private hideBody(): void {
          this.visualNode?.setHiddenInGame(!this.bodyVisible);
                  // The arm is the mirror image of the body: it is the only part of the player
                  // that should be on screen in first person, and the only part that should not
                  // be on screen when the body is shown (it would sit inside the shoulder).
                  if (this.firstPersonArm) {
                    this.firstPersonArm.visible = !this.bodyVisible;
                  }
        }

    /** Shows or hides the player's own model. */
    public setBodyVisible(visible: boolean): void {
          this.bodyVisible = visible;
          this.hideBody();
        }

        /** True when the player's own model is rendered. */
        public get isBodyVisible(): boolean {
          return this.bodyVisible;
        }

                /**
                 * Current camera pitch in radians.
                 *
                 * Pitch lives on the camera pivot, not on the pawn root: the movement node
                 * writes yaw into the root, while `CharacterPawn.updateCamera()` writes
                 * pitch into `cameraPivot.rotation.x`. Reading the root's `rotation.x`
                 * always returns 0, which is why the free camera used to start level.
                 */
                public getCameraPitch(): number {
                  return this.cameraPivot?.rotation.x ?? 0;
                }

  /**
   * First person: pivot and camera at the same point, so `setupCamera()` takes
   * the "no spring arm" branch and attaches the camera directly to the pivot.
   */
  protected override getInitialCameraPositions(): {
    pivotPosition: THREE.Vector3;
    cameraPosition: THREE.Vector3;
  } {
    const pivotPosition = new THREE.Vector3(0, this.eyeHeight, 0);
    return { pivotPosition, cameraPosition: pivotPosition.clone() };
  }
}
