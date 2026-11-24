import { describe, it } from '../../scripts/verify/harness.js';
import { assertEqual, assertFalse, assertTrue } from '../../scripts/verify/assert.js';
import { SPEAKER_NAMES } from '../../src/dialogue/types.js';
import { TYPEWRITER_CHARS_PER_SECOND } from '../../src/dialogue/constants.js';
import {
  isLineComplete,
  lineDuration,
  lineTotalDuration,
  totalCharacters,
  visibleCharacters,
  visibleText,
} from '../../src/dialogue/text/timing.js';
import { DialogueRunner } from '../../src/dialogue/DialogueRunner.js';
import { INTRO_LINES } from '../../src/dialogue/scripts/intro.js';
import {
  DIALOGUE_SCRIPTS,
  dialogueLines,
  findCueIndex,
  getDialogueScript,
} from '../../src/dialogue/scripts/index.js';

describe('DialogueLine / typewriter maths', () => {
  it('reveals nothing at time zero', () => {
    assertEqual(visibleCharacters('hello', 0), 0);
  });

  it('reveals characters at the configured rate', () => {
    const elapsed = 10 / TYPEWRITER_CHARS_PER_SECOND;
    assertEqual(visibleCharacters('hello world', elapsed), 10);
  });

  it('never reveals more than the line length', () => {
    assertEqual(visibleCharacters('hi', 100), 2);
  });

  it('never reveals a negative count', () => {
    assertEqual(visibleCharacters('hi', -5), 0);
  });

  it('slices the visible text', () => {
    const elapsed = 5 / TYPEWRITER_CHARS_PER_SECOND;
    assertEqual(visibleText('abcdefgh', elapsed), 'abcde');
  });

  it('reports completion once the whole line is shown', () => {
    assertEqual(isLineComplete('abc', 1), true);
    assertEqual(isLineComplete('abc', 0), false);
  });

  it('computes the duration from the length and rate', () => {
    assertEqual(lineDuration('abcd'), 4 / TYPEWRITER_CHARS_PER_SECOND);
  });

  it('adds the trailing pause to the total duration', () => {
    const line = { speaker: 'narrator' as const, text: 'abcd', pauseAfter: 2 };
    assertEqual(lineTotalDuration(line), 4 / TYPEWRITER_CHARS_PER_SECOND + 2);
  });
}, 'unit');

describe('dialogue scripts / structure', () => {
  // The 14 legacy lines were discarded: they came from an older draft. These
  // assertions deliberately check shape and wiring, NOT wording, so replacing the
  // content does not break the suite.
  const ids = Object.keys(DIALOGUE_SCRIPTS) as (keyof typeof DIALOGUE_SCRIPTS)[];

  it('registers every script with a matching id', () => {
    for (const id of ids) {
      assertEqual(DIALOGUE_SCRIPTS[id].id, id);
    }
  });

  it('gives every line a known speaker', () => {
    for (const id of ids) {
      for (const line of dialogueLines(id)) {
        assertTrue(line.speaker in SPEAKER_NAMES, `unknown speaker ${line.speaker} in ${id}`);
      }
    }
  });

  it('gives every line non-empty text', () => {
    for (const id of ids) {
      for (const line of dialogueLines(id)) {
        assertTrue(line.text.trim().length > 0, `empty line in ${id}`);
      }
    }
  });

  it('has at least one line in every script', () => {
    for (const id of ids) {
      assertTrue(dialogueLines(id).length > 0, `${id} is empty`);
    }
  });

  it('throws on an unknown script id', () => {
    let threw = false;
    try {
      getDialogueScript('nope' as never);
    } catch {
      threw = true;
    }
    assertTrue(threw, 'an unknown id should fail loudly rather than return undefined');
  });

  it('marks exactly one intro line with the turn cue', () => {
    const withCue = dialogueLines('intro').filter(line => line.cue === 'turnPlayerToLoomkeeper');
    assertEqual(withCue.length, 1, 'the beat must be unambiguous');
  });

  it('finds the turn cue by name, not by line number', () => {
    const index = findCueIndex('intro', 'turnPlayerToLoomkeeper');
    assertTrue(index >= 0);
    assertEqual(dialogueLines('intro')[index].cue, 'turnPlayerToLoomkeeper');
  });

  it('reports -1 when a script carries no such cue', () => {
      // Only the intro owns the turn beat. The submit scripts play over the ending,
      // whose own sequence already turns the actors; a cue there would fight it.
      for (const id of ids.filter(scriptId => scriptId !== 'intro')) {
        assertEqual(findCueIndex(id, 'turnPlayerToLoomkeeper'), -1, `${id} must not turn the player`);
      }
  });

  it('counts every character', () => {
    for (const id of ids) {
      const lines = dialogueLines(id);
      const expected = lines.reduce((sum, line) => sum + line.text.length, 0);
      assertEqual(totalCharacters(lines), expected);
    }
  });

  it('keeps the accepted speaker id set', () => {
    // These ids are referenced by name in MyGameMode and the UI, so they are part
    // of the contract even while the wording is not.
    assertEqual(SPEAKER_NAMES.unknown, '???');
    assertTrue('loomkeeper' in SPEAKER_NAMES);
    assertTrue('player' in SPEAKER_NAMES);
    assertTrue('narrator' in SPEAKER_NAMES);
  });
}, 'unit');

