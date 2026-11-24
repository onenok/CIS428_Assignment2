/**
 * World-border texture.
 *
 * A 16x16 tileable greyscale mask: diagonal bands that fade out over four texels
 * and are transparent for the next four. It is deliberately *colourless* — the
 * blue is applied by the material's `color` (a multiply), which is exactly how
 * Minecraft does it: one texture, three states (idle blue / expanding green /
 * shrinking red) chosen at runtime.
 *
 * Baking the blue into the image would double the tint (blue x blue) and come out
 * dark, so the pixels stay white and only the alpha carries the shape.
 *
 * Generated rather than shipped as a PNG because the rest of this project has no
 * image assets at all — every material is a procedurally drawn canvas — and a
 * pure pixel function can be asserted in unit tests.
 */

import * as THREE from 'three';

/**
 * Edge length of one border tile, in pixels.
 *
 * 32 rather than the reference's 16 so the band ramp has eight steps instead of
 * four: at four metres per tile a four-step ramp reads as three hard stripes with
 * visible stair-stepping along the 45-degree edge, which is what the first in-game
 * build looked like.
 */
export const BORDER_TILE_SIZE = 32;

/** Diagonal bands per tile. Two gives a 16-texel period on a 32-texel tile. */
export const BORDER_BAND_COUNT = 2;

/**
 * Alpha ramp across one band, from the leading edge to fully transparent.
 *
 * The shape of the falloff follows the reference texture — a lit half then a clear
 * half — but the values are pushed much brighter than the original 171/156/126/60.
 * The reference is an *additive* glow drawn against a dark sky; this world's sky is
 * near-white, so the same numbers washed out to a barely visible haze (measured in
 * play: the hatch only showed where it crossed the grass). A near-opaque leading
 * edge keeps the hatch readable against the sky while the eight steps smooth the
 * edge instead of banding it.
 */
export const BORDER_BAND_ALPHAS: readonly number[] = [255, 245, 228, 205, 176, 142, 104, 62];

/** Texels per band at the default tile size. */
export function borderBandPeriod(size: number = BORDER_TILE_SIZE): number {
  return Math.max(1, Math.round(size / BORDER_BAND_COUNT));
}

/**
 * Alpha of the texel at `(x, y)`.
 *
 * The pattern runs along `x + y`, which produces a 45-degree band; it is periodic
 * in both axes so the tile repeats seamlessly on a wall dozens of metres wide.
 */
export function borderTexelAlpha(x: number, y: number, size: number = BORDER_TILE_SIZE): number {
  const period = borderBandPeriod(size);
  const index = ((x + y) % period + period) % period;
  const rampLength = Math.max(1, Math.floor(period / 2));
  if (index >= rampLength) return 0;
  const ramp = BORDER_BAND_ALPHAS;
  return ramp[Math.min(index, ramp.length - 1)] ?? 0;
}

/**
 * Raw RGBA buffer for one tile.
 *
 * White RGB with the alpha ramp, so the material colour is the only thing that
 * decides the hue.
 */
export function buildBorderPixels(size: number = BORDER_TILE_SIZE): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = borderTexelAlpha(x, y, size);
    }
  }
  return pixels;
}

/**
 * Builds the border texture.
 *
 * Linear filtering, not `NearestFilter`: the band is a gradient, and nearest
 * sampling turns the four-texel ramp into three hard steps that read as a ladder
 * once the tile is stretched over a wall. Repeating is what lets a 16x16 tile
 * cover a 80 x 256 wall with a single quad.
 *
 * Requires a DOM canvas, so this is only called at runtime, never in unit tests.
 */
export function makeBorderTexture(size: number = BORDER_TILE_SIZE): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('makeBorderTexture: 2D canvas context unavailable');

  const imageData = context.createImageData(size, size);
  imageData.data.set(buildBorderPixels(size));
  context.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}