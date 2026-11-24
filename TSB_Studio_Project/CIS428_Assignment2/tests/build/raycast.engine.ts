/**
 * Layer 2 — physics raycasting.
 *
 * The build system picks the target block by raycasting from the camera. These
 * tests pin the raycast contract: hit position, hit normal, and the ability to
 * ignore the player's own collider.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { assertClose, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { addAndBeginPlay, createHeadlessWorld, stepPhysics } from '../world/headlessWorld.js';

function makeBox(name: string, size: number, position: [number, number, number]): ENGINE.MeshNode {
  const node = ENGINE.MeshNode.create({
    name,
    geometry: new THREE.BoxGeometry(size, size, size),
    physicsOptions: {
      enabled: true,
      motionType: ENGINE.PhysicsMotionType.Static,
      collisionProfile: ENGINE.DefaultCollisionProfile.BlockAll,
          collisionMeshType: ENGINE.CollisionMeshType.BoundingBox,
        },
  });
  node.position.set(position[0], position[1], position[2]);
  return node;
}

describe('physics raycast: single block', () => {
  it('hits a block directly below the ray origin', async () => {
    const handle = await createHeadlessWorld();
    try {
      const block = makeBox('Block', 1, [0, 0, 0]);
      addAndBeginPlay(handle.world, block);
      stepPhysics(handle.physics);

      const hit = handle.physics.raycast({
        origin: new THREE.Vector3(0, 5, 0),
        direction: new THREE.Vector3(0, -1, 0),
        maxDistance: 20,
      });

      assertTrue(hit != null, 'ray should hit the block');
      assertClose(hit!.hitLocation.y, 0.5, 0.05, 'hit should land on the top face');
      assertClose(hit!.hitNormal.y, 1, 0.05, 'hit normal should point up');
      assertClose(hit!.distance, 4.5, 0.05, 'distance should be origin minus face');
    } finally {
      handle.dispose();
    }
  });

  it('reports the hit node', async () => {
    const handle = await createHeadlessWorld();
    try {
      const block = makeBox('Target', 1, [0, 0, 0]);
      addAndBeginPlay(handle.world, block);
      stepPhysics(handle.physics);

      const hit = handle.physics.raycast({
        origin: new THREE.Vector3(0, 5, 0),
        direction: new THREE.Vector3(0, -1, 0),
        maxDistance: 20,
      });

      assertTrue(hit != null, 'ray should hit the block');
      assertTrue(hit!.hitNode === block, 'hitNode should be the block that was hit');
    } finally {
      handle.dispose();
    }
  });

  it('returns null when nothing is in range', async () => {
    const handle = await createHeadlessWorld();
    try {
      const block = makeBox('Far', 1, [0, 0, 0]);
      addAndBeginPlay(handle.world, block);
      stepPhysics(handle.physics);

      const hit = handle.physics.raycast({
        origin: new THREE.Vector3(0, 100, 0),
        direction: new THREE.Vector3(0, -1, 0),
        maxDistance: 5,
      });

      assertTrue(hit == null, 'ray should miss when the block is out of range');
    } finally {
      handle.dispose();
    }
  });
});

describe('physics raycast: block selection', () => {
  it('returns the nearest block first', async () => {
    const handle = await createHeadlessWorld();
    try {
      const near = makeBox('Near', 1, [0, 0, 0]);
      const far = makeBox('Far', 1, [0, -5, 0]);
      addAndBeginPlay(handle.world, near);
      addAndBeginPlay(handle.world, far);
      stepPhysics(handle.physics);

      const hit = handle.physics.raycast({
        origin: new THREE.Vector3(0, 5, 0),
        direction: new THREE.Vector3(0, -1, 0),
        maxDistance: 20,
      });

      assertTrue(hit != null, 'ray should hit something');
      assertTrue(hit!.hitNode === near, 'the nearest block should win');
    } finally {
      handle.dispose();
    }
  });

  it('can ignore a specific node', async () => {
    const handle = await createHeadlessWorld();
    try {
      const ignored = makeBox('Ignored', 1, [0, 0, 0]);
      const target = makeBox('Target', 1, [0, -5, 0]);
      addAndBeginPlay(handle.world, ignored);
      addAndBeginPlay(handle.world, target);
      stepPhysics(handle.physics);

      const hit = handle.physics.raycast({
        origin: new THREE.Vector3(0, 5, 0),
        direction: new THREE.Vector3(0, -1, 0),
        maxDistance: 20,
        ignoredNodes: [ignored],
      });

      assertTrue(hit != null, 'ray should hit the remaining block');
      assertTrue(hit!.hitNode === target, 'the ignored block should be skipped');
    } finally {
      handle.dispose();
    }
  });

  it('collects every hit along the ray', async () => {
    const handle = await createHeadlessWorld();
    try {
      addAndBeginPlay(handle.world, makeBox('A', 1, [0, 0, 0]));
      addAndBeginPlay(handle.world, makeBox('B', 1, [0, -5, 0]));
      stepPhysics(handle.physics);

      const hits = handle.physics.raycastAll({
        origin: new THREE.Vector3(0, 5, 0),
        direction: new THREE.Vector3(0, -1, 0),
        maxDistance: 20,
      });

      assertEqual(hits.length, 2, 'both blocks should be reported');
      assertTrue(hits[0].distance <= hits[1].distance, 'hits should be sorted by distance');
    } finally {
      handle.dispose();
    }
  });
});

describe('physics raycast: placement maths', () => {
  it('derives the adjacent cell from the hit normal', async () => {
    const handle = await createHeadlessWorld();
    try {
      const block = makeBox('Block', 1, [0, 0, 0]);
      addAndBeginPlay(handle.world, block);
      stepPhysics(handle.physics);

      const hit = handle.physics.raycast({
        origin: new THREE.Vector3(0, 5, 0),
        direction: new THREE.Vector3(0, -1, 0),
        maxDistance: 20,
      });
      assertTrue(hit != null, 'ray should hit the block');

      // Placement target = hit point nudged along the normal, then floored.
      const target = {
        x: Math.floor(hit!.hitLocation.x + hit!.hitNormal.x * 0.5),
        y: Math.floor(hit!.hitLocation.y + hit!.hitNormal.y * 0.5),
        z: Math.floor(hit!.hitLocation.z + hit!.hitNormal.z * 0.5),
      };

      assertEqual(target.y, 1, 'placing on the top face targets the cell above');
      assertEqual(target.x, 0);
      assertEqual(target.z, 0);
    } finally {
      handle.dispose();
    }
  });

  it('derives the broken cell from the hit point', async () => {
    const handle = await createHeadlessWorld();
    try {
      const block = makeBox('Block', 1, [0, 0, 0]);
      addAndBeginPlay(handle.world, block);
      stepPhysics(handle.physics);

      const hit = handle.physics.raycast({
        origin: new THREE.Vector3(0, 5, 0),
        direction: new THREE.Vector3(0, -1, 0),
        maxDistance: 20,
      });
      assertTrue(hit != null, 'ray should hit the block');

      // Breaking targets the cell containing the hit point, pulled slightly
      // back along the normal so the boundary case resolves to the hit block.
      const target = {
        x: Math.floor(hit!.hitLocation.x - hit!.hitNormal.x * 0.5),
        y: Math.floor(hit!.hitLocation.y - hit!.hitNormal.y * 0.5),
        z: Math.floor(hit!.hitLocation.z - hit!.hitNormal.z * 0.5),
      };

      assertEqual(target.y, 0, 'breaking the top face targets the block itself');
    } finally {
      handle.dispose();
    }
  });
});