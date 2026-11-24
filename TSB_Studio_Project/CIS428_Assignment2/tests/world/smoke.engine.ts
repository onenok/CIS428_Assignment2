/**
 * Smoke tests: prove the engine and its WASM dependencies load under Node.
 *
 * These run first because every other engine-layer test depends on them. If the
 * engine cannot be imported in Node, layer 2 is not viable and the failure must
 * be visible rather than surfacing as a confusing downstream error.
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { createPhysicsEngine } from './engineInternals.js';

describe('smoke: engine import', () => {
  it('imports @gnsx/genesys.js without a DOM', async () => {
    const ENGINE = await import('@gnsx/genesys.js');
    assertTrue(Object.keys(ENGINE).length > 0, 'engine module should export symbols');
  });

  it('exposes the core classes used by the game', async () => {
    const ENGINE = await import('@gnsx/genesys.js');
    assertEqual(typeof ENGINE.World, 'function', 'World should be a class');
    assertEqual(typeof ENGINE.SceneNode, 'function', 'SceneNode should be a class');
    assertEqual(typeof ENGINE.GameMode, 'function', 'GameMode should be a class');
      assertEqual(typeof ENGINE.MathHelpers, 'function', 'MathHelpers should be exported');
  });

  it('reports isNode() as true', async () => {
    const ENGINE = await import('@gnsx/genesys.js');
    assertEqual(ENGINE.isNode(), true, 'engine should detect the Node runtime');
  });
}, 'engine');

describe('smoke: rapier wasm', () => {
  it('creates a physics engine backed by rapier', async () => {
    const ENGINE = await import('@gnsx/genesys.js');
    const THREE = await import('three');

    const physics = await createPhysicsEngine({
      gravity: new THREE.Vector3(0, -9.81, 0),
      engine: ENGINE.PhysicsEngine.Rapier,
    });

    assertTrue(physics != null, 'createPhysicsEngine should return an engine');
    assertTrue(typeof physics!.raycast === 'function', 'engine should support raycasts');
    physics!.destroy();
  });

  it('steps a physics engine without throwing', async () => {
    const ENGINE = await import('@gnsx/genesys.js');
    const THREE = await import('three');

    const physics = await createPhysicsEngine({
      gravity: new THREE.Vector3(0, -9.81, 0),
      engine: ENGINE.PhysicsEngine.Rapier,
    });
    assertTrue(physics != null, 'createPhysicsEngine should return an engine');

    physics!.tick(1 / 60);
    physics!.tick(1 / 60);
    physics!.destroy();
  });
}, 'engine');