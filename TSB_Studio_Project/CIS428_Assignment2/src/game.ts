/**
 * Game entry point.
 *
 * `main()` is called by the engine runtime after the bundle is evaluated. It
 * hands the engine our game mode class so the world spawns our pawn and
 * controller instead of the engine defaults.
 *
 * The renderer options are pinned here because the engine's default is not a safe
 * default for this game. Engine 19 defaults `drawingPipeline` to `meshlet`: an
 * experimental GPU-driven path that welds, clusters and simplifies each geometry,
 * then draws from those clusters, fed from a scene registry instead of a per-frame
 * scene walk. Our chunks replace their geometry on every edit, which is the case
 * that path handles worst, and its failures do not look like geometry errors —
 * they look like stretched, z-fighting faces over an otherwise intact world. The
 * classic `standard` path draws exactly the geometry the mesher produced, so it is
 * the correct default here. `?pipeline=meshlet` in the URL brings the GPU path
 * back for a side-by-side comparison without a rebuild.
 */

import * as ENGINE from '@gnsx/genesys.js';
import { MyGameMode } from './game/MyGameMode.js';

/** Drawing pipeline used unless the URL asks for another one. */
const DEFAULT_DRAWING_PIPELINE = 'standard';

/** Reads `?pipeline=` so the choice can be A/B tested without a rebuild. */
function requestedDrawingPipeline(): string {
  const search = typeof globalThis.location === 'object' ? globalThis.location?.search ?? '' : '';
  if (!search) {
    return DEFAULT_DRAWING_PIPELINE;
  }
  const requested = new URLSearchParams(search).get('pipeline')?.trim().toLowerCase();
  return requested ? requested : DEFAULT_DRAWING_PIPELINE;
}

class MyGame extends ENGINE.BaseGameLoop {
}

export function main(container: HTMLElement, options?: Partial<ENGINE.BaseGameLoopOptions>): ENGINE.IGameLoop {
  // The host's options are kept, including its own WebGPU parameters; only the
  // drawing pipeline and the scene registry that feeds it are decided here.
  const hostRenderer = options?.rendererOptions;
  const mergedOptions: Partial<ENGINE.BaseGameLoopOptions> = {
    ...options,
    rendererOptions: {
      ...hostRenderer,
      webgpu: {
        ...hostRenderer?.webgpu,
        drawingPipeline: requestedDrawingPipeline() as ENGINE.DrawingPipelineType,
        // The registry only feeds the GPU paths. The engine ignores it with
        // `standard`, so it is turned off explicitly rather than left to disagree
        // with the pipeline setting.
        sceneRegistry: false,
      },
    },
    defaultGameModeClass: MyGameMode,
  };
  const game = new MyGame(container, mergedOptions);
  return game;
}