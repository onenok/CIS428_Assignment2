/**
 * Dialogue playback state machine.
 *
 * Kept free of DOM and timers so the whole flow can be tested by feeding it
 * elapsed time. The UI layer reads `currentLine()` / `visibleText()` each frame
 * and calls `advance()` when the player presses the skip key.
 *
 * Two behaviours matter and are easy to get wrong:
 *
 *   - pressing skip while a line is still typing reveals the rest of that line
 *     instead of jumping to the next one (Minecraft/Undertale convention)
 *   - the last line does not auto-advance past the end; it reports `finished`
 */

import {
  DEFAULT_LINE_PAUSE,
  TYPEWRITER_CHARS_PER_SECOND,
} from './constants.js';
import {
  isLineComplete,
  lineDuration,
  visibleText,
} from './text/timing.js';

import type { DialogueLine } from './types.js';

/** What a skip press did. */
export type SkipResult = 'revealed' | 'advanced' | 'finished';

export class DialogueRunner {
  private readonly lines: readonly DialogueLine[];
  private readonly charsPerSecond: number;
  private index = 0;
  private elapsed = 0;
  private finished = false;

  public constructor(lines: readonly DialogueLine[], charsPerSecond = TYPEWRITER_CHARS_PER_SECOND) {
    this.lines = lines;
    this.charsPerSecond = charsPerSecond;
  }

  /** Index of the line being shown. */
  public get lineIndex(): number {
    return this.index;
  }

  /** Number of lines in the conversation. */
  public get lineCount(): number {
    return this.lines.length;
  }

  /** True once the last line has been dismissed. */
  public get isFinished(): boolean {
    return this.finished;
  }

  /** The line currently being shown, or `null` when finished or empty. */
  public currentLine(): DialogueLine | null {
    if (this.finished) {
      return null;
    }
    return this.lines[this.index] ?? null;
  }

  /** Seconds elapsed on the current line. */
  public get lineElapsed(): number {
    return this.elapsed;
  }

  /** The portion of the current line that should be on screen. */
  public visibleText(): string {
    const line = this.currentLine();
    if (!line) {
      return '';
    }
    return visibleText(line.text, this.elapsed, this.charsPerSecond);
  }

  /** True when the current line has finished typing. */
  public isCurrentLineComplete(): boolean {
    const line = this.currentLine();
    if (!line) {
      return true;
    }
    return isLineComplete(line.text, this.elapsed, this.charsPerSecond);
  }

  /** Advances the typewriter by `deltaSeconds`. */
  public update(deltaSeconds: number): void {
    if (this.finished || deltaSeconds <= 0) {
      return;
    }
    this.elapsed += deltaSeconds;
  }

  /**
   * Handles a skip press.
   *
   * Reveals the rest of the current line if it is still typing, otherwise moves
   * to the next line. On the last line it finishes the conversation.
   */
  public skip(): SkipResult {
    if (this.finished) {
      return 'finished';
    }

    const line = this.currentLine();
    if (!line) {
      this.finished = true;
      return 'finished';
    }

    if (!this.isCurrentLineComplete()) {
      this.elapsed = lineDuration(line.text, this.charsPerSecond);
      return 'revealed';
    }

    return this.next();
  }

  /** Moves to the next line, or finishes when there is none. */
  public next(): SkipResult {
    if (this.index + 1 >= this.lines.length) {
      this.finished = true;
      return 'finished';
    }
    this.index += 1;
    this.elapsed = 0;
    return 'advanced';
  }

  /**
   * Auto-advances when the current line has been fully shown for its pause.
   *
   * Call once per frame after {@link update}. Returns true when the line changed.
   */
  public autoAdvance(): boolean {
    if (this.finished) {
      return false;
    }

    const line = this.currentLine();
    if (!line) {
      this.finished = true;
      return false;
    }

    const pause = line.pauseAfter ?? DEFAULT_LINE_PAUSE;
    const total = lineDuration(line.text, this.charsPerSecond) + pause;
    if (this.elapsed < total) {
      return false;
    }

    this.next();
    return true;
  }

  /** Restarts the conversation from the first line. */
  public reset(): void {
    this.index = 0;
    this.elapsed = 0;
    this.finished = false;
  }
}