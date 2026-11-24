/**
 * Layer 1 — post-process reporting.
 *
 * The report exists because two dumps taken either side of the failure came back
 * identical in every scene-side field. What it must prove is that the effect chain is
 * actually read, and that a missing manager degrades to "nothing" instead of throwing:
 * a F4 dump that crashes mid-dump produces no evidence at all.
 */

import { assertDeepEqual, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { collectPostReport } from '../../src/debug/postReport.js';

describe('postReport: effect chain', () => {
  it('reports nothing when no manager exists', () => {
    const report = collectPostReport(null);
    assertEqual(report.enabled, false);
    assertEqual(report.effects.length, 0);
  });

  it('reports the enabled state of the chain and of each effect', () => {
    const report = collectPostReport({
      getPostProcessingEnabled: () => true,
      getAllEffects: () => [{ type: 'bloom' }, { type: 'ao' }],
      getEffectConfig: (type: string) => (type === 'bloom'
        ? { type, enabled: true, strength: 1.5 }
        : { type, enabled: false, radius: 0.25 }),
    });

    assertEqual(report.enabled, true);
    assertDeepEqual(report.effects.map((effect) => effect.type), ['ao', 'bloom']);
    assertEqual(report.effects[0].enabled, false);
    assertEqual(report.effects[1].enabled, true);
  });

  it('prints the primitive settings of an effect', () => {
    const report = collectPostReport({
      getAllEffects: () => [{ type: 'bloom' }],
      getEffectConfig: () => ({ type: 'bloom', strength: 1.5, mipmapBlur: true, kernel: 'large' }),
    });

    const config = report.effects[0].config;
    assertTrue(config.includes('strength=1.500'), config);
    assertTrue(config.includes('mipmapBlur=true'), config);
    assertTrue(config.includes('kernel=large'), config);
    assertTrue(!config.includes('type='), 'the type is already a column of its own');
  });

  // A manager that throws must not take the whole dump with it.
  it('degrades to an empty chain when the manager throws', () => {
    const report = collectPostReport({
      getAllEffects: () => {
        throw new Error('not bound');
      },
    });
    assertEqual(report.enabled, false);
    assertEqual(report.effects.length, 0);
  });
});