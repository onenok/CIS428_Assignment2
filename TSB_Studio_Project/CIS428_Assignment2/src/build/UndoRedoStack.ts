/**
 * Undo / redo stack for voxel edits.
 *
 * One stack entry is one *user action*, which may touch many cells (a rect fill,
 * a preset application). Each cell records both its previous and its new block
 * id so undo and redo are exact inverses without re-running placement logic.
 *
 * The stack is bounded: pushing past `limit` drops the oldest entry, so a long
 * build session cannot grow memory without bound.
 */

import type { VoxelCell } from './placement.js';

/** One cell's before/after state. */
export interface VoxelEdit {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Block id before the action. */
  readonly before: number;
  /** Block id after the action. */
  readonly after: number;
}

/** One user action: a batch of cell edits applied together. */
export interface EditBatch {
  readonly label: string;
  readonly edits: readonly VoxelEdit[];
}

export interface UndoRedoStackOptions {
  /** Maximum number of batches retained. Defaults to 100. */
  readonly limit?: number;
}

export class UndoRedoStack {
  private readonly undoStack: EditBatch[] = [];
  private readonly redoStack: EditBatch[] = [];
  private readonly limit: number;

  public constructor(options: UndoRedoStackOptions = {}) {
    this.limit = options.limit ?? 100;
    if (this.limit <= 0) throw new Error(`UndoRedoStack: limit must be positive, got ${this.limit}`);
  }

  /** Number of batches that can be undone. */
  public get undoCount(): number {
    return this.undoStack.length;
  }

  /** Number of batches that can be redone. */
  public get redoCount(): number {
    return this.redoStack.length;
  }

  /** True when there is nothing to undo. */
  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** True when there is nothing to redo. */
  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Records a completed action.
   *
   * Pushing clears the redo stack: once the player branches off the undo history
   * the old redo path is no longer reachable.
   */
  public push(batch: EditBatch): void {
    if (batch.edits.length === 0) return;
    this.undoStack.push(batch);
    this.redoStack.length = 0;
    while (this.undoStack.length > this.limit) this.undoStack.shift();
  }

  /**
   * Pops the most recent batch and returns the edits to revert.
   *
   * The caller applies `before` for every edit. Returns `null` when empty.
   */
  public undo(): EditBatch | null {
    const batch = this.undoStack.pop();
    if (!batch) return null;
    this.redoStack.push(batch);
    return batch;
  }

  /**
   * Pops the most recently undone batch and returns the edits to re-apply.
   *
   * The caller applies `after` for every edit. Returns `null` when empty.
   */
  public redo(): EditBatch | null {
    const batch = this.redoStack.pop();
    if (!batch) return null;
    this.undoStack.push(batch);
    return batch;
  }

  /** Drops all history. */
  public clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

/** Builds a batch from a cell list plus a lookup for the previous block id. */
export function createEditBatch(
  label: string,
  cells: readonly VoxelCell[],
  previousId: (cell: VoxelCell) => number,
  nextId: number,
): EditBatch {
  const edits: VoxelEdit[] = [];
  for (const cell of cells) {
    const before = previousId(cell);
    if (before === nextId) continue;
    edits.push({ x: cell.x, y: cell.y, z: cell.z, before, after: nextId });
  }
  return { label, edits };
}