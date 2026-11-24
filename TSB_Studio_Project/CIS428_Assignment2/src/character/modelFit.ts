/**
 * Turns a loaded model's bounding box into the scale and offset that place it correctly.
 *
 * Extracted from the two pawns because getting this wrong is silent: a model that is
 * half size or half a body underground throws no error and logs nothing, and the only
 * symptom is a screenshot that looks slightly off. As a pure function it can be tested
 * against the numbers the real assets actually produce.
 *
 * The numbers come from parsing each `.glb` with the project's own `GLTFLoader` and
 * measuring `new THREE.Box3().setFromObject(scene)`:
 *
 *   steve-minecraft.glb, after `Circle_0` is removed
 *     min (-2.003, 0.002, -1.009)  max (2.003, 8.009, 1.009)   height 8.007
 *   Loomkeeper.glb, no display geometry
 *     min (-32.100, 1.717, -8.100) max (32.100, 131.764, 8.100) height 130.047
 *
 * Note how far the second one's minimum sits above zero: the export's origin is nowhere
 * near its feet, so a model that is only scaled and never offset floats.
 */

import * as THREE from 'three';

/** Result of fitting a model to a target height and an anchor. */
export interface ModelFit {
  /** Uniform scale factor to apply to the model. */
  readonly scale: number;
  /** Offset to add to the model's local `y` so its lowest point sits on the anchor. */
  readonly offsetY: number;
}

/** A measured bounding box, in the model's own units. */
export interface ModelBounds {
  readonly minY: number;
  readonly height: number;
}

/**
 * Bounding box of `object` measured in its **parent's** space, not world space.
 *
 * `Box3.setFromObject()` answers in world coordinates, and using that number as if it
 * were local is a trap that costs exactly the pawn's world height: with a pawn at
 * y = 12 the "local" minimum came back as 12.0 instead of 0.002, so the fit computed a
 * 2.7 m offset and buried the character. Everything downstream of this uses local
 * values, so the conversion happens here, once.
 *
 * `updateWorldMatrix(true, true)` is required first: the parent chain may still hold the
 * transform from before the pawn was positioned.
 */
export function measureLocalBounds(object: THREE.Object3D): (ModelBounds & { size: THREE.Vector3 }) | null {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    return null;
  }

  const parent = object.parent;
  if (parent) {
    box.applyMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert());
  }

  return {
    minY: box.min.y,
    height: box.max.y - box.min.y,
    size: box.getSize(new THREE.Vector3()),
  };
}

/**
 * Fits `bounds` to `targetHeight`, with the model's lowest point landing on `anchorY`.
 *
 * `anchorY` is expressed in the parent's local space: it is the height of the surface
 * the character should stand on, relative to the node the model is parented to. For the
 * player that is `0`, because the player pawn's origin is its feet. For the Loomkeeper
 * it is `-NPC_HEIGHT / 2`, because that pawn's origin is the centre of its collider.
 *
 * Returns `null` for a degenerate box rather than producing `Infinity`, which is how a
 * failed load used to turn into an invisible model with no explanation.
 */
export function fitModel(bounds: ModelBounds, targetHeight: number, anchorY: number): ModelFit | null {
  if (!Number.isFinite(bounds.height) || bounds.height <= 0) {
    return null;
  }
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    return null;
  }
  if (!Number.isFinite(bounds.minY) || !Number.isFinite(anchorY)) {
    return null;
  }

  const scale = targetHeight / bounds.height;
  return { scale, offsetY: anchorY - bounds.minY * scale };
}

/**
 * True when the model came out the wrong size.
 *
 * Used to fail loudly instead of silently: a model whose height is off by more than a
 * few percent means the measurement included something it should not have — a display
 * disc, a stray node, a second character — and the result is a character nobody will
 * notice is wrong until they stand next to a block.
 */
export function isImplausibleFit(actualHeight: number, targetHeight: number, tolerance = 0.05): boolean {
  if (!Number.isFinite(actualHeight) || actualHeight <= 0) {
    return true;
  }
  return Math.abs(actualHeight - targetHeight) > targetHeight * tolerance;
}

