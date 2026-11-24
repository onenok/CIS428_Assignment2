/**
 * Typewriter timing maths.
 *
 * Every function here is pure and takes `elapsed` seconds, so the reveal can be
 * tested without a timer, a DOM, or the engine.
 */

import { DEFAULT_LINE_PAUSE, TYPEWRITER_CHARS_PER_SECOND } from '../constants.js';
import type { DialogueLine } from '../types.js';

/**
 * How many characters of `line` are visible after `elapsed` seconds.
 *
 * Clamped to `[0, line.length]` so callers never need to guard the result.
 */
export function visibleCharacters(
  line: string,
  elapsed: number,
  charsPerSecond = TYPEWRITER_CHARS_PER_SECOND,
): number {
  if (elapsed <= 0) {
    return 0;
  }
  const revealed = Math.floor(elapsed * charsPerSecond);
  return Math.max(0, Math.min(line.length, revealed));
}

/** The portion of `line` visible after `elapsed` seconds. */
export function visibleText(
  line: string,
  elapsed: number,
  charsPerSecond = TYPEWRITER_CHARS_PER_SECOND,
): string {
  return line.slice(0, visibleCharacters(line, elapsed, charsPerSecond));
}

/**
 * True once the whole line has been revealed.
 *
 * Compares against {@link lineDuration} rather than the floored character count:
 * `elapsed * charsPerSecond` can land a hair below `line.length` through
 * floating-point error, which would make a fully-revealed line report as still
 * typing and trap the player on it forever.
 */
export function isLineComplete(
  line: string,
  elapsed: number,
  charsPerSecond = TYPEWRITER_CHARS_PER_SECOND,
): boolean {
  return elapsed >= lineDuration(line, charsPerSecond);
}

/** Seconds needed to fully reveal `line`. */
export function lineDuration(
  line: string,
  charsPerSecond = TYPEWRITER_CHARS_PER_SECOND,
): number {
  return line.length / charsPerSecond;
}

/**
 * Total seconds a line occupies, including its trailing pause.
 *
 * Used to advance the dialogue automatically when the player does not skip.
 */
export function lineTotalDuration(
  line: DialogueLine,
  charsPerSecond = TYPEWRITER_CHARS_PER_SECOND,
): number {
  return lineDuration(line.text, charsPerSecond) + (line.pauseAfter ?? DEFAULT_LINE_PAUSE);
}

/** Total number of characters across every line. */
export function totalCharacters(lines: readonly DialogueLine[]): number {
  return lines.reduce((sum, line) => sum + line.text.length, 0);
}