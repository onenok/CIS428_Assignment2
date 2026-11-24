/**
 * Input log — a ring buffer of everything the input layer saw.
 *
 * `InputTrace` keeps the last 8 actions, which is enough for a live overlay but
 * useless for "I pressed Space, then Ctrl, then nothing happened". This keeps the
 * last few thousand events with timestamps so a sequence can be replayed by eye.
 *
 * Entries are serialised as JSON lines (one object per line) rather than a JSON
 * array: a truncated file still parses line by line, and `grep` works on it.
 *
 * Pure data, no DOM, no engine types.
 */

/** What kind of event was recorded. */
export type InputEventKind =
  | 'keyDown'
  | 'keyUp'
  | 'mouseDown'
  | 'mouseUp'
  | 'action'
  /** A voxel edit (place / break / undo / redo), logged so a render report can be
   *  matched against the frames that were actually edited. */
    | 'edit'
    /** An edit the game refused, e.g. clicking bedrock. Nothing changed, so it is
     *  not an `edit`; it is logged so "I clicked and nothing happened" has a
     *  timestamp to look at. */
    | 'blocked';

/** One recorded event. */
export interface InputLogEntry {
  /** Milliseconds since the recorder was created. */
  readonly t: number;
  readonly kind: InputEventKind;
  /** Key code, mouse button name, or action name depending on `kind`. */
  readonly name: string;
}

/** Default ring size: ~2000 events is several minutes of play. */
export const DEFAULT_INPUT_LOG_CAPACITY = 2000;

export class InputLog {
  private readonly entries: InputLogEntry[] = [];

  public constructor(private readonly capacity: number = DEFAULT_INPUT_LOG_CAPACITY) {}

  /** Appends one event, dropping the oldest once the buffer is full. */
  public record(kind: InputEventKind, name: string, nowMs: number): InputLogEntry {
    const entry: InputLogEntry = { t: Math.round(nowMs), kind, name };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
    return entry;
  }

  /** Every retained event, oldest first. */
  public get all(): readonly InputLogEntry[] {
    return this.entries;
  }

  public get size(): number {
    return this.entries.length;
  }

  /** Serialises the buffer as JSON lines. */
  public toJsonl(): string {
    return this.entries.map(entry => JSON.stringify(entry)).join('\n');
  }

  public clear(): void {
    this.entries.length = 0;
  }
}

  /**
   * The process-wide buffer the controller writes to and the F4 dump reads from.
   *
   * A module-level singleton rather than a dependency: the controller is created by
   * an engine factory and has no constructor injection point, and this is a debug
   * sink — nothing in the gameplay path may depend on it.
   */
  export const runtimeInputLog = new InputLog();