describe('DialogueRunner / playback', () => {
  it('starts on the first line', () => {
    const runner = new DialogueRunner(INTRO_LINES);
    assertEqual(runner.lineIndex, 0);
    assertEqual(runner.isFinished, false);
  });

  it('reveals text as time passes', () => {
    const runner = new DialogueRunner(INTRO_LINES);
    runner.update(0.1);
    assertTrue(runner.visibleText().length > 0);
  });

  it('skip reveals the rest of a typing line', () => {
    const runner = new DialogueRunner(INTRO_LINES);
    runner.update(0.01);

    assertEqual(runner.skip(), 'revealed');
    assertEqual(runner.lineIndex, 0);
    assertEqual(runner.isCurrentLineComplete(), true);
  });

  it('skip advances once the line is complete', () => {
    const runner = new DialogueRunner(INTRO_LINES);
    runner.update(100);

    assertEqual(runner.skip(), 'advanced');
    assertEqual(runner.lineIndex, 1);
  });

  it('finishes after the last line', () => {
    const runner = new DialogueRunner(INTRO_LINES);
    for (let i = 0; i < INTRO_LINES.length; i++) {
      runner.update(100);
      runner.skip();
    }

    assertEqual(runner.isFinished, true);
    assertEqual(runner.currentLine(), null);
  });

  it('skip on a finished runner stays finished', () => {
    const runner = new DialogueRunner(INTRO_LINES);
    for (let i = 0; i < INTRO_LINES.length; i++) {
      runner.update(100);
      runner.skip();
    }

    assertEqual(runner.skip(), 'finished');
  });

  it('autoAdvance waits for the pause', () => {
    const runner = new DialogueRunner(INTRO_LINES);
    const first = INTRO_LINES[0];
    const total = lineTotalDuration(first);

    runner.update(total - 0.1);
    assertEqual(runner.autoAdvance(), false);

    runner.update(0.2);
    assertEqual(runner.autoAdvance(), true);
    assertEqual(runner.lineIndex, 1);
  });

  it('reset returns to the first line', () => {
    const runner = new DialogueRunner(INTRO_LINES);
    runner.update(100);
    runner.skip();
    runner.reset();

    assertEqual(runner.lineIndex, 0);
    assertEqual(runner.isFinished, false);
    assertEqual(runner.visibleText(), '');
  });

    it('plays the whole intro to the end when advanced', () => {
      const runner = new DialogueRunner(INTRO_LINES);

      // Each line needs one press to finish typing and one to move on; the last
      // line only needs the first, because moving on is what finishes the run.
      const presses = INTRO_LINES.length * 2;
      for (let i = 0; i < presses && !runner.isFinished; i++) {
        runner.skip();
      }

      assertTrue(runner.isFinished, 'the intro must finish once every line is advanced');
    });

    it('does not advance on its own', () => {
      const runner = new DialogueRunner(INTRO_LINES);
      const total = INTRO_LINES.reduce((sum, line) => sum + lineTotalDuration(line), 0);

      runner.update(total + 10);

      assertEqual(runner.lineIndex, 0, 'the intro waits for the player');
      assertEqual(runner.isFinished, false);
    });

  it('handles an empty conversation', () => {
    const runner = new DialogueRunner([]);
    assertEqual(runner.currentLine(), null);
    assertEqual(runner.skip(), 'finished');
  });
}, 'unit');
