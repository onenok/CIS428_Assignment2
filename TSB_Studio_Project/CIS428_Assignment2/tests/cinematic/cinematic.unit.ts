import { describe, it } from '../../scripts/verify/harness.js';
import { assertClose, assertDeepEqual, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import {
  TransitionRunner,
  blurRadius,
  endingSequence,
  eyelidCoverage,
  fadeOpacity,
  introSequence,
  sequenceDuration,
  sequenceStepIds,
} from '../../src/cinematic/TransitionSequence.js';
import { InputLock } from '../../src/cinematic/InputLock.js';
import {
  SCROLL_DISTANCE,
  SCROLL_ELEVATION,
  scrollOffset,
  scrollState,
  shortestAngleDelta,
  turnTowards,
  yawTowards,
} from '../../src/cinematic/ScrollSpawn.js';

describe('TransitionSequence / intro', () => {
  it('starts with a black screen and ends unlocked', () => {
    const ids = sequenceStepIds(introSequence());
    assertEqual(ids[0], 'black');
    assertEqual(ids[ids.length - 1], 'unlock');
  });

  it('has a positive total duration', () => {
    assertTrue(sequenceDuration(introSequence()) > 0);
  });

  it('covers fade, blink and blur', () => {
    const ids = sequenceStepIds(introSequence());
    assertTrue(ids.includes('fadeIn'));
    assertTrue(ids.includes('blink'));
    assertTrue(ids.includes('blur'));
  });
}, 'unit');

describe('TransitionSequence / ending', () => {
  it('turns both actors before the scroll appears', () => {
    const ids = sequenceStepIds(endingSequence());
    assertTrue(ids.indexOf('turnPlayer') < ids.indexOf('scrollLine'));
    assertTrue(ids.indexOf('turnLoomkeeper') < ids.indexOf('scrollLine'));
  });

  it('ends on the end card', () => {
    const ids = sequenceStepIds(endingSequence());
    assertEqual(ids[ids.length - 1], 'endCard');
  });

  it('fades out before the end card', () => {
    const ids = sequenceStepIds(endingSequence());
    assertTrue(ids.indexOf('fadeOut') < ids.indexOf('endCard'));
  });

  it('cannot drive the end card from its own step', () => {
    // The `endCard` step has a duration of 0, so the runner enters it and finishes
    // the sequence inside the same `update()` call. Anything that reads
    // `currentStep()` afterwards sees `null`, which is why the card is shown from the
    // `ended` phase instead. This test exists so nobody re-points the card back at
    // the step without noticing.
    const runner = new TransitionRunner(endingSequence());
    runner.update(sequenceDuration(endingSequence()));

    assertTrue(runner.isFinished, 'the sequence finishes on the zero-length step');
    assertEqual(runner.currentStep(), null);
  });
}, 'unit');

describe('TransitionRunner / playback', () => {
  it('starts on the first step', () => {
    const runner = new TransitionRunner(introSequence());
    assertEqual(runner.stepIndex, 0);
    assertEqual(runner.currentStep()?.id, 'black');
  });

  it('advances when a step elapses', () => {
    const runner = new TransitionRunner(introSequence());
    const first = runner.currentStep()!;

    runner.update(first.duration + 0.01);
    assertEqual(runner.stepIndex, 1);
  });

  it('crosses several short steps in one large delta', () => {
    const runner = new TransitionRunner(introSequence());
    runner.update(sequenceDuration(introSequence()) + 1);

    assertEqual(runner.isFinished, true);
    assertEqual(runner.currentStep(), null);
  });

  it('fires onEnter exactly once per step', () => {
    const calls: string[] = [];
    const runner = new TransitionRunner({
      id: 'test',
      steps: [
        { id: 'a', duration: 0.1, onEnter: () => calls.push('a') },
        { id: 'b', duration: 0.1, onEnter: () => calls.push('b') },
      ],
    });

    runner.update(0.05);
    runner.update(0.05);
    runner.update(0.05);
    runner.update(0.05);

    assertDeepEqual(calls, ['a', 'b']);
  });

  it('reports progress inside the active step', () => {
    const runner = new TransitionRunner({
      id: 'test',
      steps: [{ id: 'a', duration: 2 }],
    });

    runner.update(1);
    assertClose(runner.stepProgress, 0.5, 1e-6);
  });

  it('skipToEnd finishes immediately', () => {
    const runner = new TransitionRunner(introSequence());
    runner.skipToEnd();

    assertEqual(runner.isFinished, true);
    assertEqual(runner.currentStep(), null);
  });

  it('ignores a non-positive delta', () => {
    const runner = new TransitionRunner(introSequence());
    runner.update(0);
    runner.update(-1);

    assertEqual(runner.stepIndex, 0);
  });
}, 'unit');

describe('TransitionSequence / easing helpers', () => {
  it('fades from opaque to transparent', () => {
    assertClose(fadeOpacity(0), 1, 1e-6);
    assertClose(fadeOpacity(1), 0, 1e-6);
    assertClose(fadeOpacity(0.5), 0.5, 1e-6);
  });

  it('clamps fade progress', () => {
    assertClose(fadeOpacity(-1), 1, 1e-6);
    assertClose(fadeOpacity(2), 0, 1e-6);
  });

  it('opens and closes the eyelid', () => {
    assertClose(eyelidCoverage(0), 0, 1e-6);
    assertClose(eyelidCoverage(0.5), 1, 1e-6);
    assertClose(eyelidCoverage(1), 0, 1e-6);
  });

  it('ramps the blur radius', () => {
    assertClose(blurRadius(0), 0, 1e-6);
    assertClose(blurRadius(1, 12), 12, 1e-6);
    assertClose(blurRadius(0.5, 12), 6, 1e-6);
  });
}, 'unit');

describe('InputLock / reference counting', () => {
  it('starts unlocked', () => {
    const lock = new InputLock();
    assertEqual(lock.isUnlocked, true);
  });

  it('locks on acquire', () => {
    const lock = new InputLock();
    lock.acquire('intro');
    assertEqual(lock.isLocked, true);
  });

  it('stays locked while another reason holds it', () => {
    const lock = new InputLock();
    lock.acquire('intro');
    lock.acquire('dialogue');
    lock.release('intro');

    assertEqual(lock.isLocked, true);
    assertDeepEqual(lock.activeReasons(), ['dialogue']);
  });

  it('counts nested acquires for the same reason', () => {
    const lock = new InputLock();
    lock.acquire('dialogue');
    lock.acquire('dialogue');
    lock.release('dialogue');

    assertEqual(lock.countFor('dialogue'), 1);
    assertEqual(lock.isLocked, true);
  });

  it('unlocks once every hold is released', () => {
    const lock = new InputLock();
    lock.acquire('intro');
    lock.release('intro');

    assertEqual(lock.isUnlocked, true);
  });

  it('ignores an extra release', () => {
    const lock = new InputLock();
    lock.release('intro');

    assertEqual(lock.isUnlocked, true);
  });

  it('releaseAll drops every hold for a reason', () => {
    const lock = new InputLock();
    lock.acquire('dialogue');
    lock.acquire('dialogue');
    lock.releaseAll('dialogue');

    assertEqual(lock.isUnlocked, true);
  });

  it('clear drops everything', () => {
    const lock = new InputLock();
    lock.acquire('intro');
    lock.acquire('ending');
    lock.clear();

    assertEqual(lock.isUnlocked, true);
  });
}, 'unit');

describe('ScrollSpawn / unroll animation', () => {
  it('starts invisible and flat', () => {
    const state = scrollState(0);
    assertClose(state.scaleY, 0, 1e-6);
    assertClose(state.opacity, 0, 1e-6);
    assertEqual(state.complete, false);
  });

  it('is fully unrolled and opaque at the end', () => {
    const state = scrollState(1);
    assertClose(state.scaleY, 1, 1e-6);
    assertClose(state.opacity, 1, 1e-6);
    assertEqual(state.complete, true);
  });

  it('reaches full opacity before the unroll finishes', () => {
    assertClose(scrollState(0.2).opacity, 1, 1e-6);
  });

  it('clamps out-of-range progress', () => {
    assertClose(scrollState(-1).scaleY, 0, 1e-6);
    assertClose(scrollState(2).scaleY, 1, 1e-6);
  });
}, 'unit');

describe('ScrollSpawn / placement', () => {
  it('places the scroll in front of the player', () => {
    const offset = scrollOffset(0);
    assertClose(offset.z, SCROLL_DISTANCE, 1e-6);
    assertClose(offset.x, 0, 1e-6);
    assertClose(offset.y, SCROLL_ELEVATION, 1e-6);
  });

  it('rotates the offset with the facing yaw', () => {
    const offset = scrollOffset(Math.PI / 2);
    assertClose(offset.x, SCROLL_DISTANCE, 1e-6);
    assertClose(offset.z, 0, 1e-6);
  });
}, 'unit');

describe('ScrollSpawn / turning', () => {
  it('computes the yaw towards a target', () => {
    const yaw = yawTowards({ x: 0, z: 0 }, { x: 0, z: 1 });
    assertClose(yaw, 0, 1e-6);
  });

  it('takes the short way round', () => {
    const delta = shortestAngleDelta(0.1, Math.PI * 2 - 0.1);
    assertTrue(Math.abs(delta) < Math.PI, 'delta should be the short arc');
  });

  it('returns a delta within (-PI, PI]', () => {
    for (const a of [0, 1, -1, 3, -3]) {
      for (const b of [0, 1, -1, 3, -3]) {
        const delta = shortestAngleDelta(a, b);
        assertTrue(delta > -Math.PI - 1e-9 && delta <= Math.PI + 1e-9, `delta out of range: ${delta}`);
      }
    }
  });

  it('interpolates towards the target', () => {
    assertClose(turnTowards(0, 1, 0), 0, 1e-6);
    assertClose(turnTowards(0, 1, 1), 1, 1e-6);
    assertClose(turnTowards(0, 1, 0.5), 0.5, 1e-6);
  });
}, 'unit');