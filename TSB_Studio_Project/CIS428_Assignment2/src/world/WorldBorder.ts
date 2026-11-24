/**
 * World border.
 *
 * Four translucent walls around the outermost generated ring, from the bottom of
 * the world to the top of it. They are the only thing stopping the player from
 * walking off the edge of the ground into the void, so each wall is both a visual
 * and a collider.
 *
 * Why four boxes instead of a voxel column:
 *   - A wall is 80 x 256 metres. As voxels that is 20k cells per wall, and the
 *     collider would be rebuilt with every chunk. As a box it is twelve
 *     triangles and one box collider.
 *   - The look is a scrolling additive texture, which a voxel face cannot do.
 *
 * The texture stays white/grey and the blue comes from `material.color`, the same
 * way Minecraft tints one `forcefield.png` into the idle / expanding / shrinking
 * states. Baking the blue in would multiply blue by blue and come out dark.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import {
  BORDER_WALL_THICKNESS,
  borderAlphaForDistance,
  borderWallCenterY,
  borderWallHeight,
  borderWallSpecs,
  type BorderExtent,
  type BorderWallSpec,
} from './borderSpec.js';
import { makeBorderTexture } from './worldBorderTexture.js';

/**
 * Idle border colour, borrowed from Minecraft's stationary world border.
 *
 * The engine multiplies the white texture by this, so the result is a bright blue
 * glow rather than a flat blue fill.
 */
export const BORDER_TINT_IDLE = 0x20a0ff;

/** Metres covered by one tile of the stripe texture. */
export const BORDER_TILE_METRES = 4;

/**
 * How fast the stripes crawl upwards, in tiles per second.
 *
 * Slow enough to read as a field rather than as a scrolling background: at 4
 * metres per tile one tile passes a point every 3.4 seconds.
 */
export const BORDER_SCROLL_TILES_PER_SECOND = 0.3;

/** One built wall: its mesh, its own material, and how far away it is. */
interface BorderWall {
  readonly spec: BorderWallSpec;
  readonly node: ENGINE.MeshNode;
  readonly material: THREE.MeshBasicMaterial;
}

@ENGINE.GameClass()
export class WorldBorder extends ENGINE.SceneNode {
  /** Colour multiplied into the texture. */
  public tint: number = BORDER_TINT_IDLE;

  private walls: BorderWall[] = [];
  private texture: THREE.CanvasTexture | null = null;
  private geometries: THREE.BufferGeometry[] = [];
  private scroll = 0;

  /**
   * Builds the four walls around `extent`.
   *
   * `config.minY` / `config.maxY` decide the vertical span: the wall runs from the
   * world floor to one metre above the highest placeable layer, so it really is a
   * full-height barrier rather than a fence the player can fly over.
   */
  public build(
    extent: BorderExtent,
    config: { readonly minY: number; readonly maxY: number },
    thickness: number = BORDER_WALL_THICKNESS,
  ): void {
    this.clearWalls();

    const height = borderWallHeight(config);
    const centerY = borderWallCenterY(config);

        // Engine tests run headless with no canvas. Falling back to an untextured
        // material keeps the walls (and their colliders) buildable there, which is
        // what those tests assert; the texture only affects how they look.
        const texture = typeof document === 'undefined' ? null : makeBorderTexture();
        if (texture) {
          texture.repeat.set(
            Math.max(1, (extent.maxX + 1 - extent.minX) / BORDER_TILE_METRES),
            Math.max(1, height / BORDER_TILE_METRES),
          );
        }
    this.texture = texture;

    for (const spec of borderWallSpecs(extent, thickness)) {
      // Two shared geometries is enough: the east/west pair differ from the
      // north/south pair only by which axis carries the span.
      const geometry = new THREE.BoxGeometry(spec.sizeX, height, spec.sizeZ);
      this.geometries.push(geometry);

      const material = new THREE.MeshBasicMaterial({
        map: texture ?? undefined,
        color: this.tint,
        transparent: true,
        opacity: 1,
              // Normal alpha blending, not additive. Additive can only ever *brighten*
              // what is behind it, and this world's sky is nearly white, so an additive
              // wall clamps to white and disappears — measured on the first build: the
              // stripes were only visible where they crossed the darker grass. Alpha
              // blending puts the tint on screen regardless of what is behind it.
        depthWrite: false,
        side: THREE.FrontSide,
              // The engine's fog would mix the wall towards the fog colour over the
              // whole 80 metre world, dissolving the stripes into a flat haze. The
              // distance fade below does the same job with a controllable range.
        fog: false,
        toneMapped: false,
      });

      const node = ENGINE.MeshNode.create({
        name: `BorderWall_${spec.side}`,
        geometry,
        material,
      });
      node.position.set(spec.centerX, centerY, spec.centerZ);
      // A wall with no collider is decoration; the player would walk straight
      // through it and off the edge of the world.
      node.overridePhysicsOptions({
        enabled: true,
        motionType: ENGINE.PhysicsMotionType.Static,
        collisionMeshType: ENGINE.CollisionMeshType.BoundingBox,
      });

      this.add(node);
      this.walls.push({ spec, node, material });
    }

    this.applyView(0, 0);
  }

  /** True once {@link build} has run. */
  public get isBuilt(): boolean {
    return this.walls.length > 0;
  }

  /** The walls, for diagnostics. */
  public get wallCount(): number {
    return this.walls.length;
  }

  /** Current opacity of one wall, by side. `null` when that wall does not exist. */
  public alphaOf(side: string): number | null {
    const wall = this.walls.find(entry => entry.spec.side === side);
    return wall ? wall.material.opacity : null;
  }

  public override tickPrePhysics(deltaTime: number): void {
      super.tickPrePhysics(deltaTime);
    this.scroll += deltaTime;
    const camera = this.getWorld()?.getActiveCamera() ?? null;
    if (camera) {
      this.applyView(camera.position.x, camera.position.z);
    }
  }

  /** Scrolls the stripes and fades each wall by its distance to the camera. */
  private applyView(cameraX: number, cameraZ: number): void {
    if (this.texture) {
      // One wrap per tile, so the offset stays in 0..1 and never loses precision
      // on a long session.
      this.texture.offset.y = (this.scroll * BORDER_SCROLL_TILES_PER_SECOND) % 1;
    }
    for (const wall of this.walls) {
      wall.material.opacity = borderAlphaForDistance(wall.spec.distanceFrom(cameraX, cameraZ));
      // A fully transparent wall is skipped by the renderer; disabling the node
      // as well keeps it out of the physics broadphase query cost.
      wall.node.visible = wall.material.opacity > 0.01;
    }
  }

  private clearWalls(): void {
    for (const wall of this.walls) {
      wall.material.dispose();
      this.remove(wall.node);
      wall.node.destroy();
    }
    this.walls = [];

    for (const geometry of this.geometries) geometry.dispose();
    this.geometries = [];

    this.texture?.dispose();
    this.texture = null;
  }

  public override dispose(): void {
    this.clearWalls();
    super.dispose();
  }
}