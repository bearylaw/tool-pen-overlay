/**
 * Undo across monitors. Each overlay keeps its own strokes and undo stack;
 * this records which overlays took part in each step, so Ctrl+Z undoes the
 * most recent step wherever it happened. Pure; no Electron.
 */
export interface RouterState {
  readonly undo: readonly (readonly number[])[];
  readonly redo: readonly (readonly number[])[];
}

export const EMPTY_ROUTER: RouterState = { undo: [], redo: [] };

const LIMIT = 500;

/** Records a new step on the given displays and forgets anything undone. */
export function recordStep(state: RouterState, displays: readonly number[]): RouterState {
  if (displays.length === 0) return state;
  return { undo: [...state.undo, displays].slice(-LIMIT), redo: [] };
}

/** Takes the latest step to undo; `null` when there is none. */
export function takeUndo(
  state: RouterState,
): { readonly state: RouterState; readonly displays: readonly number[] } | null {
  const displays = state.undo.at(-1);
  if (displays === undefined) return null;
  return { state: { undo: state.undo.slice(0, -1), redo: [...state.redo, displays] }, displays };
}

/** Takes the latest undone step to redo; `null` when there is none. */
export function takeRedo(
  state: RouterState,
): { readonly state: RouterState; readonly displays: readonly number[] } | null {
  const displays = state.redo.at(-1);
  if (displays === undefined) return null;
  return { state: { undo: [...state.undo, displays], redo: state.redo.slice(0, -1) }, displays };
}

/** Drops a display that was unplugged; steps that only touched it disappear. */
export function forgetDisplay(state: RouterState, display: number): RouterState {
  const without = (steps: RouterState['undo']): RouterState['undo'] =>
    steps.map((step) => step.filter((d) => d !== display)).filter((step) => step.length > 0);
  return { undo: without(state.undo), redo: without(state.redo) };
}
