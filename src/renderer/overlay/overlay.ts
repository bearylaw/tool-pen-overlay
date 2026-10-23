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
  type Point,
  pressureWidth,
  type ShapeGeometry,
  type Stroke,
} from '../../shared/ink';
import type { AppState, InkOrder } from '../../shared/ipc';
import type { Shape } from '../../shared/settings';
import { api } from '../ui/api';
import { brushCursor } from './cursor';
import { dot, drawSegment, drawShape, drawStroke, prepare } from './paint';

/** A gesture in progress. */
type Gesture =
  | {
      readonly kind: 'freehand';
      readonly stroke: Omit<Stroke, 'geometry'>;
      readonly points: Point[];
      readonly pressure: boolean;
    }
  | {
      readonly kind: 'shape';
      readonly stroke: Omit<Stroke, 'geometry'>;
      readonly shape: Shape;
      readonly from: Point;
      to: Point;
    }
  | { readonly kind: 'erase'; readonly radius: number; readonly hit: Set<number> };

function layer(
  id: string,
  options: CanvasRenderingContext2DSettings,
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.id = id;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d', options);
  if (ctx === null) throw new Error(`canvas 2d context unavailable for #${id}`);
  return [canvas, ctx];
}

// Three layers: finished ink, the stroke being drawn, and a short predicted
// extension of it. The live layers are low-latency (desynchronized) canvases.
const [inkCanvas, inkCtx] = layer('ink', { alpha: true });
const [liveCanvas, liveCtx] = layer('live', { alpha: true, desynchronized: true });
const [predictCanvas, predictCtx] = layer('predict', { alpha: true, desynchronized: true });

let state: AppState | null = null;
let ink: InkState = EMPTY_INK;
let gesture: Gesture | null = null;
let nextId = 1;
let dpr = 1;

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  const width = Math.round(window.innerWidth * dpr);
  const height = Math.round(window.innerHeight * dpr);
  for (const [canvas, ctx] of [
    [inkCanvas, inkCtx],
    [liveCanvas, liveCtx],
    [predictCanvas, predictCtx],
  ] as const) {
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  renderInk();
}

function clearLayer(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function renderInk(): void {
  clearLayer(inkCtx);
  const hidden = gesture?.kind === 'erase' ? gesture.hit : null;
  for (const stroke of ink.strokes)
    if (hidden === null || !hidden.has(stroke.id)) drawStroke(inkCtx, stroke);
}

function setInk(next: InkState, committed: boolean): void {
  if (next === ink) return;
  ink = next;
  renderInk();
  api.reportInk({
    strokeCount: ink.strokes.length,
    canUndo: ink.undo.length > 0,
    canRedo: ink.redo.length > 0,
    committed,
  });
}

function pointOf(event: PointerEvent): Point {
  // Mouse reports 0.5 while pressed; only real pens give useful pressure.
  return {
    x: event.clientX,
    y: event.clientY,
    p: event.pointerType === 'pen' ? event.pressure : 0.5,
  };
}

function strokeStyle(current: AppState): Omit<Stroke, 'geometry'> {
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
    return;
  }
  const stroke = strokeStyle(state);
  liveCanvas.style.opacity = String(stroke.opacity);
  prepare(liveCtx, stroke.color);
  prepare(predictCtx, stroke.color);
  predictCanvas.style.opacity = String(stroke.opacity);
  if (tool === 'shape') {
    gesture = { kind: 'shape', stroke, shape, from: at, to: at };
    return;
  }
  const pressure = tool === 'pen' && event.pointerType === 'pen' && state.settings.drawing.pressure;
  gesture = { kind: 'freehand', stroke, points: [at], pressure };
  dot(liveCtx, at, pressureWidth(stroke.size, at.p, pressure));
}

function extend(event: PointerEvent): void {
  if (gesture === null) return;
  const samples = event.getCoalescedEvents?.() ?? [];
  const events = samples.length > 0 ? samples : [event];
  if (gesture.kind === 'erase') {
    for (const e of events) eraseAt(pointOf(e));
    return;
  }
  if (gesture.kind === 'shape') {
    const last = events[events.length - 1] ?? event;
    gesture.to = pointOf(last);
    drawLiveShape(gesture, last.shiftKey);
    return;
  }
  const { points, stroke, pressure } = gesture;
  if (event.shiftKey) {
    // Shift turns the stroke into a straight line from where it started.
    const first = points[0] as Point;
    gesture = { kind: 'shape', stroke, shape: 'line', from: first, to: pointOf(event) };
    clearLayer(predictCtx);
    drawLiveShape(gesture, true);
    return;
  }
  for (const e of events) {
    const p = pointOf(e);
    const last = points[points.length - 1] as Point;
    if (Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5) continue;
    points.push(p);
    drawSegment(liveCtx, points, points.length - 1, stroke.size, pressure);
  }
  drawPrediction(event, points, stroke.size);
}

/** Extends the line a few milliseconds ahead to hide the remaining input latency. */
function drawPrediction(event: PointerEvent, points: readonly Point[], size: number): void {
  clearLayer(predictCtx);
  const predicted = event.getPredictedEvents?.() ?? [];
  const last = points[points.length - 1];
  const target = predicted[predicted.length - 1];
  if (last === undefined || target === undefined) return;
  const before = points[points.length - 2] ?? last;
  predictCtx.lineWidth = size;
  predictCtx.beginPath();
  predictCtx.moveTo((before.x + last.x) / 2, (before.y + last.y) / 2);
  predictCtx.lineTo(last.x, last.y);
  predictCtx.lineTo(target.clientX, target.clientY);
  predictCtx.stroke();
}

function drawLiveShape(g: Extract<Gesture, { kind: 'shape' }>, constrained: boolean): void {
  clearLayer(liveCtx);
  drawShape(liveCtx, shapeOf(g, constrained), g.stroke.size);
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
  if (changed) renderInk();
}

function finish(event: PointerEvent | null): void {
  const done = gesture;
  if (done === null) return;
  gesture = null;
  clearLayer(predictCtx);
  if (done.kind === 'erase') {
    const next = eraseStrokes(ink, done.hit);
    if (next === ink) renderInk();
    else setInk(next, true);
    return;
  }
  if (done.kind === 'shape') {
    const geometry = shapeOf(done, event?.shiftKey ?? false);
    clearLayer(liveCtx);
    if (geometry.from.x === geometry.to.x && geometry.from.y === geometry.to.y) return;
    setInk(addStroke(ink, { ...done.stroke, geometry }), true);
    return;
  }
  setInk(
    addStroke(ink, {
      ...done.stroke,
      geometry: { kind: 'freehand', points: done.points, pressure: done.pressure },
    }),
    true,
  );
  clearLayer(liveCtx);
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
  const { tool, sizes, color } = next.settings.tool;
  document.body.style.cursor = drawMode ? brushCursor(tool, sizes[tool], color) : 'default';
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
