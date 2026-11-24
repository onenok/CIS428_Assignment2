/**
 * Size constants for the Loomkeeper.
 *
 * The model itself is the VoxEdit export, `assets/models/Loomkeeper.glb`, loaded by
 * `Loomkeeper.ts`. Nothing here describes geometry: these are the numbers the rest of
 * the game needs — how tall the character must be, and how much floor space its
 * collider takes — so they live in an engine-free module where they can be tested
 * without a world.
 *
 * Values come from measuring the export rather than from guessing. The glTF's
 * `POSITION` accessors give a combined span of 23.0 × 37.0 × 16.0 units, so scaling
 * 37 units to the target height yields the footprint below. After an earlier attempt
 * to rebuild the rig by hand — which produced a model with no arms and no head,
 * because the reference document it was transcribed from only listed the torso — the
 * rule here is that measured numbers beat transcribed ones.
 */

/**
 * Path of the VoxEdit export.
 *
 * `@project/` is the engine's alias for the project root — see `PLAYER_MODEL_PATH` for
 * why a bare relative path fails: the static server answers the miss with the SPA's
 * `index.html`, and the glTF parser then chokes on `<!DOCTYPE`.
 */
export const LOOMKEEPER_MODEL_PATH = '@project/assets/models/Loomkeeper.glb';

/** Height the model is scaled to, in metres. Matches `NPC_HEIGHT` in `npcSpawn.ts`. */
export const LOOMKEEPER_MODEL_HEIGHT = 1.8;

/**
 * Combined span of the export's meshes **in world space**, in the file's own units.
 *
 * Measured by walking the glTF node tree and transforming every `POSITION` bound by its
 * node's world matrix, because the export's node tree is not flat: it has `World-Global`
 * / `World-Local` pairs, and the local mesh bounds (23 × 37 × 16) are nothing like the
 * assembled figure. Using the local numbers gives a collider roughly a third of the
 * character's real width, which shows up as a hitbox the model pokes out of.
 */
const EXPORT_SPAN = { x: 64.2, y: 130.047, z: 16.2 } as const;

/** Metres per export unit, from scaling the export's height to the target height. */
export const LOOMKEEPER_UNIT = LOOMKEEPER_MODEL_HEIGHT / EXPORT_SPAN.y;

/**
 * Floor space the collider occupies, in metres.
 *
 * The character is noticeably wider than it is deep — the shoulder armour and arms
 * push the silhouette out sideways — which is why the collider is a box and not a
 * capsule: a single radius would have to be either too fat front-to-back or too thin
 * across the shoulders.
 */
export const LOOMKEEPER_FOOTPRINT = {
  width: EXPORT_SPAN.x * LOOMKEEPER_UNIT,
  depth: EXPORT_SPAN.z * LOOMKEEPER_UNIT,
  height: LOOMKEEPER_MODEL_HEIGHT,
} as const;
