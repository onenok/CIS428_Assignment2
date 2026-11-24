/**
 * Block icon tests (layer 1).
 *
 * The icon is derived from the same colour table the placeholder textures use,
 * so these tests pin the derivation rather than the exact RGB strings: changing
 * a base colour must not require editing a dozen assertions.
 */

import { describe, it } from '../../scripts/verify/harness.js';
import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import {
  BLOCK_ICON_SIZE,
  BLOCK_ICON_SHADE,
  BLOCK_ICON_TRANSPARENT_OPACITY,
  blockIconColors,
  blockIconSvg,
  materialBaseRgb,
  shadeRgb,
} from '../../src/ui/blockIcon.js';
import {
  BLOCK_GLASS,
  BLOCK_GRASS,
  BLOCK_OAK_LOG,
  BLOCK_STONE,
} from '../../src/voxel/blockIds.js';
import { PLACEHOLDER_SPECS } from '../../src/voxel/placeholderTexture.js';

describe('BlockIcon / colour derivation', () => {
  it('reads the base colour from the placeholder palette', () => {
    assertEqual(JSON.stringify(materialBaseRgb('grass_top')), JSON.stringify([95, 159, 53]));
  });

  it('falls back to magenta for an unknown material', () => {
    assertEqual(JSON.stringify(materialBaseRgb('nope')), JSON.stringify([255, 0, 255]));
  });

  it('clamps a brightened channel at 255', () => {
    assertEqual(shadeRgb([250, 250, 250], 2), 'rgb(255, 255, 255)');
  });

  it('clamps a darkened channel at 0', () => {
    assertEqual(shadeRgb([10, 10, 10], 0.1), 'rgb(1, 1, 1)');
  });

  it('shades the three visible faces differently', () => {
    const colors = blockIconColors(BLOCK_STONE);
    assertTrue(colors.top !== colors.left, 'a cube with equal faces reads as a swatch');
    assertTrue(colors.left !== colors.right);
    assertTrue(BLOCK_ICON_SHADE.top > BLOCK_ICON_SHADE.left);
    assertTrue(BLOCK_ICON_SHADE.left > BLOCK_ICON_SHADE.right);
  });

  it('uses the grass top colour for the top face only', () => {
    const colors = blockIconColors(BLOCK_GRASS);
    const expectedTop = shadeRgb(PLACEHOLDER_SPECS.grass_top.base, BLOCK_ICON_SHADE.top);
    const expectedSide = shadeRgb(PLACEHOLDER_SPECS.grass_side.base, BLOCK_ICON_SHADE.left);

    assertEqual(colors.top, expectedTop);
    assertEqual(colors.left, expectedSide);
  });

  it('takes the log top colour from the log, not from dirt', () => {
    const colors = blockIconColors(BLOCK_OAK_LOG);
    const expectedTop = shadeRgb(PLACEHOLDER_SPECS.oak_log_top.base, BLOCK_ICON_SHADE.top);

    assertEqual(colors.top, expectedTop);
  });

  it('marks glass as translucent and everything else as opaque', () => {
    assertEqual(blockIconColors(BLOCK_GLASS).opacity, BLOCK_ICON_TRANSPARENT_OPACITY);
    assertEqual(blockIconColors(BLOCK_STONE).opacity, 1);
  });
});

describe('BlockIcon / svg output', () => {
  it('draws three faces of one cube', () => {
    const svg = blockIconSvg(BLOCK_GRASS);
    assertEqual((svg.match(/<polygon/g) ?? []).length, 3);
  });

  it('is sized to the icon constant', () => {
    const svg = blockIconSvg(BLOCK_GRASS);
    assertTrue(svg.includes(`viewBox="0 0 ${BLOCK_ICON_SIZE} ${BLOCK_ICON_SIZE}"`));
    assertTrue(svg.includes(`width="${BLOCK_ICON_SIZE}"`));
  });

  it('carries the derived colours into the markup', () => {
    const colors = blockIconColors(BLOCK_GRASS);
    const svg = blockIconSvg(BLOCK_GRASS);

    assertTrue(svg.includes(colors.top), 'top face colour missing');
    assertTrue(svg.includes(colors.left), 'left face colour missing');
    assertTrue(svg.includes(colors.right), 'right face colour missing');
  });

  it('never emits an empty fill', () => {
    const svg = blockIconSvg(BLOCK_STONE);
    assertEqual(svg.includes('fill=""'), false);
  });
}, 'unit');