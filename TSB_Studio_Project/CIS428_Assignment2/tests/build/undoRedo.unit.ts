/**
 * Layer 1 — undo / redo stack.
 *
 * Covers U-B-12 (push), U-B-13 (undo) and U-B-14 (redo).
 */

import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { describe, it } from '../../scripts/verify/harness.js';
import { UndoRedoStack, createEditBatch } from '../../src/build/UndoRedoStack.js';

function batch(label: string, before: number, after: number) {
  return {
    label,
    edits: [{ x: 0, y: 0, z: 0, before, after }],
  };
}

describe('UndoRedoStack: push', () => {
  it('starts empty', () => {
    const stack = new UndoRedoStack();
    assertEqual(stack.undoCount, 0);
    assertEqual(stack.redoCount, 0);
    assertTrue(!stack.canUndo);
    assertTrue(!stack.canRedo);
  });

  it('records a batch', () => {
    const stack = new UndoRedoStack();
    stack.push(batch('place', 0, 1));
    assertEqual(stack.undoCount, 1);
    assertTrue(stack.canUndo);
  });

  it('ignores an empty batch', () => {
    const stack = new UndoRedoStack();
    stack.push({ label: 'noop', edits: [] });
    assertEqual(stack.undoCount, 0);
  });

  it('clears the redo stack on a new push', () => {
    const stack = new UndoRedoStack();
    stack.push(batch('a', 0, 1));
    stack.undo();
    assertEqual(stack.redoCount, 1);
    stack.push(batch('b', 0, 2));
    assertEqual(stack.redoCount, 0);
  });

  it('drops the oldest entry past the limit', () => {
    const stack = new UndoRedoStack({ limit: 2 });
    stack.push(batch('a', 0, 1));
    stack.push(batch('b', 0, 2));
    stack.push(batch('c', 0, 3));
    assertEqual(stack.undoCount, 2);
    assertEqual(stack.undo()?.label, 'c');
    assertEqual(stack.undo()?.label, 'b');
    assertEqual(stack.undo(), null);
  });

  it('rejects a non-positive limit', () => {
    let threw = false;
    try {
      new UndoRedoStack({ limit: 0 });
    } catch {
      threw = true;
    }
    assertTrue(threw, 'limit 0 should throw');
  });
});

describe('UndoRedoStack: undo', () => {
  it('returns null when empty', () => {
    assertEqual(new UndoRedoStack().undo(), null);
  });

  it('returns the most recent batch', () => {
    const stack = new UndoRedoStack();
    stack.push(batch('a', 0, 1));
    stack.push(batch('b', 0, 2));
    assertEqual(stack.undo()?.label, 'b');
    assertEqual(stack.undo()?.label, 'a');
  });

  it('moves the batch onto the redo stack', () => {
    const stack = new UndoRedoStack();
    stack.push(batch('a', 0, 1));
    stack.undo();
    assertEqual(stack.undoCount, 0);
    assertEqual(stack.redoCount, 1);
    assertTrue(stack.canRedo);
  });

  it('exposes the before state for reverting', () => {
    const stack = new UndoRedoStack();
    stack.push(batch('a', 3, 7));
    const undone = stack.undo();
    assertEqual(undone?.edits[0].before, 3);
  });
});

describe('UndoRedoStack: redo', () => {
  it('returns null when empty', () => {
    assertEqual(new UndoRedoStack().redo(), null);
  });

  it('replays the most recently undone batch', () => {
    const stack = new UndoRedoStack();
    stack.push(batch('a', 0, 1));
    stack.undo();
    assertEqual(stack.redo()?.label, 'a');
    assertEqual(stack.undoCount, 1);
    assertEqual(stack.redoCount, 0);
  });

  it('exposes the after state for re-applying', () => {
    const stack = new UndoRedoStack();
    stack.push(batch('a', 3, 7));
    stack.undo();
    const redone = stack.redo();
    assertEqual(redone?.edits[0].after, 7);
  });

  it('round-trips repeatedly', () => {
    const stack = new UndoRedoStack();
    stack.push(batch('a', 0, 1));
    for (let i = 0; i < 3; i++) {
      assertEqual(stack.undo()?.label, 'a');
      assertEqual(stack.redo()?.label, 'a');
    }
  });
});

describe('UndoRedoStack: clear', () => {
  it('drops both stacks', () => {
    const stack = new UndoRedoStack();
    stack.push(batch('a', 0, 1));
    stack.undo();
    stack.clear();
    assertEqual(stack.undoCount, 0);
    assertEqual(stack.redoCount, 0);
  });
});

describe('UndoRedoStack: createEditBatch', () => {
  it('records before and after for each cell', () => {
    const edits = createEditBatch('fill', [{ x: 1, y: 2, z: 3 }], () => 0, 5);
    assertEqual(edits.edits.length, 1);
    assertEqual(edits.edits[0].before, 0);
    assertEqual(edits.edits[0].after, 5);
  });

  it('skips cells that would not change', () => {
    const edits = createEditBatch('fill', [{ x: 0, y: 0, z: 0 }], () => 5, 5);
    assertEqual(edits.edits.length, 0);
  });

  it('reads the previous id per cell', () => {
    const edits = createEditBatch(
      'fill',
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      (cell) => cell.x,
      9,
    );
    assertEqual(edits.edits[0].before, 0);
    assertEqual(edits.edits[1].before, 1);
  });
});