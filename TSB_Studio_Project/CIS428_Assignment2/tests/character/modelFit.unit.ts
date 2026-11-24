import { describe, it } from '../../scripts/verify/harness.js';
import { assertClose, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import * as THREE from 'three';
import { NPC_HEIGHT } from '../../src/character/npcSpawn.js';
import {
  PLAYER_MODEL_ROTATION_ORDER,
  PLAYER_MODEL_UPRIGHT_ROTATION,
  PLAYER_MODEL_UPRIGHT_YAW,
  fitModel,
  isImplausibleFit,
  lowestBoneYInParent,
  skinnedBoundsInParent,
  measureLocalBounds,
  uprightRotationFromUp,
  uprightRotationX,
} from '../../src/character/modelFit.js';
import { LOOMKEEPER_MODEL_HEIGHT } from '../../src/character/LoomkeeperModel.js';
import { PLAYER_MODEL_HEIGHT } from '../../src/character/PlayerModel.js';

/**
 * Bounds measured by parsing each `.glb` with the project's own `GLTFLoader` and taking
 * `new THREE.Box3().setFromObject(scene)`. Hard-coding them means a change to an asset
 * shows up here as a failing expectation instead of as a character that is quietly the
 * wrong size.
 */
const STEVE_BOUNDS = { minY: 0.002, height: 8.007 };
const LOOMKEEPER_BOUNDS = { minY: 1.717, height: 130.047 };

describe('modelFit / player', () => {
  it('scales the player body to the collider height', () => {
    const fit = fitModel(STEVE_BOUNDS, PLAYER_MODEL_HEIGHT, 0)!;
    assertTrue(fit !== null);
    assertClose(fit.scale, PLAYER_MODEL_HEIGHT / 8.007, 1e-9);
  });

  it('leaves the player standing on the origin', () => {
    // The player pawn's origin *is* its feet, so the model's lowest point has to land
    // at local 0. Steve's minimum sits at 0.002 units, which scales to almost nothing —
    // but `Loomkeeper`'s does not, which is why this is worth asserting per model.
    const fit = fitModel(STEVE_BOUNDS, PLAYER_MODEL_HEIGHT, 0)!;
    assertClose(fit.offsetY, -0.002 * fit.scale, 1e-9);
    assertTrue(Math.abs(fit.offsetY) < 0.001);
  });

  it('would have floated the body without the Sketchfab disc being removed', () => {
    // With `Circle_0` still in the scene the measured box is 0..8.009 and the width is
    // dominated by the disc, so the body's own feet end up 0.49 m above the ground and
    // the character comes out about two thirds of its intended height. This is the
    // regression that made the model look wrong without logging anything.
    const withDisc = { minY: 0, height: 8.009 };
    const fit = fitModel(withDisc, PLAYER_MODEL_HEIGHT, 0)!;
    const bodyMinInWorld = 2.998 * fit.scale + fit.offsetY;
    assertTrue(bodyMinInWorld > 0.4, 'the body floats once the disc is measured in');
  });
});

describe('modelFit / Loomkeeper', () => {
  it('anchors the model half a body below the pawn origin', () => {
    // That pawn's origin is the centre of its collider, not its feet, so the anchor is
    // -NPC_HEIGHT / 2. Getting this wrong is a full body-height of error.
    const fit = fitModel(LOOMKEEPER_BOUNDS, LOOMKEEPER_MODEL_HEIGHT, -NPC_HEIGHT / 2)!;
    assertClose(fit.offsetY, -NPC_HEIGHT / 2 - 1.717 * fit.scale, 1e-9);
  });

  it('ends up spanning exactly the collider, -half to +half', () => {
    // The box collider is centred on the origin with a half-height of NPC_HEIGHT / 2,
    // so the visual has to match that span or the wireframe and the model separate.
    const fit = fitModel(LOOMKEEPER_BOUNDS, LOOMKEEPER_MODEL_HEIGHT, -NPC_HEIGHT / 2)!;
    const min = LOOMKEEPER_BOUNDS.minY * fit.scale + fit.offsetY;
    const max = (LOOMKEEPER_BOUNDS.minY + LOOMKEEPER_BOUNDS.height) * fit.scale + fit.offsetY;

    assertClose(min, -NPC_HEIGHT / 2, 1e-9);
    assertClose(max, NPC_HEIGHT / 2, 1e-9);
  });

  it('scales the assembled export, not its mesh-local bounds', () => {
    // Mesh-local reads 23 x 37 x 16; the assembled node tree is 64.2 x 130.047 x 16.2.
    // Using the local numbers would make the character more than three times too wide.
    const local = { minY: 0, height: 37 };
    const assembled = fitModel(LOOMKEEPER_BOUNDS, LOOMKEEPER_MODEL_HEIGHT, 0)!;
    const wrong = fitModel(local, LOOMKEEPER_MODEL_HEIGHT, 0)!;
    assertTrue(wrong.scale > assembled.scale * 3);
  });
});

describe('modelFit / up-axis correction', () => {
  it('tips the player model back up by +90°', () => {
    // The Steve glb's own wrapper chain cancels out and the loader drops the outer half,
    // leaving the character on its back. +90° restores +Y up; −90° cancels the matrix too
    // but stands the character on its head, which the first attempt did.
    assertClose(PLAYER_MODEL_UPRIGHT_ROTATION, Math.PI / 2, 1e-9);
  });

  it('is the rotation that undoes the surviving +90°', () => {
    // Whatever the asset does, the correction and the leftover matrix must compose to
    // identity — that is the whole point of the constant.
    const surviving = -Math.PI / 2;
    assertClose(PLAYER_MODEL_UPRIGHT_ROTATION + surviving, 0, 1e-9);
  });

  it('turns the standing model to face the pawn forward', () => {
    assertClose(PLAYER_MODEL_UPRIGHT_YAW, Math.PI, 1e-9);
  });

  it('applies the yaw outside the upright fix, or the model tips over again', () => {
    // `YXZ` composes as Ry · Rx: stand the model up in its own frame, then turn the whole
    // standing body. With a different order the X would land last and lay it back down.
    assertEqual(PLAYER_MODEL_ROTATION_ORDER, 'YXZ');

    // The asset's local up is −Z — that is what the +90° about X sends to +Y.
    const euler = new THREE.Euler(PLAYER_MODEL_UPRIGHT_ROTATION, PLAYER_MODEL_UPRIGHT_YAW, 0, 'YXZ');
    const matrix = new THREE.Matrix4().makeRotationFromEuler(euler);
    const up = new THREE.Vector3(0, 0, -1).applyMatrix4(matrix);

    assertClose(up.y, 1, 1e-6);
    assertClose(up.x, 0, 1e-6);
    assertClose(up.z, 0, 1e-6);
  });

  it('would leave the model upside down with the default Euler order', () => {
    // Guards the reason PLAYER_MODEL_ROTATION_ORDER exists: the same angles with the yaw
    // applied *inside* the X correction stand the character on its head instead.
    const euler = new THREE.Euler(PLAYER_MODEL_UPRIGHT_ROTATION, PLAYER_MODEL_UPRIGHT_YAW, 0, 'XYZ');
    const matrix = new THREE.Matrix4().makeRotationFromEuler(euler);
    const up = new THREE.Vector3(0, 0, -1).applyMatrix4(matrix);

    assertClose(up.y, -1, 1e-6);
  });

  it('stands a model up when its head points along +Z', () => {
    assertClose(uprightRotationFromUp({ x: 0, y: 0.1, z: 1 }), -Math.PI / 2, 1e-9);
  });

  it('stands a model up when its head points along −Z', () => {
    assertClose(uprightRotationFromUp({ x: 0, y: 0.1, z: -1 }), Math.PI / 2, 1e-9);
  });

  it('leaves an upright model alone', () => {
    assertEqual(uprightRotationFromUp({ x: 0, y: 1, z: 0.1 }), 0);
  });

  it('turns an upside-down model the rest of the way', () => {
    assertEqual(uprightRotationFromUp({ x: 0, y: -1, z: 0 }), Math.PI);
  });

  it('leaves a model alone when the spans are unusable', () => {
    // Better to draw it wrong than to rotate on a NaN and make it vanish.
    assertEqual(uprightRotationFromUp({ x: 0, y: Number.NaN, z: 1 }), 0);
  });

  it('falls back to the bounding box for a non-skinned model', () => {
    // No head bone means no posed direction to trust, so the box decides.
    const lying = { x: 4.006, y: 2.018, z: 8.007 };
    assertClose(uprightRotationX(lying), -Math.PI / 2, 1e-9);
    assertEqual(uprightRotationX({ x: 4.006, y: 8.007, z: 2.018 }), 0);
  });
});

describe('modelFit / local vs world bounds', () => {
  it('measures in the parent space, not world space', () => {
    // The bug this locks: `Box3.setFromObject()` answers in world coordinates, and
    // using that as if it were local subtracted the pawn's own height from the model.
    // With the pawn at y = 12 the measured "local" minimum came back as 12.0 instead of
    // 0, so the fit produced a −2.7 m offset and buried the character.
    const parent = new THREE.Group();
    parent.position.set(0, 12, 0);

    const model = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshBasicMaterial(),
    );
    model.position.set(0, 1, 0);
    parent.add(model);
    parent.updateMatrixWorld(true);

    const bounds = measureLocalBounds(model)!;
    assertClose(bounds.minY, 0, 1e-6);
    assertClose(bounds.height, 2, 1e-6);
  });

  it('returns null for an object with no geometry', () => {
    const empty = new THREE.Group();
    assertEqual(measureLocalBounds(empty), null);
  });

  it('measures the same box before and after a fit, so the anchor is checkable', () => {
    // The post-fit measurement is what the sanity check reads; it has to be in the same
    // space as the pre-fit one or the comparison is meaningless.
    const parent = new THREE.Group();
    parent.position.set(3, 11, -4);

    const model = new THREE.Mesh(
      new THREE.BoxGeometry(2, 4, 2),
      new THREE.MeshBasicMaterial(),
    );
    parent.add(model);
    parent.updateMatrixWorld(true);

    const before = measureLocalBounds(model)!;
    const fit = fitModel(before, 1.8, 0)!;
    model.scale.setScalar(fit.scale);
    model.position.y = fit.offsetY;

    const after = measureLocalBounds(model)!;
    assertClose(after.minY, 0, 1e-6);
    assertClose(after.height, 1.8, 1e-6);
  });
});

