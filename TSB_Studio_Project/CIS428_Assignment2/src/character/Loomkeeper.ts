/**
 * The Loomkeeper — the NPC the player talks to.
 *
 * Built on `MovementPawn` rather than `CharacterPawn` because the latter
 * *requires* a camera (it throws if `setupCamera()` returns an unattached node).
 * An NPC has no camera; it only needs a body, a collider and a movement node.
 *
 * Movement uses `NpcMovementNode` (see `NpcMover.ts`): it turns towards its
 * target and stops at a configurable distance, and it has no animation state
 * machine — which is exactly the "walks without a walk animation" behaviour the
 * design asks for.
 *
 * ## The model
 *
 * `assets/models/Loomkeeper.glb` — the VoxEdit export, unmodified. That file is the
 * complete rig: 45 meshes across 106 nodes, including the parts an earlier hand-built
 * version was missing (the neck and `HeadCore`, both arms down to `ForeArm` and
 * `Hand`, and three-segment legs). Its textures carry the palette too — stone grey,
 * sandstone, the wood-brown shoulder blocks and the blue core — so loading the export
 * is both more faithful and less code than rebuilding it.
 *
 * It is a `ModelMeshNode` for two reasons: `SkeletonUtils.clone` gives each instance
 * its own skeleton, and if an animation is ever added to the export it arrives through
 * `getAnimations()` without code changes.
 *
 * ## The collider
 *
 * A box, not the engine's default capsule. The character is wider than it is deep —
 * the shoulder armour and arms push the silhouette out sideways — so a capsule would
 * either be too fat front-to-back or too thin across the shoulders. A box matches the
 * visual, and it is the same approach `MyCharacterPawn` uses for the player.
 *
 * ## The spawn point
 *
 * Not this class's business: `MyGameMode` places the pawn from the `LoomkeeperSpawn`
 * scene marker (see `npcSpawn.ts`). This file only builds the body and the look.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { createNpcMovementNode } from './NpcMover.js';
import { NPC_HEIGHT } from './npcSpawn.js';
import { LOOMKEEPER_FOOTPRINT, LOOMKEEPER_MODEL_HEIGHT, LOOMKEEPER_MODEL_PATH } from './LoomkeeperModel.js';
import { fitModel, isImplausibleFit, measureLocalBounds, uprightRotationX } from './modelFit.js';

/** Size of the pawn-origin marker cube, in metres. Same value the player uses. */
export const LOOMKEEPER_ROOT_MARKER_SIZE = 0.08;

/**
 * Collider half-extents, in metres.
 *
 * Taken from {@link LOOMKEEPER_FOOTPRINT}, which is derived from the rig's widest
 * parts, so the hitbox follows the model instead of a guessed capsule radius.
 */
export const LOOMKEEPER_COLLIDER_HALF = {
  x: LOOMKEEPER_FOOTPRINT.width / 2,
  y: NPC_HEIGHT / 2,
  z: LOOMKEEPER_FOOTPRINT.depth / 2,
} as const;

@ENGINE.GameClass()
export class Loomkeeper extends ENGINE.MovementPawn {
  private visualNode: ENGINE.SceneNode | null = null;
  private rootMarker: ENGINE.MeshNode | null = null;

  public override initialize(options: ENGINE.MovementPawnOptions = { movementNode: null }): void {
    super.initialize({
      ...options,
      movementNode: createNpcMovementNode(),
      physicsOptions: {
        enabled: true,
        motionType: ENGINE.PhysicsMotionType.KinematicPositionBased,
        collisionProfile: ENGINE.DefaultCollisionProfile.Character,
        ...options?.physicsOptions,
      },
    });

    this.addCollision();
    this.addVisual();
    this.addRootMarker();
  }

  /** The movement node, typed for the NPC helpers. */
  public get npcMovement(): ENGINE.NpcMovementNode | null {
    const node = this.movementNode;
    return node instanceof ENGINE.NpcMovementNode ? node : null;
  }

  /** The model, once {@link addVisual} has created it. */
  public get model(): ENGINE.SceneNode | null {
    return this.visualNode;
  }

  /** True while the pawn-origin marker is on screen. */
  public get isRootMarkerVisible(): boolean {
    return this.rootMarker?.visible ?? false;
  }

  /**
   * Box collider sized to the model, centred on the pawn origin.
   *
   * Centred — not starting at the origin — because `MovementPawn` puts the pawn origin at
   * the middle of the body, which is why `npcSpawn.pawnCentreFromFeet()` adds half a
   * height. Offsetting the box to start at the origin while the spawn still positioned
   * the pawn as a centre dropped the NPC a whole block into the ground.
   */
  private addCollision(): void {
    const box = ENGINE.MeshNode.create({
      name: 'CollisionBox',
      geometry: new THREE.BoxGeometry(
        LOOMKEEPER_COLLIDER_HALF.x * 2,
        LOOMKEEPER_COLLIDER_HALF.y * 2,
        LOOMKEEPER_COLLIDER_HALF.z * 2,
      ),
      selfHidden: true,
      physicsOptions: {
        enabled: true,
        contributeToParentCollider: true,
      },
    });
    this.add(box);
  }

