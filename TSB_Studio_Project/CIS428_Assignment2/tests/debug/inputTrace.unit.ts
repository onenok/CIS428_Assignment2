/**
 * Input trace tests (layer 1).
 *
 * The F3 overlay reads this class directly, so the bookkeeping is asserted here
 * rather than through the DOM.
 */

import { describe, it } from '../../scripts/verify/harness.js';
import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { InputTrace } from '../../src/debug/InputTrace.js';

describe('input trace: held keys', () => {
  it('records a key press', () => {
    const trace = new InputTrace();
    trace.keyDown('KeyW');
    assertEqual(trace.keys.length, 1);
    assertEqual(trace.keys[0], 'KeyW');
  });

  it('removes a key on release', () => {
    const trace = new InputTrace();
    trace.keyDown('KeyW');
    trace.keyUp('KeyW');
    assertEqual(trace.keys.length, 0);
  });

  it('does not duplicate a repeated press', () => {
    const trace = new InputTrace();
    trace.keyDown('KeyW');
    trace.keyDown('KeyW');
    assertEqual(trace.keys.length, 1);
  });

  it('sorts the keys for a stable readout', () => {
    const trace = new InputTrace();
    trace.keyDown('KeyW');
    trace.keyDown('ControlLeft');
    trace.keyDown('KeyA');
    assertEqual(trace.keys.join(' '), 'ControlLeft KeyA KeyW');
  });

  it('ignores a release for a key that was never pressed', () => {
    const trace = new InputTrace();
    trace.keyUp('KeyW');
    assertEqual(trace.keys.length, 0);
  });
});

describe('input trace: held mouse buttons', () => {
  it('records a button press', () => {
    const trace = new InputTrace();
    trace.mouseDown(0);
    assertEqual(trace.mouse.length, 1);
    assertEqual(trace.mouse[0], 0);
  });

  it('removes a button on release', () => {
    const trace = new InputTrace();
    trace.mouseDown(2);
    trace.mouseUp(2);
    assertEqual(trace.mouse.length, 0);
  });

  it('sorts the buttons numerically', () => {
    const trace = new InputTrace();
    trace.mouseDown(2);
    trace.mouseDown(0);
    trace.mouseDown(1);
    assertEqual(trace.mouse.join(','), '0,1,2');
  });
});

describe('input trace: action history', () => {
  it('records one action', () => {
    const trace = new InputTrace();
    trace.action('flyDown', 1000);
    assertEqual(trace.actions.length, 1);
    assertEqual(trace.actions[0].name, 'flyDown');
    assertEqual(trace.actions[0].atMs, 1000);
  });

  it('keeps actions in the order they fired', () => {
    const trace = new InputTrace();
    trace.action('first', 1000);
    trace.action('second', 2000);
    assertEqual(trace.actions[0].name, 'first');
    assertEqual(trace.actions[1].name, 'second');
  });

  it('drops the oldest action past the history limit', () => {
    const trace = new InputTrace();
    for (let i = 0; i < 10; i += 1) {
      trace.action(`action${i}`, i * 100);
    }
    assertEqual(trace.actions.length, 8);
    assertEqual(trace.actions[0].name, 'action2');
    assertEqual(trace.actions[7].name, 'action9');
  });
});

describe('input trace: clearing', () => {
  it('clearHeld drops held state but keeps history', () => {
    const trace = new InputTrace();
    trace.keyDown('KeyW');
    trace.mouseDown(0);
    trace.action('flyDown', 1000);

    trace.clearHeld();

    assertEqual(trace.keys.length, 0);
    assertEqual(trace.mouse.length, 0);
    assertEqual(trace.actions.length, 1);
  });

  it('reset drops everything', () => {
    const trace = new InputTrace();
    trace.keyDown('KeyW');
    trace.mouseDown(0);
    trace.action('flyDown', 1000);

    trace.reset();

    assertEqual(trace.keys.length, 0);
    assertEqual(trace.mouse.length, 0);
    assertEqual(trace.actions.length, 0);
  });
});
