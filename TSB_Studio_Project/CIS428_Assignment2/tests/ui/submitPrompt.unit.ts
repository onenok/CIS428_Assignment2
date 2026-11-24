import { describe, it } from '../../scripts/verify/harness.js';
import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import {
  keyLabel,
  submitBlockReason,
  submitEnabled,
  submitHintText,
} from '../../src/ui/SubmitPrompt.js';
import { rebind, resetKeyBindings } from '../../src/input/keyBindings.js';

describe('SubmitPrompt / key labels', () => {
  it('labels Enter', () => {
    assertEqual(keyLabel('Enter'), 'Enter');
  });

  it('labels a letter key without the Key prefix', () => {
    assertEqual(keyLabel('KeyB'), 'B');
  });

  it('labels a digit key without the Digit prefix', () => {
    assertEqual(keyLabel('Digit3'), '3');
  });

  it('labels Escape as Esc', () => {
    assertEqual(keyLabel('Escape'), 'Esc');
  });

  it('passes an unknown code through unchanged', () => {
    assertEqual(keyLabel('F7'), 'F7');
  });
}, 'unit');

describe('SubmitPrompt / hint text', () => {
  it('mentions Ctrl and Enter', () => {
    const hint = submitHintText();
    assertTrue(hint.includes('Ctrl'), 'hint should mention Ctrl');
    assertTrue(hint.includes('Enter'), 'hint should mention Enter');
  });

  it('follows a rebind of submitDesign', () => {
    rebind('submitDesign', ['KeyS']);
    const hint = submitHintText();
    assertTrue(hint.includes('S'), 'hint should follow the rebind');
    resetKeyBindings();
  });
}, 'unit');

describe('SubmitPrompt / enabled state', () => {
  it('is disabled outside build mode', () => {
    assertEqual(submitEnabled(false, 5), false);
  });

  it('is disabled with no placed blocks', () => {
    assertEqual(submitEnabled(true, 0), false);
  });

  it('is enabled while building with at least one block', () => {
    assertEqual(submitEnabled(true, 1), true);
  });
}, 'unit');

describe('SubmitPrompt / block reasons', () => {
  it('reports notBuilding outside build mode', () => {
    assertEqual(submitBlockReason(false, 0), 'notBuilding');
  });

  it('reports empty when nothing is placed', () => {
    assertEqual(submitBlockReason(true, 0), 'empty');
  });

  it('reports no reason when submitting is allowed', () => {
    assertEqual(submitBlockReason(true, 3), null);
  });
}, 'unit');