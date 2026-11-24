/**
 * Intro script.
 *
 * Final text. Voice: the Loomkeeper is a tired colleague, not a god. Short
 * sentences, no ceremony, no explanation of who he is beyond what the job needs.
 * See `design/character_design.md` §3.3 for the full character brief.
 *
 * Structural contract (checked by `tests/dialogue/dialogue.unit.ts`):
 *   - at least one line
 *   - exactly one line carries `turnPlayerToLoomkeeper`, on the line where the
 *     player first sees who has been speaking
 */

import type { DialogueLine } from '../types.js';

export const INTRO_LINES: readonly DialogueLine[] = [
  {
    speaker: 'narrator',
    text: '地面斷在不遠處。不是崩塌，是還沒長出來。',
    pauseAfter: 1.2,
  },
  {
    speaker: 'player',
    text: '這裡是什麼地方？',
    pauseAfter: 0.8,
  },
  {
    speaker: 'unknown',
    text: '差一格。',
    pauseAfter: 0.8,
  },
  {
    speaker: 'player',
    text: '……誰在說話？',
    pauseAfter: 0.8,
    // The reveal beat: the player turns towards the speaker here. This is the only
    // cue in the script — see the note at the top of the file.
    cue: 'turnPlayerToLoomkeeper',
  },
  {
    speaker: 'loomkeeper',
    text: '你是"玩家"對吧? 吾乃織界者──世界的編織者。',
    pauseAfter: 0.9,
  },
  {
    speaker: 'loomkeeper',
    text: '不過你來得有點早。不過既然來了，幫我編完最後一個區塊吧。',
    pauseAfter: 0.9,
  },
  {
    speaker: 'loomkeeper',
    text: '按 B 開啟建造模式以放置/破壞方塊。想放什麼就放什麼，放好了按 Ctrl+Enter 遞交。',
    pauseAfter: 1.4,
  },
];