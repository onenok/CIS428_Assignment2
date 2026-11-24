/**
 * Formats a {@link DebugSnapshot} into the lines the F3 overlay shows.
 *
 * Pure string work, so the layout can be tested without a DOM. The overlay
 * writes these lines into a `<pre>`-style element with `white-space: pre`.
 */

import type { DebugSnapshot } from './DebugSnapshot.js';

/** Fixed decimal places for world coordinates. */
const POSITION_DIGITS = 3;

/** Fixed decimal places for speeds. */
const VELOCITY_DIGITS = 2;

function fixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

function signed(value: number, digits: number): string {
  const text = fixed(value, digits);
  return value >= 0 ? `+${text}` : text;
}

/** `n/a` when the value is missing, otherwise the number. */
function orNa(value: number | null, digits: number): string {
  return value === null ? 'n/a' : fixed(value, digits);
}

/**
 * Builds the overlay text.
 *
 * Sections are separated by a blank line so the eye can find the player block
 * first — that is the one we actually read while debugging the spawn point.
 */
export function formatDebugSnapshot(snapshot: DebugSnapshot): string[] {
  const lines: string[] = [];

  const player = snapshot.player;
  if (player) {
    lines.push(
      `XYZ: ${fixed(player.position.x, POSITION_DIGITS)} / ${fixed(player.position.y, POSITION_DIGITS)} / ${fixed(player.position.z, POSITION_DIGITS)}`,
    );
    lines.push(`Block: ${player.block.x} / ${player.block.y} / ${player.block.z}`);
    lines.push(`Chunk: ${player.chunk.x} / ${player.chunk.z}`);
    lines.push(`Facing: ${fixed(player.yawDegrees, 1)}°`);
    lines.push(`Grounded: ${player.grounded ? 'true' : 'false'}`);
    lines.push(
      `Velocity: ${signed(player.velocity.x, VELOCITY_DIGITS)} / ${signed(player.velocity.y, VELOCITY_DIGITS)} / ${signed(player.velocity.z, VELOCITY_DIGITS)}`,
    );
  } else {
    lines.push('XYZ: n/a (no pawn)');
      lines.push('Block: n/a');
      lines.push('Chunk: n/a');
      lines.push('Facing: n/a');
      lines.push('Grounded: n/a');
      lines.push('Velocity: n/a');
    }

  lines.push('');

    // Only shown while the free camera flies: the pawn camera is rigidly attached,
      // so its numbers would just repeat the player block above.
      const freeCamera = snapshot.freeCamera;
      if (freeCamera) {
        lines.push('--- Free camera ---');
        lines.push(
          `Cam XYZ: ${fixed(freeCamera.position.x, POSITION_DIGITS)} / ${fixed(freeCamera.position.y, POSITION_DIGITS)} / ${fixed(freeCamera.position.z, POSITION_DIGITS)}`,
        );
        lines.push(`Cam Block: ${freeCamera.block.x} / ${freeCamera.block.y} / ${freeCamera.block.z}`);
        lines.push(
          `Cam Facing: ${fixed(freeCamera.yawDegrees, 1)}°  Pitch: ${fixed(freeCamera.pitchDegrees, 1)}°`,
        );
        lines.push(
          `Cam Velocity: ${signed(freeCamera.velocity.x, VELOCITY_DIGITS)} / ${signed(freeCamera.velocity.y, VELOCITY_DIGITS)} / ${signed(freeCamera.velocity.z, VELOCITY_DIGITS)}`,
        );
        lines.push('');
      }

      const world = snapshot.world;
  lines.push(`Surface Y: ${world.surfaceY} (top face ${fixed(world.groundTopY, 1)})`);
  lines.push(
    `Editable: x[${world.editable.minX}..${world.editable.maxX}] z[${world.editable.minZ}..${world.editable.maxZ}] y[${world.editable.minY}..${world.editable.maxY}]`,
  );
  lines.push(`Chunks: ${world.chunkCount} loaded`);

  lines.push('');

  const game = snapshot.game;
  lines.push(`Phase: ${game.phase}`);
  lines.push(`Build: ${game.buildMode ? 'true' : 'false'}`);
  lines.push(`Camera: ${game.cameraMode}`);
  lines.push(`Blocks placed: ${game.placedBlocks}`);
  lines.push(`Target: ${game.target}`);

  lines.push('');

    const input = snapshot.input;
      lines.push('--- Input ---');
      lines.push(`Keys: ${input.heldKeys.length > 0 ? input.heldKeys.join(' ') : '-'}`);
      lines.push(`Mouse: ${input.heldMouse.length > 0 ? input.heldMouse.join(' ') : '-'}`);
      // One action per line: a single joined line grows past the overlay width and
      // wraps unpredictably, which makes the newest entry hard to spot.
      if (input.recentActions.length === 0) {
        lines.push('Actions: -');
      } else {
        lines.push('Actions:');
        for (const action of input.recentActions) {
          lines.push(`  ${action.name} (${action.ageSeconds.toFixed(1)}s)`);
        }
      }

      lines.push('');

  const perf = snapshot.perf;
  lines.push(`FPS: ${fixed(perf.fps, 0)}  Frame: ${fixed(perf.frameMs, 1)} ms`);
  lines.push(`Draw calls: ${orNa(perf.drawCalls, 0)}  Triangles: ${orNa(perf.triangles, 0)}`);

  return lines;
}