describe('modelFit / bone grounding', () => {
  it('finds the lowest bone, not the lowest geometry vertex', () => {
    // This is the difference that put the player a body-height above its collider: the
    // geometry box said "feet at 0" while the posed bones sat elsewhere.
    const parent = new THREE.Group();
    const model = new THREE.Group();
    parent.add(model);

    const high = new THREE.Bone();
    high.name = 'Head';
    high.position.set(0, 1.6, 0);
    const low = new THREE.Bone();
    low.name = 'Foot';
    low.position.set(0, 0.1, 0);
    model.add(high, low);

    parent.updateMatrixWorld(true);
    assertClose(lowestBoneYInParent(model)!, 0.1, 1e-6);
  });

  it('measures in the parent space so the offset applies to the model node', () => {
    const parent = new THREE.Group();
    parent.position.set(0, 12, 0);
    const model = new THREE.Group();
    parent.add(model);

    const foot = new THREE.Bone();
    foot.position.set(0, 0, 0);
    model.add(foot);

    parent.updateMatrixWorld(true);
    // Zero, not twelve: a world-space reading would put the model 12 m underground.
    assertClose(lowestBoneYInParent(model)!, 0, 1e-6);
  });

  it('returns null for a static model with no bones', () => {
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    assertEqual(lowestBoneYInParent(model), null);
  });
});

