/**
 * Formatting helpers for voxel edits in the runtime input log.
 *
 * The log used to hold only key presses and actions, which was not enough to
 * diagnose a rendering report: "the ground is wrong except for one frame right
 * after an edit" cannot be checked without knowing when the edits happened.
 */

/** One voxel edit, in the shape the log line needs. */
export interface LoggedEdit {
  /** World voxel coordinate. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Block id before and after the edit. */
  readonly before: number;
  readonly after: number;
}

/**
 * Formats one edit as `place (1,2,3) 0->3`.
 *
 * Kept free of engine imports so it stays unit-testable.
 */
export function describeEdit(
  label: string,
  cell: { readonly x: number; readonly y: number; readonly z: number },
  before: number,
  after: number,
): string {
  return `${label} (${cell.x},${cell.y},${cell.z}) ${before}->${after}`;
}