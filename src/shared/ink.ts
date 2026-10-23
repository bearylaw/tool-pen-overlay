import type { HexColor } from './color';
import type { Shape } from './settings';

/** A sampled pointer position in overlay CSS pixels; `p` is pressure in [0, 1]. */
export interface Point {
  readonly x: number;
  readonly y: number;
  readonly p: number;
}

/** Freehand ink: a polyline smoothed when drawn. */
export interface FreehandGeometry {
  readonly kind: 'freehand';
  readonly points: readonly Point[];
  /** Whether width follows pen pressure (only true for real pen input). */
  readonly pressure: boolean;
}

/** A shape spanned by two points. */
export interface ShapeGeometry {
  readonly kind: Shape;
  readonly from: Point;
  readonly to: Point;
}

/** One finished mark on an overlay. */
export interface Stroke {
  readonly id: number;
  readonly color: HexColor;
  readonly size: number;
  readonly opacity: number;
  readonly geometry: FreehandGeometry | ShapeGeometry;
}

/** Axis-aligned bounds. */
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Line width for a pressure sample. Pen pressure maps [0, 1] to
 * [0.35, 1.25] × size so a light touch stays visible and a firm one
 * is a little bolder than the nominal size.
 */
export function pressureWidth(size: number, pressure: number, usePressure: boolean): number {
  if (!usePressure) return size;
  const p = Math.min(1, Math.max(0, pressure));
  return Math.max(0.5, size * (0.35 + 0.9 * p));
}

/** Midpoint of two points; pressure averaged. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: (a.p + b.p) / 2 };
}

/**
 * Constrains the end point while Shift is held: lines snap to 15° steps,
 * rectangles and ellipses become squares and circles.
 */
export function constrain(kind: Shape, from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (kind === 'rect' || kind === 'ellipse') {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      x: from.x + Math.sign(dx || 1) * side,
      y: from.y + Math.sign(dy || 1) * side,
      p: to.p,
    };
  }
  const length = Math.hypot(dx, dy);
  const step = Math.PI / 12;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return {
    x: from.x + Math.cos(angle) * length,
    y: from.y + Math.sin(angle) * length,
    p: to.p,
  };
}

/**
 * The two outer corners of an arrow head at `to`, sized from the line width
 * so thin and thick arrows both look proportioned.
 */
export function arrowHead(from: Point, to: Point, size: number): readonly [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = Math.min(Math.max(10, size * 4), Math.hypot(to.x - from.x, to.y - from.y) * 0.6);
  const spread = Math.PI / 7;
  const corner = (offset: number): Point => ({
    x: to.x - Math.cos(angle + offset) * length,
    y: to.y - Math.sin(angle + offset) * length,
    p: to.p,
  });
  return [corner(spread), corner(-spread)];
}

/** Bounds of a stroke including half its line width. */
export function strokeBounds(stroke: Stroke): Bounds {
  const points = outlinePoints(stroke);
  const pad = stroke.size;
  return points.reduce<Bounds>(
    (b, pt) => ({
      minX: Math.min(b.minX, pt.x - pad),
      minY: Math.min(b.minY, pt.y - pad),
      maxX: Math.max(b.maxX, pt.x + pad),
      maxY: Math.max(b.maxY, pt.y + pad),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

/** True when a circle of `radius` around `at` touches the stroke's ink. */
export function hitsStroke(stroke: Stroke, at: Point, radius: number): boolean {
  const b = strokeBounds(stroke);
  if (at.x < b.minX - radius || at.x > b.maxX + radius) return false;
  if (at.y < b.minY - radius || at.y > b.maxY + radius) return false;
  const reach = radius + stroke.size / 2;
  const g = stroke.geometry;
  if (g.kind === 'ellipse') return hitsEllipse(g.from, g.to, at, reach);
  const polyline = g.kind === 'freehand' ? g.points : shapePolyline(stroke);
  return hitsPolyline(polyline, at, reach);
}

/** Distance from `p` to the segment a–b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hitsPolyline(points: readonly Point[], at: Point, reach: number): boolean {
  const first = points[0];
  if (first === undefined) return false;
  if (points.length === 1) return Math.hypot(at.x - first.x, at.y - first.y) <= reach;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined && distanceToSegment(at, a, b) <= reach) return true;
  }
  return false;
}

function hitsEllipse(from: Point, to: Point, at: Point, reach: number): boolean {
  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2;
  const rx = Math.abs(to.x - from.x) / 2;
  const ry = Math.abs(to.y - from.y) / 2;
  if (rx < 1 || ry < 1) return hitsPolyline([from, to], at, reach);
  // Distance to the outline, approximated by scaling the radial distance.
  const angle = Math.atan2((at.y - cy) / ry, (at.x - cx) / rx);
  const edge = { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle), p: 0 };
  return Math.hypot(at.x - edge.x, at.y - edge.y) <= reach;
}

/** The polyline that traces a line, arrow or rectangle. */
function shapePolyline(stroke: Stroke): readonly Point[] {
  const g = stroke.geometry;
  if (g.kind === 'freehand' || g.kind === 'ellipse') return outlinePoints(stroke);
  const { from, to } = g;
  if (g.kind === 'line') return [from, to];
  if (g.kind === 'arrow') {
    const [left, right] = arrowHead(from, to, stroke.size);
    return [from, to, left, to, right];
  }
  return [from, { x: to.x, y: from.y, p: 0 }, to, { x: from.x, y: to.y, p: 0 }, from];
}

function outlinePoints(stroke: Stroke): readonly Point[] {
  const g = stroke.geometry;
  if (g.kind === 'freehand') return g.points;
  if (g.kind === 'arrow') return [g.from, g.to, ...arrowHead(g.from, g.to, stroke.size)];
  return [g.from, g.to];
}