describe('modelFit / skinned bounds', () => {
  it('ignores a skinned mesh that has no skeleton', () => {
    // Hand-built skinned meshes (tests, tooling) have no bind matrices, so there is no pose
    // to apply and the callers fall back to the plain bounding box instead of throwing.
    const parent = new THREE.Group();
    const mesh = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshBasicMaterial(),
    );
    parent.add(mesh);
    parent.updateMatrixWorld(true);

    assertEqual(skinnedBoundsInParent(mesh), null);
  });

  it('returns null for a static model so the plain box stays in charge', () => {
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    assertEqual(skinnedBoundsInParent(model), null);
  });
});

describe('modelFit / degenerate input', () => {
  it('refuses a zero-height box instead of returning Infinity', () => {
    assertEqual(fitModel({ minY: 0, height: 0 }, 1.8, 0), null);
    assertEqual(fitModel({ minY: 0, height: -1 }, 1.8, 0), null);
  });

  it('refuses non-finite input', () => {
    assertEqual(fitModel({ minY: Number.NaN, height: 1 }, 1.8, 0), null);
    assertEqual(fitModel({ minY: 0, height: Number.POSITIVE_INFINITY }, 1.8, 0), null);
    assertEqual(fitModel({ minY: 0, height: 1 }, 0, 0), null);
  });

  it('flags a fitted height that is off by more than tolerance', () => {
    assertEqual(isImplausibleFit(1.8, 1.8), false);
    assertEqual(isImplausibleFit(1.85, 1.8), false);
    assertEqual(isImplausibleFit(1.31, 1.8), true, 'the disc-left-in height must be flagged');
    assertEqual(isImplausibleFit(0, 1.8), true);
    assertEqual(isImplausibleFit(Number.NaN, 1.8), true);
  });
});
