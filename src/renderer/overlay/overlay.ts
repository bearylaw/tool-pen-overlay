import './overlay.css';
import {
  addStroke,
  clearStrokes,
  dropRedo,
  EMPTY_INK,
  eraseStrokes,
  type InkState,
  redo,
  undo,
} from '../../shared/history';
import {
  constrain,
  hitsStroke,
  midpoint,
  type Point,
  predictPoint,
  pressureWidth,
  type Sample,
  type ShapeGeometry,
  type Stroke,
} from '../../shared/ink';
import type { AppState, InkOrder } from '../../shared/ipc';
import type { Shape } from '../../shared/settings';
import { api } from '../ui/api';
import { brushCursor } from '../ui/cursor';
import { dot, drawSegment, drawShape, drawStroke, prepare } from './paint';

/** How far ahead of the newest sample the tip is drawn: about one frame. */
const PREDICT_MS = 12;
/** Samples kept for the velocity estimate. */
const SAMPLE_HISTORY = 8;

type Style = Omit<Stroke, 'geometry'>;

/** A gesture in progress. */
type Gesture =
  | {
      readonly kind: 'freehand';
      readonly stroke: Style;
      readonly points: Point[];
      readonly samples: Sample[];
      readonly pressure: boolean;
      /** Index of the last point already painted on the live layer. */
      drawn: number;
    }
  | {
      readonly kind: 'shape';
      readonly stroke: Style;
      readonly shape: Shape;
      readonly from: Point;
      to: Point;
      constrained: boolean;
    }
  | { readonly kind: 'erase'; readonly radius: number; readonly hit: Set<number> };

/** An axis-aligned area in CSS pixels that needs clearing later. */
interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function layer(
  id: string,
  parent: HTMLElement,
  options: CanvasRenderingContext2DSettings,
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.id = id;
  parent.append(canvas);
  const ctx = canvas.getContext('2d', options);
  if (ctx === null) throw new Error(`canvas 2d context unavailable for #${id}`);
  return [canvas, ctx];
}

// Finished ink sits on its own layer and is only repainted when strokes are
// removed. The stroke being drawn and its predicted tip share a group, so a
// translucent highlighter gets its opacity once for both and never darkens
// where they meet.
//
// Input arrives far more often than the display refreshes (pens report at
// 200 Hz and more). Every event only records samples; painting happens once
// per frame, right before it is composited. Painting per event made the GPU
// fall behind and the lag grow the longer a stroke lasted.
const [inkCanvas, inkCtx] = layer('ink', document.body, { alpha: true });
const group = document.createElement('div');
group.id = 'stroke';
document.body.append(group);
const [liveCanvas, liveCtx] = layer('live', group, { alpha: true });
const [tipCanvas, tipCtx] = layer('tip', group, { alpha: true });

let state: AppState | null = null;
let ink: InkState = EMPTY_INK;
let gesture: Gesture | null = null;
let nextId = 1;
let liveBox: Box | null = null;
let tipBox: Box | null = null;
let cursorKey = '';
let frameRequested = false;
let inkDirty = false;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(window.innerWidth * dpr);
  const height = Math.round(window.innerHeight * dpr);
  for (const [canvas, ctx] of [
    [inkCanvas, inkCtx],
    [liveCanvas, liveCtx],
    [tipCanvas, tipCtx],
  ] as const) {
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  renderInk();
}

function clearAll(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** Clears only the area last drawn into, so each frame touches few pixels. */
function clearBox(ctx: CanvasRenderingContext2D, box: Box | null): void {
  if (box === null) return;
  ctx.clearRect(box.minX - 1, box.minY - 1, box.maxX - box.minX + 2, box.maxY - box.minY + 2);
}

function boxAround(points: readonly { x: number; y: number }[], pad: number): Box {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) grow(box, p, pad);
  return box;
}

function grow(box: Box, p: { x: number; y: number }, pad: number): void {
  box.minX = Math.min(box.minX, p.x - pad);
  box.minY = Math.min(box.minY, p.y - pad);
  box.maxX = Math.max(box.maxX, p.x + pad);
  box.maxY = Math.max(box.maxY, p.y + pad);
}

function renderInk(): void {
  clearAll(inkCtx);
  const hidden = gesture?.kind === 'erase' ? gesture.hit : null;
  for (const stroke of ink.strokes) {
    if (hidden === null || !hidden.has(stroke.id)) drawStroke(inkCtx, stroke);
  }
}

function report(committed: boolean): void {
  api.reportInk({
    strokeCount: ink.strokes.length,
    canUndo: ink.undo.length > 0,
    canRedo: ink.redo.length > 0,
    committed,
  });
}

/** Replaces the strokes (undo, redo, erase, clear) and repaints them all. */
function setInk(next: InkState, committed: boolean): void {
  if (next === ink) return;
  ink = next;
  renderInk();
  report(committed);
}

