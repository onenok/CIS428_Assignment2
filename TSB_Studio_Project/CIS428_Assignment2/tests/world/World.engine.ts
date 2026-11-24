/**
 * Layer 2 — headless World.
 *
 * Proves the engine can be driven from Node without a renderer or DOM. Every
 * other engine-layer test builds on this, so a failure here means layer 2 is
 * not viable and the cause must be obvious.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { addAndBeginPlay, advanceTicks, createHeadlessWorld } from './headlessWorld.js';

describe('headless World: construction', () => {
  it('constructs without a renderer or DOM', async () => {
    const handle = await createHeadlessWorld();
    try {
      assertTrue(handle.world instanceof ENGINE.World, 'world should be a World instance');
    } finally {
      handle.dispose();
    }
  });

  it('provides a UI manager even without a container', async () => {
    const handle = await createHeadlessWorld();
    try {
      assertTrue(handle.world.uiManager != null, 'uiManager should exist in headless mode');
    } finally {
      handle.dispose();
    }
  });

  it('only contains the built-in particle manager at startup', async () => {
    const handle = await createHeadlessWorld();
    try {
      const names = handle.world.getRootNodes().map((node) => node.constructor.name);
      assertEqual(names.length, 1, `expected exactly one built-in root node, got ${names.join(', ')}`);
      assertEqual(names[0], 'GlobalParticleManager');
    } finally {
      handle.dispose();
    }
  });
});

describe('headless World: node lifecycle', () => {
  it('adds a node to the root', async () => {
    const handle = await createHeadlessWorld();
    try {
      const before = handle.world.getRootNodes().length;
      const node = ENGINE.SceneNode.create({ name: 'TestNode' });
      handle.world.add(node);

      assertEqual(handle.world.getRootNodes().length, before + 1);
      assertEqual(node.name, 'TestNode');
    } finally {
      handle.dispose();
    }
  });

  it('finds a node by name', async () => {
    const handle = await createHeadlessWorld();
    try {
      const node = ENGINE.SceneNode.create({ name: 'FindMe' });
      handle.world.add(node);

      const found = handle.world.getNodeByName('FindMe');
      assertTrue(found === node, 'getNodeByName should return the same instance');
    } finally {
      handle.dispose();
    }
  });

  it('ticks registered nodes', async () => {
    const handle = await createHeadlessWorld();
    try {
      let ticks = 0;
      const node = ENGINE.SceneNode.create({ name: 'TickCounter' });
      node.tickPrePhysics = () => {
        ticks++;
      };
      addAndBeginPlay(handle.world, node);

      advanceTicks(handle.world, 0.1);
      assertTrue(ticks > 0, `expected the node to tick, got ${ticks}`);
    } finally {
      handle.dispose();
    }
  });

  it('honours setTickInterval throttling', async () => {
    const handle = await createHeadlessWorld();
    try {
      let ticks = 0;
      const node = ENGINE.SceneNode.create({ name: 'Throttled' });
      node.setTickInterval(0.05);
      node.tickPrePhysics = () => {
        ticks++;
      };
      addAndBeginPlay(handle.world, node);

      // 0.5 s at 1/60 s per step = 30 frames; a 50 ms interval allows ~10 ticks.
      advanceTicks(handle.world, 0.5);
      assertTrue(ticks >= 8 && ticks <= 12, `expected ~10 throttled ticks, got ${ticks}`);
    } finally {
      handle.dispose();
    }
  });
});

describe('headless World: physics', () => {
  it('creates a usable physics engine', async () => {
    const handle = await createHeadlessWorld();
    try {
      assertTrue(handle.physics != null, 'physics engine should be created');
      assertTrue(typeof handle.physics.raycast === 'function', 'physics engine should support raycasts');
    } finally {
      handle.dispose();
    }
  });

  it('raycasts against a static box', async () => {
    const handle = await createHeadlessWorld();
    try {
      const box = ENGINE.MeshNode.create({ name: 'Floor' });
      box.position.set(0, 0, 0);
      handle.world.add(box);

      // Give the physics engine a frame to register the collider.
      advanceTicks(handle.world, 0.1);

      const hits = handle.physics.raycastAll({
        origin: new THREE.Vector3(0, 5, 0),
        direction: new THREE.Vector3(0, -1, 0),
        maxDistance: 20,
      });

      assertTrue(Array.isArray(hits), 'raycastAll should return an array');
    } finally {
      handle.dispose();
    }
  });
});
