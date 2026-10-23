import type { Stroke } from './ink';

/** One undoable change to the strokes on one overlay. */
export type InkAction =
  | { readonly kind: 'add'; readonly stroke: Stroke }
  | { readonly kind: 'erase'; readonly removed: readonly IndexedStroke[] }
  | { readonly kind: 'clear'; readonly removed: readonly Stroke[] };

/** A stroke together with the position it had in the list. */
export interface IndexedStroke {
  readonly index: number;
  readonly stroke: Stroke;
}

/** Strokes on one overlay plus their undo and redo stacks. */
export interface InkState {
  readonly strokes: readonly Stroke[];
  readonly undo: readonly InkAction[];
  readonly redo: readonly InkAction[];
}

/** Undo depth per overlay; old steps beyond this are forgotten. */
export const HISTORY_LIMIT = 500;

export const EMPTY_INK: InkState = { strokes: [], undo: [], redo: [] };

/** Records a finished stroke. Clears the redo stack. */
export function addStroke(state: InkState, stroke: Stroke): InkState {
  return record(state, { kind: 'add', stroke });
}

/**
 * Removes the strokes with the given ids as one undoable step. Returns the
 * same state when none of them exist.
 */
export function eraseStrokes(state: InkState, ids: ReadonlySet<number>): InkState {
  const removed = state.strokes
    .map((stroke, index) => ({ index, stroke }))
    .filter(({ stroke }) => ids.has(stroke.id));
  if (removed.length === 0) return state;
  return record(state, { kind: 'erase', removed });
}

/** Removes every stroke as one undoable step. Returns the same state when empty. */
export function clearStrokes(state: InkState): InkState {
  if (state.strokes.length === 0) return state;
  return record(state, { kind: 'clear', removed: state.strokes });
}

/** Reverts the most recent step, if any. */
export function undo(state: InkState): InkState {
  const action = state.undo.at(-1);
  if (action === undefined) return state;
  return {
    strokes: revert(state.strokes, action),
    undo: state.undo.slice(0, -1),
    redo: [...state.redo, action],
  };
}

/** Re-applies the most recently undone step, if any. */
export function redo(state: InkState): InkState {
  const action = state.redo.at(-1);
  if (action === undefined) return state;
  return {
    strokes: apply(state.strokes, action),
    undo: [...state.undo, action],
    redo: state.redo.slice(0, -1),
  };
}

/** Forgets undone steps; called when a new step happens on another overlay. */
export function dropRedo(state: InkState): InkState {
  return state.redo.length === 0 ? state : { ...state, redo: [] };
}

function record(state: InkState, action: InkAction): InkState {
  return {
    strokes: apply(state.strokes, action),
    undo: [...state.undo, action].slice(-HISTORY_LIMIT),
    redo: [],
  };
}

function apply(strokes: readonly Stroke[], action: InkAction): readonly Stroke[] {
  switch (action.kind) {
    case 'add':
      return [...strokes, action.stroke];
    case 'erase': {
      const ids = new Set(action.removed.map((r) => r.stroke.id));
      return strokes.filter((s) => !ids.has(s.id));
    }
    case 'clear':
      return [];
  }
}

function revert(strokes: readonly Stroke[], action: InkAction): readonly Stroke[] {
  switch (action.kind) {
    case 'add':
      return strokes.filter((s) => s.id !== action.stroke.id);
    case 'erase': {
      // Reinsert in ascending index order so each lands where it was.
      const result = [...strokes];
      for (const { index, stroke } of [...action.removed].sort((a, b) => a.index - b.index)) {
        result.splice(index, 0, stroke);
      }
      return result;
    }
    case 'clear':
      return action.removed;
  }
}
