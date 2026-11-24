/**
 * Cinematic transition timeline.
 *
 * The intro and the ending are both "a list of timed steps that lock the player
 * out while they play". Rather than two bespoke implementations, both are
 * expressed as a `TransitionSequence`: an ordered list of steps, each with a
 * duration and an `onEnter` hook.
 *
 * The runner is pure: it advances by elapsed seconds and reports which step is
 * active. The UI layer reads `currentStep()` each frame and applies the visuals.
 * That keeps the whole timeline testable without a renderer or a DOM.
 */

/** One timed step in a transition. */
export interface TransitionStep {
  /** Stable id, used by the UI layer to pick the visual treatment. */
  readonly id: string;
  /** How long the step lasts, in seconds. */
  readonly duration: number;
  /** Called once when the step becomes active. */
  readonly onEnter?: () => void;
}

/** A named, ordered sequence of steps. */
export interface TransitionSequence {
  readonly id: string;
  readonly steps: readonly TransitionStep[];
}

/** Total duration of a sequence, in seconds. */
export function sequenceDuration(sequence: TransitionSequence): number {
  return sequence.steps.reduce((sum, step) => sum + step.duration, 0);
}

/** Ids of every step, in order. */
export function sequenceStepIds(sequence: TransitionSequence): string[] {
  return sequence.steps.map((step) => step.id);
}

/**
 * Plays a sequence.
 *
 * `update()` advances the clock and fires `onEnter` exactly once per step, so a
 * step can safely start an animation or a sound.
 */
export class TransitionRunner {
  private readonly sequence: TransitionSequence;
  private index = 0;
  private elapsed = 0;
  private finished = false;
  private entered = new Set<number>();

  public constructor(sequence: TransitionSequence) {
    this.sequence = sequence;
    this.enterStep(0);
  }

  /** The sequence being played. */
  public getSequence(): TransitionSequence {
    return this.sequence;
  }

  /** Index of the active step. */
  public get stepIndex(): number {
    return this.index;
  }

  /** The active step, or `null` when finished. */
  public currentStep(): TransitionStep | null {
    if (this.finished) {
      return null;
    }
    return this.sequence.steps[this.index] ?? null;
  }

  /** Seconds elapsed inside the active step. */
  public get stepElapsed(): number {
    return this.elapsed;
  }

  /** Progress through the active step, in `[0, 1]`. */
  public get stepProgress(): number {
    const step = this.currentStep();
    if (!step || step.duration <= 0) {
      return 1;
    }
    return Math.min(1, this.elapsed / step.duration);
  }

  /** True once every step has played. */
  public get isFinished(): boolean {
    return this.finished;
  }

  /** Advances the timeline by `deltaSeconds`. */
  public update(deltaSeconds: number): void {
    if (this.finished || deltaSeconds <= 0) {
      return;
    }

    this.elapsed += deltaSeconds;

    // A single large delta may cross several short steps; loop so none are skipped.
    let guard = 0;
    while (!this.finished && guard < 1000) {
      const step = this.currentStep();
      if (!step) {
        break;
      }
      if (this.elapsed < step.duration) {
        break;
      }
      this.elapsed -= step.duration;
      this.advance();
      guard += 1;
    }
  }

  /** Jumps straight to the end. */
  public skipToEnd(): void {
    this.finished = true;
    this.index = this.sequence.steps.length;
    this.elapsed = 0;
  }

  /** Moves to the next step and fires its `onEnter`. */
  private advance(): void {
    const next = this.index + 1;
    if (next >= this.sequence.steps.length) {
      this.finished = true;
      this.index = this.sequence.steps.length;
      this.elapsed = 0;
      return;
    }
    this.index = next;
    this.enterStep(next);
  }

  /** Fires `onEnter` for a step, at most once. */
  private enterStep(index: number): void {
    if (this.entered.has(index)) {
      return;
    }
    this.entered.add(index);
    this.sequence.steps[index]?.onEnter?.();
  }
}

/** Opacity of the black overlay at a given progress through a fade. */
export function fadeOpacity(progress: number, from = 1, to = 0): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return from + (to - from) * clamped;
}

/** Eyelid coverage: 0 = fully open, 1 = fully closed. */
export function eyelidCoverage(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  // Close fast, open slow: a sine ease reads more like a blink than a linear ramp.
  return Math.sin(clamped * Math.PI);
}

/** Blur radius in pixels for a given progress through the blur step. */
export function blurRadius(progress: number, maxRadius = 12): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped * maxRadius;
}

/** Builds the intro sequence: black screen, fade in, blink, then control. */
export function introSequence(): TransitionSequence {
  return {
    id: 'intro',
    steps: [
      { id: 'black', duration: 0.6 },
      { id: 'fadeIn', duration: 1.2 },
      { id: 'blink', duration: 0.45 },
      { id: 'blur', duration: 0.5 },
      { id: 'unlock', duration: 0.25 },
    ],
  };
}

/** Builds the ending sequence: turn, white scroll, fade out. */
export function endingSequence(): TransitionSequence {
  return {
    id: 'ending',
    steps: [
      { id: 'turnPlayer', duration: 0.8 },
      { id: 'turnLoomkeeper', duration: 0.8 },
      { id: 'scrollLine', duration: 2.0 },
      { id: 'scrollSpawn', duration: 1.6 },
      { id: 'fadeOut', duration: 1.4 },
      { id: 'endCard', duration: 0 },
    ],
  };
}