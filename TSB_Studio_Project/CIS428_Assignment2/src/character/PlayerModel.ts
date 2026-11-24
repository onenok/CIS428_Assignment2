/**
 * Size constants for the player model.
 *
 * The model itself is `assets/models/steve-minecraft.glb`, loaded by
 * `MyCharacterPawn.setupVisualNode()`. This module holds only the numbers the rest of
 * the game needs, so they can be tested without a world.
 *
 * The values are measured from the glb, not guessed. Its skinned mesh has `POSITION`
 * bounds of 4.005 × 8.009 × 2.017 units with the feet already at y = 0, so scaling the
 * vertical span to the 1.8 m the collider uses gives the footprint below.
 *
 * The model's width includes the arms, which is why it is wider than the player's
 * 0.6 m collider — exactly as in Minecraft, where the arms may brush a wall the body
 * cannot enter.
 */

/**
 * Path of the player model.
 *
 * The `@project/` prefix is required, not cosmetic: the engine aliases `@project/` to
 * the project root and `@engine/` to the SDK's own assets. A bare `models/...` is a
 * plain relative URL, and a static server answers a miss on it with the SPA's
 * `index.html` — which is exactly the "Unexpected token '<', "<!DOCTYPE" error the play
 * build reported.
 */
export const PLAYER_MODEL_PATH = '@project/assets/models/steve-minecraft.glb';

/** Height the model is scaled to, in metres. Matches `PLAYER_COLLISION_HEIGHT`. */
export const PLAYER_MODEL_HEIGHT = 1.8;

/** Combined span of the model's mesh bounds, in the file's own units. */
const MODEL_SPAN = { x: 4.005, y: 8.009, z: 2.017 } as const;

/** Metres per model unit, from scaling the model's height to the target height. */
export const PLAYER_MODEL_UNIT = PLAYER_MODEL_HEIGHT / MODEL_SPAN.y;

/**
 * Space the visual occupies, in metres.
 *
 * Wider than it is deep, and wider than the collider: the arms are included in the
 * mesh bounds.
 */
export const PLAYER_MODEL_FOOTPRINT = {
  width: MODEL_SPAN.x * PLAYER_MODEL_UNIT,
  depth: MODEL_SPAN.z * PLAYER_MODEL_UNIT,
  height: PLAYER_MODEL_HEIGHT,
} as const;
