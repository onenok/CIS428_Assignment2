/**
 * Debug snapshot — the data behind the F3 overlay.
 *
 * Everything here is a pure read: no DOM, no engine mutation. That keeps the
 * whole module testable in the headless harness, which has no `document`.
 *
 * The overlay exists because the spawn point could not be verified from
 * screenshots alone — we needed the actual numbers on screen.
 */

/** A world-space position. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** An integer voxel cell. */
export interface Cell3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Player state, or `null` before the pawn exists. */
export interface DebugPlayerSnapshot {
  readonly position: Vec3;
  readonly block: Cell3;
  readonly chunk: { readonly x: number; readonly z: number };
  readonly yawDegrees: number;
  readonly grounded: boolean;
  readonly velocity: Vec3;
}

/** World generation state. */
export interface DebugWorldSnapshot {
  readonly surfaceY: number;
  readonly groundTopY: number;
  readonly editable: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
    readonly minY: number;
    readonly maxY: number;
  };
  readonly chunkCount: number;
}

/** Game flow state. */
export interface DebugGameSnapshot {
  readonly phase: string;
  readonly buildMode: boolean;
  readonly cameraMode: string;
  readonly placedBlocks: number;
  readonly target: string;
}

/**
 * The detached free camera, or `null` while it is not flying.
 *
 * Only populated in free-camera mode: the pawn's own camera is rigidly attached
 * to the pawn, so its position and velocity would just repeat the player block.
 */
export interface DebugFreeCameraSnapshot {
  readonly position: Vec3;
  readonly block: Cell3;
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly velocity: Vec3;
}

/** Frame timing and renderer counters. */
export interface DebugPerfSnapshot {
  readonly fps: number;
  readonly frameMs: number;
  readonly drawCalls: number | null;
  readonly triangles: number | null;
}

/** One action shown in the overlay, with its age. */
export interface DebugInputAction {
  readonly name: string;
  /** Seconds since it fired. */
  readonly ageSeconds: number;
}

/**
 * What the input layer saw this frame.
 *
 * `heldKeys` answers "did the key reach the handler?"; `recentActions` answers
 * "did the handler decide to act?". A key that is held but never produces an
 * action means the binding check or a phase gate rejected it.
 */
export interface DebugInputSnapshot {
  readonly heldKeys: readonly string[];
  /** Mouse buttons as names: `left`, `middle`, `right`, `back`, `forward`. */
  readonly heldMouse: readonly string[];
  readonly recentActions: readonly DebugInputAction[];
}

/** One complete frame of debug data. */
export interface DebugSnapshot {
  readonly player: DebugPlayerSnapshot | null;
  readonly freeCamera: DebugFreeCameraSnapshot | null;
  readonly world: DebugWorldSnapshot;
  readonly game: DebugGameSnapshot;
  readonly input: DebugInputSnapshot;
  readonly perf: DebugPerfSnapshot;
}

/** Human-readable name for a `MouseEvent.button` index. */
export function mouseButtonName(button: number): string {
  switch (button) {
    case 0: return 'left';
    case 1: return 'middle';
    case 2: return 'right';
    case 3: return 'back';
    case 4: return 'forward';
    default: return `button${button}`;
  }
}

/** Local movement speeds, as reported by `CharacterMovementNode.getVelocities()`. */
export interface LocalVelocities {
  readonly forward: number;
  readonly right: number;
  readonly vertical: number;
}

/**
 * Converts local forward/right/vertical speeds into a world-space vector.
 *
 * The movement node works in the pawn's own frame, so the overlay has to rotate
 * the speeds by the pawn's yaw before they mean anything on screen.
 *
 * Forward is `+Z` at yaw 0 and right is `+X`, matching Three.js conventions.
 */
export function localVelocitiesToWorld(velocities: LocalVelocities, yawRadians: number): Vec3 {
  const sin = Math.sin(yawRadians);
  const cos = Math.cos(yawRadians);
  return {
    x: velocities.forward * sin + velocities.right * cos,
    y: velocities.vertical,
    z: velocities.forward * cos - velocities.right * sin,
  };
}