/** Adds a finished stroke by painting just that stroke on top. */
function commit(stroke: Stroke): void {
  ink = addStroke(ink, stroke);
  drawStroke(inkCtx, stroke);
  report(true);
}

function pointOf(event: PointerEvent): Point {
  // Mouse reports 0.5 while pressed; only real pens give useful pressure.
  return {
    x: event.clientX,
    y: event.clientY,
    p: event.pointerType === 'pen' ? event.pressure : 0.5,
  };
}

function strokeStyle(current: AppState): Style {
  const { tool, color, sizes } = current.settings.tool;
  return {
    id: nextId++,
    color,
    size: sizes[tool],
    opacity: tool === 'highlighter' ? current.settings.drawing.highlighterOpacity : 1,
  };
}

function isPenEraser(event: PointerEvent): boolean {
  // Bit 32 is the eraser end of a pen (Pointer Events spec).
  return event.pointerType === 'pen' && (event.buttons & 32) !== 0;
}

function begin(event: PointerEvent): void {
  if (state === null || !state.runtime.drawMode || gesture !== null) return;
  if (event.button !== 0 && !isPenEraser(event)) return;
  if (state.runtime.panel !== null) api.intent({ type: 'closePanel' });
  liveCanvas.setPointerCapture(event.pointerId);
  const { tool, shape, sizes } = state.settings.tool;
  const at = pointOf(event);
  if (tool === 'eraser' || isPenEraser(event)) {
    gesture = { kind: 'erase', radius: sizes.eraser / 2, hit: new Set() };
    eraseAt(at);
    requestPaint();
    return;
  }
  const stroke = strokeStyle(state);
  // Opacity only when needed: an effect on the group can take the canvases
  // off the fastest presentation path.
  group.style.opacity = stroke.opacity < 1 ? String(stroke.opacity) : '';
  prepare(liveCtx, stroke.color);
  prepare(tipCtx, stroke.color);
  if (tool === 'shape') {
    gesture = { kind: 'shape', stroke, shape, from: at, to: at, constrained: false };
    return;
  }
  const pressure = tool === 'pen' && event.pointerType === 'pen' && state.settings.drawing.pressure;
  gesture = {
    kind: 'freehand',
    stroke,
    points: [at],
    samples: [{ x: at.x, y: at.y, t: event.timeStamp }],
    pressure,
    drawn: 0,
  };
  const width = pressureWidth(stroke.size, at.p, pressure);
  dot(liveCtx, at, width);
  liveBox = boxAround([at], width);
}

function extend(event: PointerEvent): void {
  if (gesture === null) return;
  const coalesced = event.getCoalescedEvents?.() ?? [];
  const events = coalesced.length > 0 ? coalesced : [event];
  if (gesture.kind === 'erase') {
    for (const e of events) eraseAt(pointOf(e));
  } else if (gesture.kind === 'shape') {
    gesture.to = pointOf(events[events.length - 1] ?? event);
    gesture.constrained = event.shiftKey;
  } else if (event.shiftKey) {
    // Shift turns the stroke into a straight line from where it started.
    const { points, stroke } = gesture;
    clearLive();
    const from = points[0] as Point;
    gesture = { kind: 'shape', stroke, shape: 'line', from, to: pointOf(event), constrained: true };
  } else {
    record(gesture, events);
  }
  requestPaint();
}

function record(g: Extract<Gesture, { kind: 'freehand' }>, events: readonly PointerEvent[]): void {
  const { points, samples } = g;
  for (const e of events) {
    const p = pointOf(e);
    const last = points[points.length - 1] as Point;
    if (Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5) continue;
    points.push(p);
    samples.push({ x: p.x, y: p.y, t: e.timeStamp });
    if (samples.length > SAMPLE_HISTORY) samples.shift();
  }
}

function requestPaint(): void {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(paint);
}

/** Paints everything recorded since the last frame. */
function paint(): void {
  frameRequested = false;
  if (inkDirty) {
    inkDirty = false;
    renderInk();
  }
  if (gesture?.kind === 'shape') drawLiveShape(gesture, gesture.constrained);
  if (gesture?.kind !== 'freehand') return;
  const { points, stroke, pressure } = gesture;
  const pad = stroke.size + 2;
  for (let i = gesture.drawn + 1; i < points.length; i++) {
    drawSegment(liveCtx, points, i, stroke.size, pressure);
    if (liveBox !== null) grow(liveBox, points[i] as Point, pad);
  }
  gesture.drawn = points.length - 1;
  drawTip(gesture);
}

/**
 * The smoothed curve stops half a sample behind the pointer, and a frame
 * reaches the screen a little after it is painted. The tip layer closes the
 * gap and runs ahead along the current velocity, so the ink stays under the
 * pointer even when moving fast.
 */
