/**
 * Script registry.
 *
 * Callers ask for a script by id rather than importing the array, so adding a
 * conversation is one entry here and one content file — no call site changes.
 */

import type { DialogueCue, DialogueScript, DialogueScriptId } from '../types.js';

import { INTRO_LINES } from './intro.js';
import { SUBMIT_BLANK_LINES, SUBMIT_LINES } from './submit.js';

/** Every shipped conversation, keyed by id. */
export const DIALOGUE_SCRIPTS: Readonly<Record<DialogueScriptId, DialogueScript>> = {
  intro: { id: 'intro', lines: INTRO_LINES },
  submit: { id: 'submit', lines: SUBMIT_LINES },
  submitBlank: { id: 'submitBlank', lines: SUBMIT_BLANK_LINES },
};

/** Looks up a script, throwing on an unknown id so a typo fails loudly. */
export function getDialogueScript(id: DialogueScriptId): DialogueScript {
  const script = DIALOGUE_SCRIPTS[id];
  if (!script) {
    throw new Error(`getDialogueScript: unknown script id "${id}"`);
  }
  return script;
}

/** The lines of a script. */
export function dialogueLines(id: DialogueScriptId) {
  return getDialogueScript(id).lines;
}

/**
 * Index of the first line carrying `cue`, or -1.
 *
 * Used by the game mode to drive staged beats without hard-coding a line number,
 * so rewriting the script does not move the beat.
 */
export function findCueIndex(id: DialogueScriptId, cue: DialogueCue): number {
  return dialogueLines(id).findIndex(line => line.cue === cue);
}