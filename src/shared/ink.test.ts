import { describe, expect, it } from 'vitest';
import { hex } from './color';
import { addStroke, clearStrokes, dropRedo, EMPTY_INK, eraseStrokes, redo, undo } from './history';
import {
  arrowHead,
  constrain,
  distanceToSegment,
  hitsStroke,
  type Point,
  predictPoint,
  pressureWidth,
  type Stroke,
} from './ink';

const pt = (x: number, y: number, p = 0.5): Point => ({ x, y, p });

function line(id: number, from: Point, to: Point): Stroke {
  return { id, color: hex('#000000'), size: 4, opacity: 1, geometry: { kind: 'line', from, to } };
}

function freehand(id: number, points: Point[]): Stroke {
  return {
    id,
    color: hex('#000000'),
    size: 4,
    opacity: 1,
    geometry: { kind: 'freehand', points, pressure: false },
  };
}

describe('geometry', () => {
  it('measures distance to a segment, including past its ends', () => {
    expect(distanceToSegment(pt(5, 3), pt(0, 0), pt(10, 0))).toBe(3);
    expect(distanceToSegment(pt(13, 4), pt(0, 0), pt(10, 0))).toBe(5);
    expect(distanceToSegment(pt(3, 4), pt(0, 0), pt(0, 0))).toBe(5);
  });

  it('snaps lines to 15° steps while keeping the length', () => {
    const end = constrain('line', pt(0, 0), pt(100, 8));
    expect(end.x).toBeCloseTo(Math.hypot(100, 8));
    expect(end.y).toBeCloseTo(0);
  });

  it('turns rectangles into squares in the dragged direction', () => {
    expect(constrain('rect', pt(10, 10), pt(-20, 40))).toEqual(pt(-20, 40));
    expect(constrain('ellipse', pt(0, 0), pt(30, -10))).toEqual(pt(30, -30));
  });

  it('keeps arrow heads proportional and shorter than the line', () => {
    const [left, right] = arrowHead(pt(0, 0), pt(20, 0), 4);
    expect(left.x).toBeCloseTo(20 - 12 * Math.cos(Math.PI / 7));
    expect(right.y).toBeCloseTo(-left.y);
  });

  it('scales width with pressure only when enabled', () => {
    expect(pressureWidth(10, 0, false)).toBe(10);
    expect(pressureWidth(10, 0, true)).toBeCloseTo(3.5);
    expect(pressureWidth(10, 1, true)).toBeCloseTo(12.5);
  });
});

describe('hitsStroke', () => {
  it('hits a freehand stroke near its path and misses it elsewhere', () => {
    const s = freehand(1, [pt(0, 0), pt(50, 0), pt(50, 50)]);
    expect(hitsStroke(s, pt(25, 4), 3)).toBe(true);
    expect(hitsStroke(s, pt(25, 25), 3)).toBe(false);
  });

  it('hits a rectangle on its outline, not in its middle', () => {
    const rect: Stroke = {
      ...line(2, pt(0, 0), pt(100, 100)),
      geometry: { kind: 'rect', from: pt(0, 0), to: pt(100, 100) },
    };
    expect(hitsStroke(rect, pt(100, 50), 2)).toBe(true);
    expect(hitsStroke(rect, pt(50, 50), 2)).toBe(false);
  });

  it('hits an ellipse on its outline, not at its centre', () => {
    const ellipse: Stroke = {
      ...line(3, pt(0, 0), pt(200, 100)),
      geometry: { kind: 'ellipse', from: pt(0, 0), to: pt(200, 100) },
    };
    expect(hitsStroke(ellipse, pt(200, 50), 2)).toBe(true);
    expect(hitsStroke(ellipse, pt(100, 50), 2)).toBe(false);
  });

  it('hits a single-point stroke within its radius', () => {
    expect(hitsStroke(freehand(4, [pt(10, 10)]), pt(14, 10), 2)).toBe(true);
  });
});

describe('ink history', () => {
  const a = line(1, pt(0, 0), pt(10, 0));
  const b = line(2, pt(0, 10), pt(10, 10));
  const c = line(3, pt(0, 20), pt(10, 20));

  it('undoes and redoes added strokes in order', () => {
    const s = addStroke(addStroke(EMPTY_INK, a), b);
    expect(undo(s).strokes).toEqual([a]);
    expect(redo(undo(s)).strokes).toEqual([a, b]);
  });

  it('restores erased strokes at their original positions', () => {
    const s = [a, b, c].reduce(addStroke, EMPTY_INK);
    const erased = eraseStrokes(s, new Set([1, 3]));
    expect(erased.strokes).toEqual([b]);
    expect(undo(erased).strokes).toEqual([a, b, c]);
  });

  it('treats clear as one undoable step', () => {
    const s = clearStrokes([a, b].reduce(addStroke, EMPTY_INK));
    expect(s.strokes).toEqual([]);
    expect(undo(s).strokes).toEqual([a, b]);
  });

  it('returns the same state when there is nothing to erase, clear, undo or redo', () => {
    expect(clearStrokes(EMPTY_INK)).toBe(EMPTY_INK);
    expect(eraseStrokes(EMPTY_INK, new Set([1]))).toBe(EMPTY_INK);
    expect(undo(EMPTY_INK)).toBe(EMPTY_INK);
    expect(redo(EMPTY_INK)).toBe(EMPTY_INK);
  });

  it('forgets redo after a new step or when told to', () => {
    const undone = undo(addStroke(EMPTY_INK, a));
    expect(addStroke(undone, b).redo).toEqual([]);
    expect(dropRedo(undone).redo).toEqual([]);
  });
});

describe('predictPoint', () => {
  it('extrapolates along the recent velocity', () => {
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 0, t: 5 },
      { x: 20, y: 0, t: 10 },
    ];
    expect(predictPoint(samples, 10, 100)).toEqual({ x: 40, y: 0 });
  });

  it('ignores samples older than the velocity window', () => {
    const samples = [
      { x: 500, y: 500, t: 0 },
      { x: 0, y: 0, t: 100 },
      { x: 0, y: 10, t: 110 },
    ];
    expect(predictPoint(samples, 10, 100)).toEqual({ x: 0, y: 20 });
  });

  it('caps the distance', () => {
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 100, y: 0, t: 1 },
    ];
    expect(predictPoint(samples, 10, 30)).toEqual({ x: 130, y: 0 });
  });

  it('predicts nothing when the pointer is still or has one sample', () => {
    expect(predictPoint([{ x: 5, y: 5, t: 0 }], 10, 30)).toBeNull();
    expect(
      predictPoint(
        [
          { x: 5, y: 5, t: 0 },
          { x: 5, y: 5, t: 8 },
        ],
        10,
        30,
      ),
    ).toBeNull();
  });
});
