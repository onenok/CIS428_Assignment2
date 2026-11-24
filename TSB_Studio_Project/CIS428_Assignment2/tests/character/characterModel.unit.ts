import { describe, it } from '../../scripts/verify/harness.js';
import { assertClose, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import {
  LOOMKEEPER_FOOTPRINT,
  LOOMKEEPER_MODEL_HEIGHT,
  LOOMKEEPER_MODEL_PATH,
  LOOMKEEPER_UNIT,
} from '../../src/character/LoomkeeperModel.js';
import {
  PLAYER_MODEL_FOOTPRINT,
  PLAYER_MODEL_HEIGHT,
  PLAYER_MODEL_PATH,
  PLAYER_MODEL_UNIT,
} from '../../src/character/PlayerModel.js';
import { NPC_HEIGHT } from '../../src/character/npcSpawn.js';
import {
  LOOMKEEPER_COLLIDER_HALF,
  LOOMKEEPER_ROOT_MARKER_SIZE,
} from '../../src/character/Loomkeeper.js';
import {
  PLAYER_COLLISION_HEIGHT,
  PLAYER_COLLISION_WIDTH,
} from '../../src/character/MyCharacterPawn.js';

describe('LoomkeeperModel / scale constants', () => {
  it('scales the export to the height the NPC contract assumes', () => {
    assertClose(LOOMKEEPER_MODEL_HEIGHT, NPC_HEIGHT, 1e-9);
    // The export's assembled vertical span is 130.047 units, not the 37 a mesh-local
    // read suggests: the node tree has World-Global / World-Local pairs, so only the
    // transformed bounds describe the character.
    assertClose(LOOMKEEPER_UNIT, NPC_HEIGHT / 130.047, 1e-9);
  });

  it('derives the footprint from the assembled export, not from a guess', () => {
    // Measured by transforming every POSITION bound by its node's world matrix:
    // 64.2 x 130.047 x 16.2 units.
    assertClose(LOOMKEEPER_FOOTPRINT.width, 64.2 * LOOMKEEPER_UNIT, 1e-9);
    assertClose(LOOMKEEPER_FOOTPRINT.depth, 16.2 * LOOMKEEPER_UNIT, 1e-9);
    assertClose(LOOMKEEPER_FOOTPRINT.height, LOOMKEEPER_MODEL_HEIGHT, 1e-9);
  });

  it('is wider than it is deep, which is why a capsule did not fit', () => {
    assertTrue(LOOMKEEPER_FOOTPRINT.width > LOOMKEEPER_FOOTPRINT.depth);
  });

  it('points at the VoxEdit export that has arms and a head', () => {
    // The previous hand-built model had neither, because the reference it was
    // transcribed from only listed the torso parts. The export is the source of truth.
    assertEqual(LOOMKEEPER_MODEL_PATH, '@project/assets/models/Loomkeeper.glb');
  });

  it('uses the @project prefix, or the build does not copy the model', () => {
    // The asset pipeline copies a project file only when its full `@project/...` path
    // appears in a string literal. A bare `models/x.glb` is silently left out of the
    // build, and the static server then answers the request with the SPA's
    // `index.html` — which surfaces as "Unexpected token '<', "<!DOCTYPE"" from the
    // glTF parser rather than as a 404.
    assertTrue(LOOMKEEPER_MODEL_PATH.startsWith('@project/'));
    assertTrue(PLAYER_MODEL_PATH.startsWith('@project/'));
  });
});

describe('Loomkeeper / collider', () => {
  it('sizes the box to the footprint', () => {
    assertClose(LOOMKEEPER_COLLIDER_HALF.x, LOOMKEEPER_FOOTPRINT.width / 2, 1e-9);
    assertClose(LOOMKEEPER_COLLIDER_HALF.z, LOOMKEEPER_FOOTPRINT.depth / 2, 1e-9);
  });

  it('keeps the vertical extent on the pawn height contract', () => {
    // `npcSpawn.pawnCentreFromFeet()` adds half of NPC_HEIGHT, so the box has to be
    // centred at that same half-height or the NPC floats or sinks.
    assertClose(LOOMKEEPER_COLLIDER_HALF.y, NPC_HEIGHT / 2, 1e-9);
  });

  it('is wider than the capsule it replaced', () => {
    // The old capsule used a fixed 0.4 radius; if the box is not wider, the model
    // change never reached the collider.
    assertTrue(LOOMKEEPER_COLLIDER_HALF.x > 0.4);
  });

  it('has a root marker small enough to read as a pivot, not scenery', () => {
    assertTrue(LOOMKEEPER_ROOT_MARKER_SIZE > 0);
    assertTrue(LOOMKEEPER_ROOT_MARKER_SIZE < 0.2);
  });
});

describe('PlayerModel / scale constants', () => {
  it('scales the model to the player collider height', () => {
    assertClose(PLAYER_MODEL_HEIGHT, PLAYER_COLLISION_HEIGHT, 1e-9);
    // Bounds with the Sketchfab display disc removed: 8.009 units tall.
    assertClose(PLAYER_MODEL_UNIT, PLAYER_COLLISION_HEIGHT / 8.009, 1e-9);
  });

  it('measures the body, not the sketch platform the export ships with', () => {
    // With the platform left in, the glb's bounds are 16.401 x 11.006 x 16.401 — the
    // disc dominates and the character comes out at roughly half size. These are the
    // body-only numbers, and the width must be the largest of them at about half the
    // height (Minecraft's shoulder span).
    assertClose(PLAYER_MODEL_FOOTPRINT.width, 4.005 * PLAYER_MODEL_UNIT, 1e-9);
    assertClose(PLAYER_MODEL_FOOTPRINT.depth, 2.017 * PLAYER_MODEL_UNIT, 1e-9);
    assertTrue(PLAYER_MODEL_FOOTPRINT.width < PLAYER_MODEL_HEIGHT);
    assertTrue(PLAYER_MODEL_FOOTPRINT.width > PLAYER_MODEL_FOOTPRINT.depth);
  });

  it('points at the glb that ships with the project', () => {
    assertEqual(PLAYER_MODEL_PATH, '@project/assets/models/steve-minecraft.glb');
  });
});