function drawTip(g: Extract<Gesture, { kind: 'freehand' }>): void {
  clearBox(tipCtx, tipBox);
  tipBox = null;
  const last = g.points[g.points.length - 1];
  const before = g.points[g.points.length - 2];
  if (last === undefined || before === undefined) return;
  const start = midpoint(before, last);
  const ahead = predictPoint(g.samples, PREDICT_MS, Math.max(24, g.stroke.size * 4));
  tipCtx.lineWidth = pressureWidth(g.stroke.size, last.p, g.pressure);
  tipCtx.beginPath();
  tipCtx.moveTo(start.x, start.y);
  tipCtx.lineTo(last.x, last.y);
  if (ahead !== null) tipCtx.lineTo(ahead.x, ahead.y);
  tipCtx.stroke();
  tipBox = boxAround(ahead === null ? [start, last] : [start, last, ahead], tipCtx.lineWidth + 2);
}

function drawLiveShape(g: Extract<Gesture, { kind: 'shape' }>, constrained: boolean): void {
  clearBox(liveCtx, liveBox);
  const geometry = shapeOf(g, constrained);
  drawShape(liveCtx, geometry, g.stroke.size);
  // Arrow heads reach up to four line widths past the end point.
  liveBox = boxAround([geometry.from, geometry.to], g.stroke.size * 5 + 4);
}

function shapeOf(g: Extract<Gesture, { kind: 'shape' }>, constrained: boolean): ShapeGeometry {
  return { kind: g.shape, from: g.from, to: constrained ? constrain(g.shape, g.from, g.to) : g.to };
}

function eraseAt(at: Point): void {
  if (gesture?.kind !== 'erase') return;
  let changed = false;
  for (const stroke of ink.strokes) {
    if (!gesture.hit.has(stroke.id) && hitsStroke(stroke, at, gesture.radius)) {
      gesture.hit.add(stroke.id);
      changed = true;
    }
  }
  // Repainted with the next frame, however many hits arrive before it.
  if (changed) inkDirty = true;
}

function clearLive(): void {
  clearBox(liveCtx, liveBox);
  clearBox(tipCtx, tipBox);
  liveBox = null;
  tipBox = null;
}

function finish(event: PointerEvent | null): void {
  const done = gesture;
  if (done === null) return;
  gesture = null;
  inkDirty = false;
  if (done.kind === 'erase') {
    const next = eraseStrokes(ink, done.hit);
    if (next === ink) renderInk();
    else setInk(next, true);
    return;
  }
  // Paint the finished stroke first, then clear the live layers, so no frame
  // shows the stroke missing.
  if (done.kind === 'shape') {
    const geometry = shapeOf(done, event?.shiftKey ?? done.constrained);
    if (geometry.from.x !== geometry.to.x || geometry.from.y !== geometry.to.y) {
      commit({ ...done.stroke, geometry });
    }
  } else {
    commit({
      ...done.stroke,
      geometry: { kind: 'freehand', points: done.points, pressure: done.pressure },
    });
  }
  clearLive();
}

function obey(order: InkOrder): void {
  finish(null);
  if (order.type === 'dropRedo') {
    ink = dropRedo(ink);
    return;
  }
  const apply = { undo, redo, clear: clearStrokes }[order.type];
  setInk(apply(ink), false);
}

function applyState(next: AppState): void {
  state = next;
  const { drawMode, inkVisible } = next.runtime;
  if (!drawMode) finish(null);
  document.body.classList.toggle('hidden', !inkVisible);
  const { tool, shape, sizes, color } = next.settings.tool;
  const { cursorSize, cursorStyle, highlighterOpacity } = next.settings.drawing;
  const opacity = tool === 'highlighter' ? highlighterOpacity : 1;
  const key = drawMode
    ? `${cursorStyle}:${tool}:${shape}:${sizes[tool]}:${color}:${opacity}:${cursorSize}`
    : 'off';
  if (key !== cursorKey) {
    cursorKey = key;
    document.body.style.cursor = drawMode
      ? brushCursor({
          style: cursorStyle,
          tool,
          shape,
          size: sizes[tool],
          color,
          opacity,
          cursorSize,
        })
      : 'default';
  }
}

// pointerrawupdate arrives as soon as the OS reports movement instead of once
// per frame; it is the lowest-latency source where available.
const moveEvent = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';
liveCanvas.addEventListener('pointerdown', begin);
liveCanvas.addEventListener(moveEvent, (event) => extend(event as PointerEvent));
liveCanvas.addEventListener('pointerup', finish);
liveCanvas.addEventListener('pointercancel', finish);
liveCanvas.addEventListener('lostpointercapture', () => finish(null));
liveCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('resize', resize);

api.onState(applyState);
api.onInkOrder(obey);
resize();