/** Extents of a model along each axis, in whatever units it was authored in. */
export interface ModelSpans {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Skinned bounds measured in the model's parent space.
 *
 * `SkinnedMesh.computeBoundingBox()` is the one API that accounts for the pose: it walks the
 * vertices through `applyBoneTransform`, unlike `Box3.setFromObject` which reads the
 * bind-pose geometry. Everything else we tried was blind to this — the geometry box said
 * "feet at 0" and the bones said "lowest bone at 1.0" while the rendered soles sat a metre
 * above the floor.
 *
 * Returns `null` when the model has no skinned mesh, so a static mesh keeps using the plain
 * bounding box.
 */
export function skinnedBoundsInParent(
  model: THREE.Object3D,
): (ModelBounds & { size: THREE.Vector3 }) | null {
  model.updateWorldMatrix(true, true);
  const parentInverse = model.parent
    ? new THREE.Matrix4().copy(model.parent.matrixWorld).invert()
    : new THREE.Matrix4();

  const union = new THREE.Box3();
  let found = false;

  model.traverse((object) => {
    const skinned = object as THREE.SkinnedMesh;
    if (!(skinned as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh || !skinned.geometry) {
      return;
    }
    // Without a skeleton there is no pose to apply; the bind-pose box is already right.
    if (!skinned.skeleton || !skinned.skeleton.boneMatrices) {
      return;
    }
    skinned.computeBoundingBox();
    const local = skinned.boundingBox;
    if (!local) {
      return;
    }
    found = true;
    const toParent = new THREE.Matrix4().multiplyMatrices(parentInverse, skinned.matrixWorld);
    union.union(local.clone().applyMatrix4(toParent));
  });

  if (!found || union.isEmpty()) {
    return null;
  }
  return {
    minY: union.min.y,
    height: union.max.y - union.min.y,
    size: union.getSize(new THREE.Vector3()),
  };
}

/**
 * Lowest bone position, measured in the model's parent space.
 *
 * This is the only reliable ground reference for a **skinned** model. `Box3.setFromObject`
 * describes the bind-pose geometry and ignores what the bones actually do, so a model can
 * measure "feet at 0" while rendering a whole body-height above the floor — which is how
 * the player came out standing on top of its own collider.
 *
 * Scale it into the same space as the caller's offsets by measuring after the scale is
 * applied; the bone positions follow the node's transform.
 *
 * Returns `null` for a model with no bones (a static mesh), so callers fall back to the
 * bounding box.
 */
export function lowestBoneYInParent(model: THREE.Object3D): number | null {
  const bones: THREE.Object3D[] = [];
  model.traverse((object) => {
    if ((object as THREE.Bone).isBone) {
      bones.push(object);
    }
  });
  if (bones.length === 0) {
    return null;
  }

  model.updateWorldMatrix(true, true);
  const parent = model.parent;
  const inverse = parent ? new THREE.Matrix4().copy(parent.matrixWorld).invert() : null;

  let lowest = Number.POSITIVE_INFINITY;
  for (const bone of bones) {
    const position = bone.getWorldPosition(new THREE.Vector3());
    if (inverse) {
      position.applyMatrix4(inverse);
    }
    lowest = Math.min(lowest, position.y);
  }

  return Number.isFinite(lowest) ? lowest : null;
}

/**
 * Correction applied to the player model, in radians about X.
 *
 * The Steve glb is authored Z-up. Its scene graph is:
 *
 *   Sketchfab_model        matrix = R_x(−90°)   (+Z ↦ +Y, +Y ↦ −Z)
 *   └ root
 *     └ GLTF_SceneRootNode matrix = R_x(+90°)   (+Y ↦ +Z, +Z ↦ −Y)
 *
 * Those two cancel, so the file reads upright in three.js — the mesh's own `POSITION`
 * bounds are even Y-tall, 8.007. The engine's loader drops the outer `Sketchfab_model`
 * wrapper, which leaves only the +90° and tips the character over.
 *
 * +90° cancels the leftover +90° and restores +Y up; −90° also cancels it but leaves the
 * character standing on its head, which is how the first attempt came out. The sign is the
 * one thing here that had to be checked on screen rather than derived, because deriving it
 * needs to know which of the two wrappers survives and in which order they compose.
 *
 * A constant rather than a measurement, because measuring does not work: a `SkinnedMesh`'s
 * `Box3` comes from the bind-pose geometry and ignores the pose the bones produce, and the
 * bones carry their own cancelling ±90° pair, so both report "upright" while the mesh draws
 * lying down.
 */
export const PLAYER_MODEL_UPRIGHT_ROTATION = Math.PI / 2;

/**
 * Yaw applied to the player model after the upright correction, in radians.
 *
 * The model faces the opposite way to the pawn's forward once it is standing, so it needs
 * a half turn. Applied with {@link PLAYER_MODEL_ROTATION_ORDER} = `YXZ`, which composes as
 * `Ry · Rx`: the upright fix happens in the model's own frame first, then the whole standing
 * character turns about world Y. The default `XYZ` order would instead tip the model over
 * again, because it applies X after Y.
 */
export const PLAYER_MODEL_UPRIGHT_YAW = Math.PI;

/** Euler order that makes the yaw happen outside the upright correction. */
export const PLAYER_MODEL_ROTATION_ORDER = 'YXZ';

/**
 * Direction from a model's origin to its head, in the model's parent space.
 *
 * Kept as a diagnostic aid: it is what told us that neither the bounding box nor the bones
 * could answer the up-axis question, which is why the player uses a constant correction.
 *
 * The head is found by name: `Cabeca` is the Portuguese bone name the Steve asset's rigger
 * used (`Cabeca_6`), and `HeadCore` is what the Loomkeeper's rig calls its head.
 */
export function headOffsetInParent(mesh: THREE.Object3D): { x: number; y: number; z: number } | null {
  let head: THREE.Object3D | null = null;
  mesh.traverse((object) => {
    if (head === null && /cabeca|head/i.test(object.name)) {
      head = object;
    }
  });
  if (head === null) {
    return null;
  }

  mesh.updateWorldMatrix(true, true);
  const origin = mesh.getWorldPosition(new THREE.Vector3());
  const headWorld = (head as THREE.Object3D).getWorldPosition(new THREE.Vector3());

  const parent = mesh.parent;
  if (parent) {
    const inverse = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    origin.applyMatrix4(inverse);
    headWorld.applyMatrix4(inverse);
  }

  const delta = headWorld.sub(origin);
  if (!Number.isFinite(delta.y) || !Number.isFinite(delta.z)) {
    return null;
  }
  return { x: delta.x, y: delta.y, z: delta.z };
}

/**
 * Rotation about X that stands a lying-down model back up, in radians.
 *
 * A humanoid is always tallest along +Y, so a model whose Z extent exceeds its Y extent
 * has fallen over. There is a concrete case behind this rule: the Sketchfab Steve export
 * wraps the character in a `Sketchfab_model` node carrying a −90° X matrix (Z-up to
 * Y-up), with `GLTF_SceneRootNode` below it carrying the +90° that cancels it. Reading
 * the file with three.js directly gives an upright character; the engine's loader drops
 * the outer wrapper, which leaves only the +90° and lays the character flat on its back.
 *
 * Only a fallback: a skinned mesh's `Box3` comes from its bind-pose geometry and ignores
 * the pose the bones actually produce, so geometry alone can report "upright" while the
 * character renders flat. {@link uprightRotationFromUp} is the authority; this is what
 * non-skinned models fall back to.
 */
export function uprightRotationX(spans: ModelSpans): number {
  if (!Number.isFinite(spans.y) || !Number.isFinite(spans.z)) {
    return 0;
  }
  return spans.z > spans.y ? -Math.PI / 2 : 0;
}

/**
 * Rotation about X that brings the model's own "up" direction onto +Y.
 *
 * `up` is the direction from the model's origin to a known top-of-body landmark — the
 * head bone — expressed in the parent's space. Using the *posed skeleton* instead of the
 * geometry bounds is what makes this work on skinned meshes: the bind pose can say
 * "upright" while the bones draw the character lying down, which is exactly how the
 * Steve asset behaves here.
 *
 * Returns the smallest rotation of the two that align the dominant axis, so an already
 * upright model gets 0 rather than a full turn.
 */
export function uprightRotationFromUp(up: { x: number; y: number; z: number }): number {
  if (!Number.isFinite(up.y) || !Number.isFinite(up.z)) {
    return 0;
  }

  // Horizontal is "more sideways than tall": then the model is lying, and the sign of
  // the offset says whether its head points along +Z or −Z.
  if (Math.abs(up.z) > Math.abs(up.y)) {
    return up.z > 0 ? -Math.PI / 2 : Math.PI / 2;
  }

  // Otherwise it is already vertical; only an upside-down model needs turning.
  return up.y < 0 ? Math.PI : 0;
}
