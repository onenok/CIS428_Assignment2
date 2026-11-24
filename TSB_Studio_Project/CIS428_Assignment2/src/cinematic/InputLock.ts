/**
 * Input lock.
 *
 * During a cinematic the player must not move, build or open panels. The engine
 * has no single "disable all input" switch that also covers gameplay handlers,
 * so this module owns a small reference-counted lock that gameplay code checks
 * before acting.
 *
 * Reference counting matters because the intro, the dialogue and the ending can
 * overlap; a plain boolean would let the first one to finish unlock input while
 * another is still running.
 */

/** Reasons input can be locked. Useful for debugging and for the HUD. */
export type InputLockReason = 'intro' | 'dialogue' | 'ending' | 'menu';

export class InputLock {
  private readonly holders = new Map<InputLockReason, number>();

  /** Takes the lock for `reason`. Nested calls are counted. */
  public acquire(reason: InputLockReason): void {
    this.holders.set(reason, (this.holders.get(reason) ?? 0) + 1);
  }

  /** Releases one hold for `reason`. Extra releases are ignored. */
  public release(reason: InputLockReason): void {
    const count = this.holders.get(reason) ?? 0;
    if (count <= 1) {
      this.holders.delete(reason);
      return;
    }
    this.holders.set(reason, count - 1);
  }

  /** Releases every hold for `reason`, regardless of count. */
  public releaseAll(reason: InputLockReason): void {
    this.holders.delete(reason);
  }

  /** Drops every lock. Used when a scene is torn down. */
  public clear(): void {
    this.holders.clear();
  }

  /** True while any reason holds the lock. */
  public get isLocked(): boolean {
    return this.holders.size > 0;
  }

  /** True when input is allowed. */
  public get isUnlocked(): boolean {
    return !this.isLocked;
  }

  /** Every reason currently holding the lock. */
  public activeReasons(): InputLockReason[] {
    return [...this.holders.keys()];
  }

  /** Hold count for one reason. */
  public countFor(reason: InputLockReason): number {
    return this.holders.get(reason) ?? 0;
  }
}

/** Shared lock instance. Gameplay code reads `inputLock.isUnlocked`. */
export const inputLock = new InputLock();