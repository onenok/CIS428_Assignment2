/**
 * Layer 1 — world border geometry, fade and texture.
 *
 * The border is what stops the player from walking off the edge of the generated
 * ground, so its extent is asserted against the *voxel* range the terrain
 * actually covers rather than against a hand-written number: if the world radii
 * ever change, these fail instead of silently leaving a gap to fall through.
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import {
  BORDER_FADE_FAR,
  BORDER_FADE_NEAR,
  borderAlphaForDistance,
  borderExtentForRadius,
  borderWallCenterY,
  borderWallHeight,
  borderWallSpecs,
} from '../../src/world/borderSpec.js';
import { GAMEPLAY_WORLD_GEN_CONFIG, PIT_FLOOR_Y, pitFloorIsWorldFloor } from '../../src/world/gameplayWorld.js';
import {
  BORDER_BAND_ALPHAS,
  BORDER_TILE_SIZE,
  borderBandPeriod,
  borderTexelAlpha,
  buildBorderPixels,
} from '../../src/world/worldBorderTexture.js';
import { WORLD_MAX_Y, WORLD_MIN_Y } from '../../src/voxel/coords.js';

const EXTENT = borderExtentForRadius(
  GAMEPLAY_WORLD_GEN_CONFIG.playableRadius,
  GAMEPLAY_WORLD_GEN_CONFIG.chunkSize,
);

describe('border: extent', () => {
  it('covers every generated chunk', () => {
    const radius = GAMEPLAY_WORLD_GEN_CONFIG.playableRadius;
    const size = GAMEPLAY_WORLD_GEN_CONFIG.chunkSize;
    assertEqual(EXTENT.minX, -radius * size);
    assertEqual(EXTENT.maxX, (radius + 1) * size - 1);
    assertEqual(EXTENT.minZ, -radius * size);
    assertEqual(EXTENT.maxZ, (radius + 1) * size - 1);
  });

  it('rejects nonsense radii', () => {
    let threw = false;
    try {
      borderExtentForRadius(-1, 16);
    } catch {
      threw = true;
    }
    assertTrue(threw, 'a negative radius should throw');
  });
});

describe('border: walls', () => {
  const walls = borderWallSpecs(EXTENT, 0.5);

  it('builds one wall per side', () => {
    assertEqual(walls.length, 4);
    assertEqual(
      walls.map(wall => wall.side).join(','),
      'west,east,north,south',
    );
  });

  it('sits on the boundary planes', () => {
    const west = walls.find(wall => wall.side === 'west')!;
    const east = walls.find(wall => wall.side === 'east')!;
    const north = walls.find(wall => wall.side === 'north')!;
    const south = walls.find(wall => wall.side === 'south')!;

    assertEqual(west.centerX, EXTENT.minX);
    assertEqual(east.centerX, EXTENT.maxX + 1);
    assertEqual(north.centerZ, EXTENT.minZ);
    assertEqual(south.centerZ, EXTENT.maxZ + 1);
  });

  it('spans the whole opposite axis, corners included', () => {
    const west = walls.find(wall => wall.side === 'west')!;
    const north = walls.find(wall => wall.side === 'north')!;
    const spanX = EXTENT.maxX + 1 - EXTENT.minX;
    const spanZ = EXTENT.maxZ + 1 - EXTENT.minZ;

    assertEqual(west.sizeZ, spanZ);
    assertEqual(north.sizeX, spanX);
  });

  it('measures distance from the inside of each wall', () => {
    const west = walls.find(wall => wall.side === 'west')!;
    const east = walls.find(wall => wall.side === 'east')!;

    assertEqual(west.distanceFrom(EXTENT.minX, 0), 0, 'standing on the west wall');
    assertEqual(east.distanceFrom(EXTENT.maxX + 1, 0), 0, 'standing on the east wall');
    assertTrue(west.distanceFrom(EXTENT.maxX, 0) > 0, 'west wall is far from the east edge');
  });

  it('runs from the bottom of the world to the top', () => {
    const height = borderWallHeight(GAMEPLAY_WORLD_GEN_CONFIG);
    assertEqual(height, WORLD_MAX_Y + 1 - WORLD_MIN_Y);
    assertEqual(borderWallCenterY(GAMEPLAY_WORLD_GEN_CONFIG), height / 2);
  });
});

describe('border: distance fade', () => {
  it('is solid up close and gone far away', () => {
    assertEqual(borderAlphaForDistance(0), 1);
    assertEqual(borderAlphaForDistance(BORDER_FADE_NEAR), 1);
    assertEqual(borderAlphaForDistance(BORDER_FADE_FAR), 0);
    assertEqual(borderAlphaForDistance(BORDER_FADE_FAR + 50), 0);
  });

  it('falls off monotonically between the two ends', () => {
    const midpoint = borderAlphaForDistance((BORDER_FADE_NEAR + BORDER_FADE_FAR) / 2);
    assertTrue(Math.abs(midpoint - 0.5) < 1e-9, `expected 0.5 at the midpoint, got ${midpoint}`);

    let previous = 1;
    for (let d = BORDER_FADE_NEAR; d <= BORDER_FADE_FAR; d += 2) {
      const alpha = borderAlphaForDistance(d);
      assertTrue(alpha <= previous + 1e-9, `alpha should not rise with distance (d=${d})`);
      previous = alpha;
    }
  });
});

describe('border: stripe texture', () => {
  it('is periodic so the tile repeats seamlessly', () => {
    const period = borderBandPeriod();
    for (let y = 0; y < BORDER_TILE_SIZE; y++) {
      for (let x = 0; x < BORDER_TILE_SIZE; x++) {
        assertEqual(
          borderTexelAlpha(x, y),
          borderTexelAlpha(x + period, y),
          `alpha at (${x},${y}) should repeat every ${period} texels`,
        );
      }
    }
  });

  it('ramps down along the diagonal and then clears', () => {
    const period = borderBandPeriod();
    const rampLength = period / 2;
    for (let i = 0; i < rampLength; i++) {
      assertEqual(borderTexelAlpha(i, 0), BORDER_BAND_ALPHAS[i], `ramp step ${i}`);
    }
    for (let i = rampLength; i < period; i++) {
      assertEqual(borderTexelAlpha(i, 0), 0, `gap step ${i}`);
    }
  });

  it('leaves the colour white so the material tint decides the hue', () => {
    const pixels = buildBorderPixels();
    for (let i = 0; i < pixels.length; i += 4) {
      assertEqual(pixels[i], 255);
      assertEqual(pixels[i + 1], 255);
      assertEqual(pixels[i + 2], 255);
    }
  });
});

describe('gameplay world: pit floor', () => {
  it('puts the bedrock on the bottom of the world', () => {
    assertEqual(PIT_FLOOR_Y, WORLD_MIN_Y);
    assertTrue(pitFloorIsWorldFloor(), 'the pit floor should be the world floor');
  });

  it('keeps only the centre chunk editable', () => {
    assertEqual(GAMEPLAY_WORLD_GEN_CONFIG.editableRadius, 0);
  });
});