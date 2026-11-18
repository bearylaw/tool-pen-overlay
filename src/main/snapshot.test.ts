import { describe, expect, it } from 'vitest';
import { captureSize, pairSources } from './snapshot';

describe('captureSize', () => {
  it('fits the largest display at its physical resolution', () => {
    expect(
      captureSize([
        { id: 1, width: 1920, height: 1080, scaleFactor: 1 },
        { id: 2, width: 1280, height: 800, scaleFactor: 2 },
      ]),
    ).toEqual({ width: 2560, height: 1600 });
  });

  it('never asks for an empty box', () => {
    expect(captureSize([])).toEqual({ width: 1, height: 1 });
  });
});

describe('pairSources', () => {
  it('pairs by display id regardless of order', () => {
    const pairs = pairSources(
      [7, 3],
      [
        { display_id: '3', name: 'b' },
        { display_id: '7', name: 'a' },
      ],
    );
    expect(pairs.get(7)?.name).toBe('a');
    expect(pairs.get(3)?.name).toBe('b');
  });

  it('falls back to order when no source names a display and the counts match', () => {
    const pairs = pairSources([5, 6], [{ display_id: '' }, { display_id: '' }]);
    expect([...pairs.keys()]).toEqual([5, 6]);
  });

  it('leaves displays out rather than guess when unnamed counts differ', () => {
    expect(pairSources([5, 6], [{ display_id: '' }]).size).toBe(0);
  });

  it('leaves out a display without a matching source', () => {
    const pairs = pairSources([1, 2], [{ display_id: '1' }]);
    expect([...pairs.keys()]).toEqual([1]);
  });
});
