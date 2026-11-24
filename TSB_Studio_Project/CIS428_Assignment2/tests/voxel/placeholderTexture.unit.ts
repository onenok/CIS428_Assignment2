/**
 * Layer 1 — placeholder texture generation.
 *
 * Covers U-M-03 (pixel generation) and U-M-04 (pixel-art sampling settings).
 * The canvas-backed `makePlaceholderTexture()` needs a DOM, so only the pure
 * pixel builder and the filter settings are tested here.
 */

import * as THREE from 'three';

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import {
  FALLBACK_ANISOTROPY,
  MAX_SUPPORTED_ANISOTROPY,
  PLACEHOLDER_SPECS,
  PLACEHOLDER_TILE_SIZE,
  applyAnisotropy,
  applyPixelArtSettings,
  buildPlaceholderPixels,
  clampAnisotropy,
  hashString,
  makeRandom,
  maxAnisotropyOf,
} from '../../src/voxel/placeholderTexture.js';

describe('placeholderTexture: pixels', () => {
  it('produces a full RGBA buffer', () => {
    const pixels = buildPlaceholderPixels('stone');
    assertEqual(pixels.length, PLACEHOLDER_TILE_SIZE * PLACEHOLDER_TILE_SIZE * 4);
  });

  it('is fully opaque', () => {
    const pixels = buildPlaceholderPixels('stone');
    for (let i = 3; i < pixels.length; i += 4) assertEqual(pixels[i], 255);
  });

  it('is deterministic for the same key', () => {
    const a = buildPlaceholderPixels('stone');
    const b = buildPlaceholderPixels('stone');
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        assertTrue(false, `pixel ${i} differs between runs`);
        return;
      }
    }
    assertTrue(true);
  });

  it('differs between material keys', () => {
    const stone = buildPlaceholderPixels('stone');
    const sand = buildPlaceholderPixels('sand');
    let differences = 0;
    for (let i = 0; i < stone.length; i++) if (stone[i] !== sand[i]) differences++;
    assertTrue(differences > 0, 'different keys should produce different pixels');
  });

  it('stays within the 0..255 range', () => {
    for (const key of Object.keys(PLACEHOLDER_SPECS)) {
      const pixels = buildPlaceholderPixels(key);
      for (let i = 0; i < pixels.length; i++) {
        assertTrue(pixels[i] >= 0 && pixels[i] <= 255, `${key} pixel ${i} out of range`);
      }
    }
  });

  it('falls back to magenta for an unknown key', () => {
    const pixels = buildPlaceholderPixels('unknown_key');
    assertEqual(pixels[0], 255);
    assertEqual(pixels[1], 0);
    assertEqual(pixels[2], 255);
  });

  it('honours a custom tile size', () => {
    const pixels = buildPlaceholderPixels('stone', 8);
    assertEqual(pixels.length, 8 * 8 * 4);
  });

  it('covers every material key in the palette', () => {
    for (const key of Object.keys(PLACEHOLDER_SPECS)) {
      assertTrue(buildPlaceholderPixels(key).length > 0, `${key} produced no pixels`);
    }
  });
});

describe('placeholderTexture: sampling settings', () => {
  it('keeps magnification nearest so close-up pixels stay crisp', () => {
    assertEqual(applyPixelArtSettings(new THREE.Texture()).magFilter, THREE.NearestFilter);
  });

  it('uses a nearest-mipmap min filter so distant ground does not alias', () => {
    // Nearest-only minification samples no mip chain, so a 16x16 tile collapses
    // into a flat colour with moire bands once a chunk fills the screen.
    assertEqual(applyPixelArtSettings(new THREE.Texture()).minFilter, THREE.NearestMipmapLinearFilter);
  });

  it('enables mipmaps, which the min filter needs', () => {
    assertTrue(applyPixelArtSettings(new THREE.Texture()).generateMipmaps);
  });

  it('repeats on both axes', () => {
    const texture = applyPixelArtSettings(new THREE.Texture());
    assertEqual(texture.wrapS, THREE.RepeatWrapping);
    assertEqual(texture.wrapT, THREE.RepeatWrapping);
  });

  it('uses the sRGB colour space', () => {
    assertEqual(applyPixelArtSettings(new THREE.Texture()).colorSpace, THREE.SRGBColorSpace);
  });

  it('returns the same texture instance', () => {
      const texture = new THREE.Texture();
      assertTrue(applyPixelArtSettings(texture) === texture, 'should mutate and return the input');
    });
});

describe('placeholderTexture: anisotropy', () => {
  // The floor is always viewed at a grazing angle in first person, so without
  // anisotropic filtering the sampler picks the coarsest mip and a whole chunk of
  // ground averages into one colour.
  it('applies the requested anisotropy to every texture', () => {
    const textures = [
      applyPixelArtSettings(new THREE.Texture()),
      applyPixelArtSettings(new THREE.Texture()),
    ];
    applyAnisotropy(textures, 8);
    for (const texture of textures) assertEqual(texture.anisotropy, 8);
  });

  it('clamps anisotropy to what Three.js honours', () => {
    assertEqual(clampAnisotropy(64), MAX_SUPPORTED_ANISOTROPY);
    assertEqual(clampAnisotropy(8), 8);
  });

  it('never drops below 1', () => {
    assertEqual(clampAnisotropy(0), 1);
    assertEqual(clampAnisotropy(-4), 1);
    assertEqual(clampAnisotropy(Number.NaN), 1);
    assertEqual(clampAnisotropy(3.7), 3);
  });

  it('reads the limit from a WebGL renderer', () => {
    const renderer = { asWebGL: () => ({ capabilities: { getMaxAnisotropy: () => 16 } }) };
    assertEqual(maxAnisotropyOf(renderer), 16);
  });

  it('reports unknown when the renderer cannot answer', () => {
    assertEqual(maxAnisotropyOf(null), null);
    assertEqual(maxAnisotropyOf({ asWebGL: () => null }), null);
    // A WebGPU renderer has no `getMaxAnisotropy`, so the caller must fall back.
    assertEqual(maxAnisotropyOf({ asWebGL: () => ({}) }), null);
  });

  it('has a usable fallback above the aliasing threshold', () => {
    assertTrue(FALLBACK_ANISOTROPY > 1, 'fallback must be better than the default');
    assertEqual(clampAnisotropy(FALLBACK_ANISOTROPY), FALLBACK_ANISOTROPY);
  });
});

describe('placeholderTexture: helpers', () => {
  it('hashes strings deterministically', () => {
    assertEqual(hashString('stone'), hashString('stone'));
  });

  it('hashes different strings differently', () => {
    assertTrue(hashString('stone') !== hashString('sand'));
  });

  it('produces values in [0, 1)', () => {
    const random = makeRandom(12345);
    for (let i = 0; i < 100; i++) {
      const value = random();
      assertTrue(value >= 0 && value < 1, `value ${value} out of range`);
    }
  });

  it('repeats the same sequence for the same seed', () => {
    const a = makeRandom(42);
    const b = makeRandom(42);
    for (let i = 0; i < 10; i++) assertEqual(a(), b());
  });
});