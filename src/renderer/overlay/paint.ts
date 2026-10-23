import {
  arrowHead,
  midpoint,
  type Point,
  pressureWidth,
  type ShapeGeometry,
  type Stroke,
} from '../../shared/ink';

/** Applies the line style every stroke uses. */
export function prepare(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
}

/** Draws one finished stroke. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  ctx.save();
  prepare(ctx, stroke.color);
  ctx.globalAlpha = stroke.opacity;
  const g = stroke.geometry;
  if (g.kind === 'freehand') {
    if (g.pressure) drawPressureFreehand(ctx, g.points, stroke.size);
    else drawUniformFreehand(ctx, g.points, stroke.size);
  } else {
    drawShape(ctx, g, stroke.size);
  }
  ctx.restore();
}

/**
 * The smoothed path through the points: straight to the first midpoint,
 * quadratic curves between midpoints with each sample as control point,
 * straight to the last sample. One path, so translucent ink never darkens
 * where segments meet.
 */
function drawUniformFreehand(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
): void {
  const first = points[0];
  if (first === undefined) return;
  if (points.length === 1) {
    dot(ctx, first, size);
    return;
  }
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  const second = points[1] as Point;
  const start = midpoint(first, second);
  ctx.lineTo(start.x, start.y);
  for (let i = 1; i < points.length - 1; i++) {
    const control = points[i] as Point;
    const end = midpoint(control, points[i + 1] as Point);
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
  }
  const last = points[points.length - 1] as Point;
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/** Same curve as {@link drawUniformFreehand}, one segment at a time so each gets its own width. */
function drawPressureFreehand(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
): void {
  const first = points[0];
  if (first === undefined) return;
  if (points.length === 1) {
    dot(ctx, first, pressureWidth(size, first.p, true));
    return;
  }
  for (let i = 1; i < points.length; i++) drawSegment(ctx, points, i, size, true);
  drawTail(ctx, points, size, true);
}

/**
 * Draws the piece of the smoothed curve that point `i` completes. Used live
 * while drawing so each new sample costs constant time.
 */
export function drawSegment(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  i: number,
  size: number,
  usePressure: boolean,
): void {
  const current = points[i];
  const previous = points[i - 1];
  if (current === undefined || previous === undefined) return;
  const end = midpoint(previous, current);
  ctx.beginPath();
  if (i === 1) {
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(end.x, end.y);
  } else {
    const start = midpoint(points[i - 2] as Point, previous);
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(previous.x, previous.y, end.x, end.y);
  }
  ctx.lineWidth = pressureWidth(size, (previous.p + current.p) / 2, usePressure);
  ctx.stroke();
}

/** The last half-segment, from the final midpoint to the final sample. */
export function drawTail(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  size: number,
  usePressure: boolean,
): void {
  const last = points[points.length - 1];
  const before = points[points.length - 2];
  if (last === undefined || before === undefined) return;
  const start = midpoint(before, last);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(last.x, last.y);
  ctx.lineWidth = pressureWidth(size, last.p, usePressure);
  ctx.stroke();
}

/** A filled round dot, for a tap without movement. */
export function dot(ctx: CanvasRenderingContext2D, at: Point, width: number): void {
  ctx.beginPath();
  ctx.arc(at.x, at.y, width / 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Draws a line, arrow, rectangle or ellipse. */
export function drawShape(ctx: CanvasRenderingContext2D, g: ShapeGeometry, size: number): void {
  const { from, to } = g;
  ctx.lineWidth = size;
  ctx.beginPath();
  switch (g.kind) {
    case 'line':
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      break;
    case 'arrow': {
      const [left, right] = arrowHead(from, to, size);
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(to.x, to.y);
      ctx.lineTo(right.x, right.y);
      break;
    }
    case 'rect':
      ctx.rect(
        Math.min(from.x, to.x),
        Math.min(from.y, to.y),
        Math.abs(to.x - from.x),
        Math.abs(to.y - from.y),
      );
      break;
    case 'ellipse':
      ctx.ellipse(
        (from.x + to.x) / 2,
        (from.y + to.y) / 2,
        Math.abs(to.x - from.x) / 2,
        Math.abs(to.y - from.y) / 2,
        0,
        0,
        Math.PI * 2,
      );
      break;
  }
  ctx.stroke();
}
