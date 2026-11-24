/**
 * Game flow orchestration.
 *
 * The individual systems (world generation, build controller, dialogue,
 * transitions) are all independently testable, but the assignment also needs the
 * *sequence* to be correct: spawn on the start point, enter build mode, place a
 * block, submit, play the ending.
 *
 * This module owns that sequence as an explicit state machine. Keeping it here
 * rather than inside `MyGameMode` means the flow can be driven from a test
 * without a renderer, and `MyGameMode` stays a thin adapter.
 */

import { evaluateSubmit } from '../build/submitCheck.js';
import { inputLock } from '../cinematic/InputLock.js';
import { endingSequence, introSequence, TransitionRunner } from '../cinematic/TransitionSequence.js';

/** High-level phases of the game. */
export type GamePhase =
  | 'boot'
  | 'intro'
  | 'explore'
  | 'building'
  | 'submitting'
  | 'ending'
  | 'ended';

/** Events that move the flow between phases. */
export type GameEvent =
  | 'worldReady'
  | 'introFinished'
  | 'enterBuild'
  | 'exitBuild'
  | 'submit'
  | 'submitAccepted'
  | 'submitRejected'
  | 'endingFinished';

/** Result of applying an event. */
export interface FlowTransition {
  readonly from: GamePhase;
  readonly to: GamePhase;
  readonly accepted: boolean;
}

/** Legal transitions. Anything not listed is rejected. */
const TRANSITIONS: Readonly<Record<GamePhase, Partial<Record<GameEvent, GamePhase>>>> = {
  boot: { worldReady: 'intro' },
  intro: { introFinished: 'explore' },
  explore: { enterBuild: 'building', submit: 'submitting' },
  building: { exitBuild: 'explore', submit: 'submitting' },
  submitting: { submitAccepted: 'ending', submitRejected: 'building' },
  ending: { endingFinished: 'ended' },
  ended: {},
};

/** True when `event` is legal in `phase`. */
export function canTransition(phase: GamePhase, event: GameEvent): boolean {
  return TRANSITIONS[phase][event] !== undefined;
}

/** The phase `event` leads to, or `null` when the event is illegal. */
export function nextPhase(phase: GamePhase, event: GameEvent): GamePhase | null {
  return TRANSITIONS[phase][event] ?? null;
}

/** Every event legal in `phase`. */
export function legalEvents(phase: GamePhase): GameEvent[] {
  return Object.keys(TRANSITIONS[phase]) as GameEvent[];
}

/**
 * Drives the phase machine and the transition timelines.
 *
 * The runner for the active cinematic is created on entry and ticked by
 * `update()`, so the caller only has to forward the frame delta.
 */
export class GameFlow {
  private phase: GamePhase = 'boot';
  private runner: TransitionRunner | null = null;
  private placedBlockCount = 0;

  /** Current phase. */
  public get currentPhase(): GamePhase {
    return this.phase;
  }

  /** The active cinematic runner, or `null` outside a cinematic. */
  public get activeRunner(): TransitionRunner | null {
    return this.runner;
  }

  /** True while a cinematic is playing. */
  public get isCinematic(): boolean {
    return this.runner !== null;
  }

  /** True when the player may act. */
  public get canAct(): boolean {
    return this.phase === 'explore' || this.phase === 'building';
  }

  /** Records how many blocks the player has placed. */
  public setPlacedBlockCount(count: number): void {
    this.placedBlockCount = Math.max(0, count);
  }

  /** Number of blocks placed so far. */
  public getPlacedBlockCount(): number {
    return this.placedBlockCount;
  }

  /**
   * Applies an event.
   *
   * `submit` is special-cased: it is routed through `evaluateSubmit()` so an
   * empty design is rejected and the player stays in build mode.
   */
  public dispatch(event: GameEvent): FlowTransition {
    const from = this.phase;

    if (event === 'submit') {
      const outcome = evaluateSubmit(this.placedBlockCount);
          const accepted = outcome === 'normal';
      const to: GamePhase = accepted ? 'ending' : 'building';
      this.phase = to;
      if (accepted) {
        this.startEnding();
      }
      return { from, to, accepted };
    }

    const to = nextPhase(from, event);
    if (!to) {
      return { from, to: from, accepted: false };
    }

    this.phase = to;
    this.onEnterPhase(to);
    return { from, to, accepted: true };
  }

  /** Advances the active cinematic. */
  public update(deltaSeconds: number): void {
    if (!this.runner) {
      return;
    }

    this.runner.update(deltaSeconds);
    if (!this.runner.isFinished) {
      return;
    }

    const finishedId = this.runner.getSequence().id;
    this.runner = null;

    if (finishedId === 'intro') {
      this.dispatch('introFinished');
    } else if (finishedId === 'ending') {
      this.dispatch('endingFinished');
    }
  }

  /** Starts the intro cinematic. */
  public startIntro(): void {
    this.runner = new TransitionRunner(introSequence());
    inputLock.acquire('intro');
  }

  /** Starts the ending cinematic. */
  public startEnding(): void {
    this.runner = new TransitionRunner(endingSequence());
    inputLock.acquire('ending');
  }

  /** Runs the side effects of entering a phase. */
  private onEnterPhase(phase: GamePhase): void {
    switch (phase) {
      case 'intro':
        this.startIntro();
        break;
      case 'explore':
        inputLock.releaseAll('intro');
        inputLock.releaseAll('dialogue');
        break;
      case 'building':
        inputLock.releaseAll('dialogue');
        break;
      case 'ended':
        inputLock.releaseAll('ending');
        break;
      default:
        break;
    }
  }
}