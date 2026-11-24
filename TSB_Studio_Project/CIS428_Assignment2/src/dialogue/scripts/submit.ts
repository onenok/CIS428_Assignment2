/**
 * Post-submit scripts.
 *
 * Two branches, matching `SubmitOutcome`:
 *   - `submit`      at least one block was placed; leads into the ending
 *   - `submitBlank` nothing was placed; the player is sent back to building
 *
 * Final text. The blank branch is the "白卷彩蛋" from the design brief: the
 * Loomkeeper does not scold, he just does it himself — which is worse, in a way.
 *
 * Neither script carries a cue. The submit scripts play over the ending, whose own
 * sequence already turns the actors; a cue here would fight it.
 */

import type { DialogueLine } from '../types.js';

/** Played when a non-empty design is submitted. */
export const SUBMIT_LINES: readonly DialogueLine[] = [
  {
    speaker: 'loomkeeper',
    text: '……嗯。可以。',
    pauseAfter: 0.9,
  },
  {
    speaker: 'loomkeeper',
    text: '剩下的我自己來。',
    pauseAfter: 1.0,
  },
  {
    speaker: 'loomkeeper',
    text: '謝了。',
    pauseAfter: 1.4,
  },
];

/** Played when the player submits nothing. */
export const SUBMIT_BLANK_LINES: readonly DialogueLine[] = [
  {
    speaker: 'loomkeeper',
    text: '……空的。',
    pauseAfter: 0.9,
  },
  {
    speaker: 'loomkeeper',
    text: '既然你想不到，那我就自己弄了，反正也沒差多少。但還是謝了。',
    pauseAfter: 1.0,
  },
];