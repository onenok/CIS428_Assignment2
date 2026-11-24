/**
 * World-border geometry and fade maths.
 *
 * Pure functions only: no engine, no DOM, no voxel data. `WorldBorder.ts` turns
 * these specs into meshes, so the arithmetic can be unit-tested without a scene.
 *
 * The border is a square of four vertical walls around the outermost generated
 * ring. Coordinates are world metres, derived from inclusive voxel cells the same
 * way the voxel grid is: cell `n` spans `[n, n + 1)`.
 */

/** Thickness of a border wall, in metres. Thin enough to read as a plane. */
export const BORDER_WALL_THICKNESS = 0.5;

/**
 * Horizontal distance at which a wall is fully opaque, and at which it is fully
 * transparent.
 *
 * The whole world is 80 cells across, so the player is never further than ~80
 * from a far wall. The original 24..64 pair faded a wall that the player was
 * standing in the middle of the world away from down to 60 %, which read as "the
 * border is there but you can barely see it" in play. Widening the range keeps the
 * far wall faint (so it never paints a solid band across the horizon) while the
 * wall in front of the player stays at full strength from anywhere inside the
 * playable ring.
 */
export const BORDER_FADE_NEAR = 40;
export const BORDER_FADE_FAR = 100;

/** One of the four walls. */
export type BorderSide = 'north' | 'south' | 'west' | 'east';

/** Inclusive voxel extent of the region the border encloses. */
export interface BorderExtent {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** A wall slab, positioned by its centre. */
export interface BorderWallSpec {
  readonly side: BorderSide;
  readonly centerX: number;
  readonly centerZ: number;
  /** Extent along X, in metres. */
  readonly sizeX: number;
  /** Extent along Z, in metres. */
  readonly sizeZ: number;
  /**
   * Distance from the camera to the wall's plane, measured along the wall's
   * normal and clamped at 0 so a camera outside the border still renders.
   */
  readonly distanceFrom: (x: number, z: number) => number;
}

/**
 * Inclusive voxel extent covered by a square ring of chunks.
 *
 * Chunk `n` spans cells `[n * size, (n + 1) * size - 1]`, so radius 2 with a
 * chunk size of 16 is `-32 .. 47`.
 */
export function borderExtentForRadius(radiusChunks: number, chunkSize: number): BorderExtent {
  if (radiusChunks < 0) throw new Error(`borderExtentForRadius: radius must be >= 0, got ${radiusChunks}`);
  if (chunkSize <= 0) throw new Error(`borderExtentForRadius: chunkSize must be positive, got ${chunkSize}`);
  const extent = radiusChunks * chunkSize;
  return {
    minX: -extent,
    maxX: extent + chunkSize - 1,
    minZ: -extent,
    maxZ: extent + chunkSize - 1,
  };
}

/**
 * The four wall slabs around an extent.
 *
 * Each slab is centred *on* the boundary plane rather than pushed outside it, so
 * the player can still stand in the outermost cell and the wall reads as the edge
 * of the ground instead of as an invisible fence one metre short of it.
 *
 * The X walls span the full Z range and vice versa, so the corners are shared;
 * the overlap is empty space inside a translucent texture and costs two quads.
 */
export function borderWallSpecs(
  extent: BorderExtent,
  thickness: number = BORDER_WALL_THICKNESS,
): BorderWallSpec[] {
  if (thickness <= 0) throw new Error(`borderWallSpecs: thickness must be positive, got ${thickness}`);

  const minWorldX = extent.minX;
  const maxWorldX = extent.maxX + 1;
  const minWorldZ = extent.minZ;
  const maxWorldZ = extent.maxZ + 1;

  const spanX = maxWorldX - minWorldX;
  const spanZ = maxWorldZ - minWorldZ;
  const midX = (minWorldX + maxWorldX) / 2;
  const midZ = (minWorldZ + maxWorldZ) / 2;

  return [
    {
      side: 'west',
      centerX: minWorldX,
      centerZ: midZ,
      sizeX: thickness,
      sizeZ: spanZ,
      distanceFrom: (x: number) => Math.max(0, x - minWorldX),
    },
    {
      side: 'east',
      centerX: maxWorldX,
      centerZ: midZ,
      sizeX: thickness,
      sizeZ: spanZ,
      distanceFrom: (x: number) => Math.max(0, maxWorldX - x),
    },
    {
      side: 'north',
      centerX: midX,
      centerZ: minWorldZ,
      sizeX: spanX,
      sizeZ: thickness,
      distanceFrom: (_x: number, z: number) => Math.max(0, z - minWorldZ),
    },
    {
      side: 'south',
      centerX: midX,
      centerZ: maxWorldZ,
      sizeX: spanX,
      sizeZ: thickness,
      distanceFrom: (_x: number, z: number) => Math.max(0, maxWorldZ - z),
    },
  ];
}

/**
 * Opacity for a wall at the given distance: solid up close, gone far away.
 *
 * Linear rather than smoothstep because the transition happens across the middle
 * of the world where the wall is a large part of the screen; a curve makes the
 * near wall look like it is pulsing as the player walks.
 */
export function borderAlphaForDistance(
  distance: number,
  near: number = BORDER_FADE_NEAR,
  far: number = BORDER_FADE_FAR,
): number {
  if (far <= near) return distance <= near ? 1 : 0;
  if (distance <= near) return 1;
  if (distance >= far) return 0;
  return (far - distance) / (far - near);
}

/** Vertical extent a border wall covers, so it runs from the floor to the sky. */
export function borderWallHeight(config: { readonly minY: number; readonly maxY: number }): number {
  return config.maxY + 1 - config.minY;
}

/** World Y of a border wall's centre, for `borderWallHeight()` tall slabs. */
export function borderWallCenterY(config: { readonly minY: number; readonly maxY: number }): number {
  return config.minY + borderWallHeight(config) / 2;
}