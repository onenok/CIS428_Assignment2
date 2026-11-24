/**
 * Submit gating.
 *
 * The player submits their design by confirming the dialog that Ctrl+Enter
 * opens. There is no minimum size and no shape requirement: any arrangement of
 * blocks is a valid design, including a single block stuck to a wall.
 *
 * What is still checked is whether the player built *anything at all*, because
 * handing the Keeper an untouched landscape gives it nothing to read:
 *
 *   normal - at least one block was placed; the design is submitted
 *   blank  - nothing was placed; the player is told there is nothing to submit
 *
 * The check is deliberately based on the *placed block count*, not on the
 * difference from the generated terrain, so the pre-generated ground never
 * counts as the player's work.
 */

export type SubmitOutcome = 'blank' | 'normal';

/** Decides which branch the submit takes. */
export function evaluateSubmit(placedBlockCount: number): SubmitOutcome {
  return placedBlockCount > 0 ? 'normal' : 'blank';
}

/** True when the submit has nothing to send. */
export function isBlankSubmission(placedBlockCount: number): boolean {
  return evaluateSubmit(placedBlockCount) === 'blank';
}