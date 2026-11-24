/**
 * Post-process state, read from the engine's manager.
 *
 * Two dumps taken either side of the "ground collapses into one flat sheet" moment
 * came back identical in every scene-side field — same drawables, same sizes, same
 * materials, same scene background and environment. When the geometry and the scene
 * are provably unchanged but the picture is not, the difference has to be downstream
 * of the scene pass: the effect chain that composites the frame.
 *
 * This reads that chain so the report can say which effects are enabled and with what
 * settings, instead of guessing.
 */

import type { PostReport } from './renderReport.js';

/** The slice of the engine manager this reads. Keeps the engine out of this module. */
interface PostManagerLike {
  getAllEffects?: () => ReadonlyArray<{ readonly type?: string }>;
  getEffectConfig?: (type: string) => Record<string, unknown> | null;
  getPostProcessingEnabled?: () => boolean;
}

/** Effect settings worth printing: primitives only, so the line stays readable. */
function describeConfig(config: Record<string, unknown> | null): string {
  if (!config) {
    return '-';
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (key === 'type') {
      continue;
    }
    if (typeof value === 'number') {
      parts.push(`${key}=${Number.isInteger(value) ? value : value.toFixed(3)}`);
    } else if (typeof value === 'boolean' || typeof value === 'string') {
      parts.push(`${key}=${value}`);
    }
    // Objects and arrays are skipped on purpose: the report is read at a glance, and
    // the flags that make an effect cover the screen are always primitives.
  }
  return parts.length > 0 ? parts.join(' ') : '-';
}

/**
 * Reads the enabled state and settings of every registered post effect.
 *
 * Never throws: a F4 dump that crashes is worse than a dump that says "unavailable",
 * and the manager is absent in a headless test world.
 */
export function collectPostReport(manager: unknown): PostReport {
  const post = manager as PostManagerLike | null | undefined;
  if (!post || typeof post.getAllEffects !== 'function') {
    return { enabled: false, effects: [] };
  }

  try {
    const enabled = typeof post.getPostProcessingEnabled === 'function'
      ? post.getPostProcessingEnabled()
      : true;
    const effects = post.getAllEffects()
      .map((effect) => {
        const type = effect.type ?? 'unknown';
        const config = typeof post.getEffectConfig === 'function' ? post.getEffectConfig(type) : null;
        const isOn = config?.enabled;
        return {
          type,
          enabled: isOn === undefined ? true : isOn !== false,
          config: describeConfig(config ?? null),
        };
      })
      .sort((a, b) => a.type.localeCompare(b.type));
    return { enabled, effects };
  } catch {
    return { enabled: false, effects: [] };
  }
}