/** The voxel cell containing a world position. */
export function worldToBlock(position: Vec3): Cell3 {
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z),
  };
}

/** The chunk containing a world position. */
export function worldToChunk(position: Vec3, chunkSize: number): { x: number; z: number } {
  return {
    x: Math.floor(position.x / chunkSize),
    z: Math.floor(position.z / chunkSize),
  };
}

/** Radians to degrees, normalised to `[0, 360)`. */
export function radiansToDegrees(radians: number): number {
  const degrees = (radians * 180) / Math.PI;
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** The compass direction for a yaw in degrees. */
export function compassDirection(yawDegrees: number): string {
  const names = ['north', 'east', 'south', 'west'] as const;
  const index = Math.round(yawDegrees / 90) % 4;
  return names[index];
}

/** Renderer counters, or `null` when the renderer is unavailable. */
export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  /**
   * What the counters cover: the whole frame, or only the last `render()` call.
   *
   * three.js resets `info.render` at the start of every `render()` unless `autoReset` is
   * turned off, and the engine makes off-screen draws (the sky capturing its environment
   * map) inside the same frame. Those replace the totals with their own, so a low reading
   * is not by itself evidence that the world stopped drawing.
   */
  readonly scoped?: string;
  readonly geometries?: number;
  readonly textures?: number;
}

/**
 * Reads draw-call counters straight from the renderer.
 *
 * `collectPerformanceSnapshot()` would also work but builds a full snapshot
 * (including texture VRAM estimates), which is far too heavy for a per-frame
 * overlay. This reads the two numbers we actually show.
 */
export function readRenderStats(renderer: unknown): RenderStats | null {
  const candidate = renderer as {
    asWebGL?: () => {
      info?: {
        autoReset?: boolean;
        render?: { calls?: number; triangles?: number };
        memory?: { geometries?: number; textures?: number };
      };
    } | null;
    asWebGPU?: () => { info?: { render?: { drawCalls?: number; triangles?: number } } } | null;
  } | null;

  if (!candidate) {
    return null;
  }

  const webgl = candidate.asWebGL?.() ?? null;
  if (webgl) {
    const info = webgl.info?.render;
    if (!info) return null;
    // `autoReset` decides what the number means. With it on (three.js's default) the
    // counters restart at every `render()` call, so an off-screen draw made later in the
    // same frame — the sky recapturing its environment map, for instance — replaces the
    // frame's totals with its own. A dump showing `drawCalls: 4, triangles: 14` while 25
    // chunks are on screen is that, not a rendering bug.
    const autoReset = webgl.info?.autoReset !== false;
    return {
      drawCalls: info.calls ?? 0,
      triangles: info.triangles ?? 0,
      scoped: autoReset ? 'last render call' : 'frame',
      geometries: webgl.info?.memory?.geometries,
      textures: webgl.info?.memory?.textures,
    };
  }

  const webgpu = candidate.asWebGPU?.() ?? null;
  if (webgpu) {
    const info = webgpu.info?.render;
    if (!info) return null;
    return { drawCalls: info.drawCalls ?? 0, triangles: info.triangles ?? 0, scoped: 'frame' };
  }

  return null;
}

/** Rolling frame-time average, so the FPS readout does not flicker. */
export class FrameTimer {
  private readonly samples: number[] = [];

  public constructor(private readonly capacity: number = 30) {}

  /** Records one frame and returns the smoothed FPS and frame time. */
  public sample(deltaSeconds: number): { fps: number; frameMs: number } {
    if (deltaSeconds > 0) {
      this.samples.push(deltaSeconds);
      if (this.samples.length > this.capacity) {
        this.samples.shift();
      }
    }

    if (this.samples.length === 0) {
      return { fps: 0, frameMs: 0 };
    }

    const total = this.samples.reduce((sum, value) => sum + value, 0);
    const average = total / this.samples.length;
    return { fps: average > 0 ? 1 / average : 0, frameMs: average * 1000 };
  }

  public reset(): void {
    this.samples.length = 0;
  }
}