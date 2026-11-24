/**
 * Placeholder block textures.
 *
 * The real block textures are authored later; until then every material key gets
 * a procedurally generated 16x16 tile so the mesher, the material slots and the
 * build loop can all be exercised end to end.
 *
 * Two rules matter for the look:
  *   - `NearestFilter` when magnifying (camera close to a block) but a mip chain
  *     when minifying. Nearest-only minification samples a few texels per pixel
  *     with no mip chain, so a whole chunk of ground aliases into a nearly uniform
  *     colour with moire bands across it.
 *   - `SRGBColorSpace`, otherwise the colours come out washed out
 *
 * The noise is deterministic per material key, so a given block always looks the
 * same across reloads and across machines.
 */

import * as THREE from 'three';

/** Edge length of a placeholder tile, in pixels. Matches the real texture size. */
export const PLACEHOLDER_TILE_SIZE = 16;

/** Base colour plus noise amplitude for one material key. */
export interface PlaceholderSpec {
  /** Base RGB, each channel 0..255. */
  readonly base: readonly [number, number, number];
  /** Peak-to-peak noise added to each channel. 0 = flat colour. */
  readonly noise: number;
  /** Optional darker grid lines, used to make tiles readable at a distance. */
  readonly gridLines?: boolean;
}

/**
 * Colour table for the palette.
 *
 * Values are eyeballed from the Minecraft palette so the placeholder world reads
 * as "grass / dirt / stone" at a glance rather than as abstract swatches.
 */
export const PLACEHOLDER_SPECS: Readonly<Record<string, PlaceholderSpec>> = {
  grass_top: { base: [95, 159, 53], noise: 24 },
  grass_side: { base: [134, 96, 67], noise: 20, gridLines: true },
  dirt: { base: [134, 96, 67], noise: 22 },
  stone: { base: [125, 125, 125], noise: 18 },
  cobblestone: { base: [110, 110, 110], noise: 34, gridLines: true },
  oak_planks: { base: [162, 130, 78], noise: 14, gridLines: true },
  oak_log_side: { base: [102, 81, 50], noise: 18, gridLines: true },
  oak_log_top: { base: [154, 125, 77], noise: 16 },
  sand: { base: [219, 207, 163], noise: 12 },
  glass: { base: [200, 230, 240], noise: 6, gridLines: true },
  bricks: { base: [150, 74, 60], noise: 16, gridLines: true },
};

/** Fallback spec for a material key with no entry. */
const FALLBACK_SPEC: PlaceholderSpec = { base: [255, 0, 255], noise: 0 };

/**
 * Deterministic 32-bit hash of a string.
 *
 * Used to seed the noise so each material key gets a stable pattern.
 */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Small deterministic PRNG (mulberry32). Returns values in [0, 1). */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clamps a channel to 0..255. */
