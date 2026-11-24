/**
 * Layer 1 — submit gating.
 *
 * Covers U-B-16: an empty design takes the blank-submit branch.
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { evaluateSubmit, isBlankSubmission } from '../../src/build/submitCheck.js';

describe('submitCheck: outcome', () => {
  it('treats zero blocks as blank', () => {
    assertEqual(evaluateSubmit(0), 'blank');
  });

  it('treats one block as a normal submission', () => {
    assertEqual(evaluateSubmit(1), 'normal');
  });

  it('treats many blocks as a normal submission', () => {
    assertEqual(evaluateSubmit(4096), 'normal');
  });

  it('treats a negative count as blank', () => {
    assertEqual(evaluateSubmit(-1), 'blank');
  });

  it('exposes a boolean helper', () => {
    assertTrue(isBlankSubmission(0));
    assertTrue(!isBlankSubmission(1));
    });
  });
