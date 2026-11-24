/**
 * Dialogue data model: types only, no content and no maths.
 *
 * Split out from the old single-file `DialogueLine.ts` so that the scripts
 * (`scripts/*.ts`) can import the shape without dragging in the typewriter maths,
 * and the maths can be tested without the shipped script contents.
 */

/** Who is speaking. Drives the name plate and the portrait tint. */
export type SpeakerId = 'loomkeeper' | 'unknown' | 'player' | 'narrator';

/**
 * A stage direction attached to a line.
 *
 * Cues exist so that content can decide when a directed beat happens. Before
 * this, the turn was found by scanning the script for the first
 * `speaker === 'loomkeeper'` line, which meant renaming a speaker or reordering
 * lines silently moved the beat. With a cue, the content owns the timing and the
 * code only knows how to perform named directions.
 */
export type DialogueCue = 'turnPlayerToLoomkeeper';

/** One line of dialogue. */
export interface DialogueLine {
  readonly speaker: SpeakerId;
  readonly text: string;
  /** Extra pause after the line finishes typing, in seconds. */
  readonly pauseAfter?: number;
  /** Stage direction to perform while this line is on screen. */
  readonly cue?: DialogueCue;
}

/** Identifies a script in the registry. */
export type DialogueScriptId = 'intro' | 'submit' | 'submitBlank';

/** A named conversation. */
export interface DialogueScript {
  readonly id: DialogueScriptId;
  readonly lines: readonly DialogueLine[];
}

/** Display name for each speaker. */
export const SPEAKER_NAMES: Readonly<Record<SpeakerId, string>> = {
  loomkeeper: '織界者',
  unknown: '???',
  player: '你',
  narrator: '',
};