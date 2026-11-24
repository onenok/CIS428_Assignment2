/**
 * Shared helpers for layer-2 (engine) tests.
 *
 * Layer-2 tests run the real engine under Node. The engine supports this via its
 * `headless` mode, which skips the renderer, audio listener and DOM listeners.
 * These helpers keep the boilerplate in one place.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { createPhysicsEngine } from './engineInternals.js';

export interface HeadlessWorldHandle {
  world: ENGINE.World;
  physics: ENGINE.IPhysicsEngine;
  dispose: () => void;
}

/**
 * Creates a headless `World` with a real Rapier physics engine.
 *
 * The navigation server is intentionally omitted: navmesh generation needs a
 * worker and is irrelevant to the systems under test.
 *
 * Note: `World` always adds a `GlobalParticleManager` root node during
 * construction, so `getRootNodes()` is never empty.
 *
 * Physics registration goes through `SceneNode.getPhysicsEngine()`, which reads
 * `world.gameLoop.physicsEngine`. A real `BaseGameLoop` requires an
 * `HTMLElement`, so a minimal stand-in is injected instead.
 */
export async function createHeadlessWorld(options: { gravityY?: number } = {}): Promise<HeadlessWorldHandle> {
  const gravity = new THREE.Vector3(0, options.gravityY ?? -9.81, 0);

  const physics = await createPhysicsEngine({
    gravity,
    engine: ENGINE.PhysicsEngine.Rapier,
  });

  if (!physics) {
    throw new Error('createHeadlessWorld: failed to create the Rapier physics engine');
  }

  let world: ENGINE.World;

    const gameLoopStub = {
      physicsEngine: physics,
      getWorld: () => world,
      postProcessManager: null,
    } as unknown as ENGINE.BaseGameLoop;

    world = new ENGINE.World({
    headless: true,
    backgroundColor: 0x000000,
    gameLoop: new WeakRef(gameLoopStub),
    physicsOptions: {
      gravity,
      engine: ENGINE.PhysicsEngine.Rapier,
    },
    navigationOptions: {
      engine: ENGINE.NavigationEngine.RecastNavigation,
    },
  });

  return {
    world,
    physics,
    dispose: () => {
      try {
        world.destroy();
      } catch {
        // A partially constructed world may throw during teardown; tests should
        // not fail because of cleanup.
      }
      try {
        physics.destroy();
      } catch {
        // Same rationale as above.
      }
    },
  };
}

/** Advances the world's tick manager by `seconds`, in fixed steps. */
export function advanceTicks(world: ENGINE.World, seconds: number, step = 1 / 60): void {
  const steps = Math.max(1, Math.round(seconds / step));
  for (let i = 0; i < steps; i++) {
    world.tickManager.tickPrePhysics(step);
    world.tickManager.tickPostPhysics(step);
  }
}

/**
 * Adds a node to the world and starts its play lifecycle.
 *
 * `World.add()` alone does not register the node with the tick manager; that
 * happens in `beginPlay()`, which the game loop normally calls.
 */
export function addAndBeginPlay(world: ENGINE.World, node: ENGINE.SceneNode): void {
  world.add(node);
  node.beginPlay();
}

/**
 * Steps the physics engine so newly added colliders enter the broad-phase.
 *
 * Rapier only indexes colliders during `step()`, so a raycast issued right after
 * adding a node returns nothing until at least one step has run.
 */
export function stepPhysics(physics: ENGINE.IPhysicsEngine, steps = 1): void {
  for (let i = 0; i < steps; i++) {
    physics.tick(1 / 60);
  }
}