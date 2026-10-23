import { describe, expect, it } from 'vitest';
import { EMPTY_ROUTER, forgetDisplay, recordStep, takeRedo, takeUndo } from './history-router';

describe('history router', () => {
  it('undoes the latest step on whichever display it happened', () => {
    const state = recordStep(recordStep(EMPTY_ROUTER, [1]), [2]);
    expect(takeUndo(state)?.displays).toEqual([2]);
  });

  it('redoes what was undone and forgets it after a new step', () => {
    const undone = takeUndo(recordStep(EMPTY_ROUTER, [1]));
    if (undone === null) throw new Error('expected a step to undo');
    expect(takeRedo(undone.state)?.displays).toEqual([1]);
    expect(recordStep(undone.state, [3]).redo).toEqual([]);
  });

  it('ignores a step that touched no display', () => {
    expect(recordStep(EMPTY_ROUTER, [])).toBe(EMPTY_ROUTER);
  });

  it('returns null when there is nothing to undo or redo', () => {
    expect(takeUndo(EMPTY_ROUTER)).toBeNull();
    expect(takeRedo(EMPTY_ROUTER)).toBeNull();
  });

  it('drops an unplugged display from every step', () => {
    const state = recordStep(recordStep(EMPTY_ROUTER, [1, 2]), [2]);
    expect(forgetDisplay(state, 2)).toEqual({ undo: [[1]], redo: [] });
  });
});