  /**
   * Loads the VoxEdit export and sits it on the grounded feet.
   *
   * The pawn origin is the **centre** of the collider, not the feet — see
   * `pawnCentreFromFeet()` — so the model is pushed down by half the body height.
   *
   * The fit is measured from the loaded bounding box rather than assumed: `modelUrl`
   * resolves asynchronously, so the height is only knowable after the mesh arrives,
   * and measuring it makes the model exactly {@link LOOMKEEPER_MODEL_HEIGHT} tall
   * whatever units the export happens to use. Doing it in the `onMeshLoaded` callback
   * is what makes it happen at all.
   */
  private addVisual(): void {
    const mesh = ENGINE.ModelMeshNode.create({
      name: 'LoomkeeperModel',
      modelUrl: LOOMKEEPER_MODEL_PATH as ENGINE.ModelPath,
      physicsOptions: { enabled: false },
      castShadow: true,
    });

    mesh.onMeshLoaded.add(() => this.fitModelToFeet(mesh));

    this.add(mesh);
    this.visualNode = mesh;
  }

  /** Scales the loaded model to the target height and drops its feet to y = 0. */
  private fitModelToFeet(mesh: ENGINE.ModelMeshNode): void {
    this.standUpright(mesh);

    const bounds = measureLocalBounds(mesh);
    if (!bounds) {
      console.warn('[Loomkeeper] model fit failed: empty bounds');
      return;
    }

    // The pawn origin is the centre of the collider, so the model's feet belong half a
    // body below it — the same anchor the capsule-based version used.
    const fit = fitModel(bounds, LOOMKEEPER_MODEL_HEIGHT, -NPC_HEIGHT / 2);
    if (!fit) {
      console.warn('[Loomkeeper] model fit failed: degenerate bounds', bounds);
      return;
    }

    mesh.scale.setScalar(fit.scale);
    mesh.position.y = fit.offsetY;

    const fitted = measureLocalBounds(mesh);
    const fittedHeight = fitted?.height ?? Number.NaN;
    if (isImplausibleFit(fittedHeight, LOOMKEEPER_MODEL_HEIGHT)) {
      console.warn(
        `[Loomkeeper] model is ${fittedHeight.toFixed(3)} m tall, expected ${LOOMKEEPER_MODEL_HEIGHT} m`,
      );
    }
  }

  /** Turns the model back up if the export's up-axis wrapper was dropped on import. */
  private standUpright(mesh: ENGINE.ModelMeshNode): void {
    const measured = measureLocalBounds(mesh);
    if (!measured) {
      return;
    }
    const rotation = uprightRotationX({
      x: measured.size.x,
      y: measured.size.y,
      z: measured.size.z,
    });
    if (rotation !== 0) {
      mesh.rotation.x = rotation;
    }
  }

  /**
   * The pawn-origin marker (F3+B).
   *
   * A bright cube at the **feet**, not at the pawn origin. `MovementPawn` centres its
   * collider on the origin, so the origin itself sits half a body above the ground — a
   * marker there answers "where is the origin" but not "where does this character actually
   * stand", and the second question is the one a collider wireframe raises. The marker is
   * therefore offset down by the collider half-height, which puts it on the floor where the
   * feet are.
   *
   * `MeshBasicMaterial` with `depthTest` off so it stays visible through the terrain; a
   * shaded cube half-buried in a block would be useless.
   */
  private addRootMarker(): void {
    const marker = ENGINE.MeshNode.create({
      name: 'RootMarker',
      geometry: new THREE.BoxGeometry(
        LOOMKEEPER_ROOT_MARKER_SIZE,
        LOOMKEEPER_ROOT_MARKER_SIZE,
        LOOMKEEPER_ROOT_MARKER_SIZE,
      ),
      material: new THREE.MeshBasicMaterial({
        color: 0xff00ff,
        depthTest: false,
        transparent: true,
        opacity: 0.85,
      }),
      position: new THREE.Vector3(0, -LOOMKEEPER_COLLIDER_HALF.y, 0),
      physicsOptions: { enabled: false },
      castShadow: false,
    });
    marker.renderOrder = 999;
    marker.visible = false;
    this.add(marker);
    this.rootMarker = marker;
  }

  /** Shows or hides the pawn-origin marker. Driven by F3+B. */
  public setRootMarkerVisible(visible: boolean): void {
    if (this.rootMarker) {
      this.rootMarker.visible = visible;
    }
  }
}