function clampChannel(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

/**
 * Builds the raw RGBA pixel buffer for one material key.
 *
 * Returned as a plain `Uint8ClampedArray` so it can be tested without a canvas.
 */
export function buildPlaceholderPixels(
  materialKey: string,
  size: number = PLACEHOLDER_TILE_SIZE,
): Uint8ClampedArray {
  const spec = PLACEHOLDER_SPECS[materialKey] ?? FALLBACK_SPEC;
  const random = makeRandom(hashString(materialKey));
  const pixels = new Uint8ClampedArray(size * size * 4);
  const [baseR, baseG, baseB] = spec.base;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const delta = (random() - 0.5) * spec.noise;

      let r = baseR + delta;
      let g = baseG + delta;
      let b = baseB + delta;

      if (spec.gridLines && (x === 0 || y === 0)) {
        r *= 0.75;
        g *= 0.75;
        b *= 0.75;
      }

      pixels[offset] = clampChannel(r);
      pixels[offset + 1] = clampChannel(g);
      pixels[offset + 2] = clampChannel(b);
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

/**
 * Applies the pixel-art sampling settings to a texture.
 *
 * Exported separately so the same settings can be re-applied to a texture that
 * was loaded from disk rather than generated.
 *
 * Sampling rules:
 *   - `magFilter = Nearest` keeps the pixels crisp when the camera is close.
 *   - `minFilter = NearestMipmapLinear` is what stops a 16x16 tile from turning
 *     into flat mush at a distance. Nearest-only minification samples a handful
 *     of texels per pixel with no mip chain, so a whole chunk of ground aliases
 *     into a nearly uniform colour with moire bands across it.
 *   - mipmaps must be generated for the mip filter to have anything to sample.
 */
export function applyPixelArtSettings(texture: THREE.Texture): THREE.Texture {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Anisotropy used when the renderer cannot report its own limit.
 *
 * 1 (three.js's default) makes a texture sampled at a grazing angle — a ground
 * plane viewed from eye height — collapse to the coarsest mip level, which for a
 * 16x16 tile is essentially one colour. A small non-default value is a safe
 * improvement even when the real limit is unknown.
 */
export const FALLBACK_ANISOTROPY = 4;

/** Highest anisotropy Three.js honours, regardless of what a driver reports. */
export const MAX_SUPPORTED_ANISOTROPY = 16;

/**
 * Sets anisotropic filtering on a set of textures.
 *
 * Anisotropic filtering is what keeps a tiled ground texture readable at the
 * shallow viewing angles a first-person camera produces. Without it, the UV
 * derivatives along a receding floor are enormous, so the sampler picks the
 * coarsest mip available and a whole chunk of ground draws as one average colour
 * — then snaps back to full detail for the single frame where an edit rebuilds
 * the mesh, because that frame samples the freshly uploaded level 0.
 *
 * The value must come from the renderer's capability (`getMaxAnisotropy()`);
 * anything above it is silently clamped by the driver.
 */
export function applyAnisotropy(
  textures: Iterable<THREE.Texture>,
  maxAnisotropy: number,
): void {
  const level = clampAnisotropy(maxAnisotropy);
  for (const texture of textures) {
    texture.anisotropy = level;
    texture.needsUpdate = true;
  }
}

/** Rounds a requested anisotropy into the range Three.js and WebGL accept. */
export function clampAnisotropy(maxAnisotropy: number): number {
  if (!Number.isFinite(maxAnisotropy) || maxAnisotropy < 1) {
    return 1;
  }
  return Math.min(Math.floor(maxAnisotropy), MAX_SUPPORTED_ANISOTROPY);
}

/**
 * Creates a `CanvasTexture` for one material key.
 *
 * Requires a DOM canvas, so this is only called at runtime, never in unit tests.
 */
export function makePlaceholderTexture(
  materialKey: string,
  size: number = PLACEHOLDER_TILE_SIZE,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('makePlaceholderTexture: 2D canvas context unavailable');

  const pixels = buildPlaceholderPixels(materialKey, size);
  const imageData = context.createImageData(size, size);
  imageData.data.set(pixels);
  context.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  return applyPixelArtSettings(texture) as THREE.CanvasTexture;
}

/** Builds one placeholder texture per material key. */
export function makePlaceholderTextureSet(
  materialKeys: readonly string[],
  size: number = PLACEHOLDER_TILE_SIZE,
): Map<string, THREE.CanvasTexture> {
  const textures = new Map<string, THREE.CanvasTexture>();
  for (const key of materialKeys) textures.set(key, makePlaceholderTexture(key, size));
  return textures;
}

/**
 * Reports the largest anisotropy the renderer supports.
 *
 * Only WebGL exposes the query; a WebGPU renderer is reported as unknown so the
 * caller falls back to {@link FALLBACK_ANISOTROPY} rather than assuming a limit.
 */
export function maxAnisotropyOf(renderer: unknown): number | null {
  const webgl = (renderer as { asWebGL?: () => { capabilities?: { getMaxAnisotropy?: () => number } } | null })
    ?.asWebGL?.() ?? null;
  const capabilities = webgl?.capabilities ?? null;
  if (!capabilities || typeof capabilities.getMaxAnisotropy !== 'function') {
    return null;
  }
  const value = capabilities.getMaxAnisotropy();
  return Number.isFinite(value) && value >= 1 ? value : null;
}