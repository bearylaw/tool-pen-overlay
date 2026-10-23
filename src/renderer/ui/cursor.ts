import { type HexColor, prefersDarkText } from '../../shared/color';
import type { CursorSize, CursorStyle, Shape, Tool } from '../../shared/settings';
import { type IconName, iconMarkup } from './icons';

// Browsers ignore cursor images larger than 128 px.
const MAX_BOX = 128;
const OUTLINE = '#111111';
const LIGHT = '#ffffff';
const SCALES: Readonly<Record<CursorSize, number>> = { standard: 1, large: 1.5 };

/** What the cursor shows: the tool, its brush size and colour, and the chosen look. */
export interface CursorInput {
  readonly style: CursorStyle;
  readonly tool: Tool;
  readonly shape: Shape;
  readonly size: number;
  readonly color: HexColor;
  /** Ink opacity, so the brush preview matches the highlighter. */
  readonly opacity: number;
  readonly cursorSize: CursorSize;
}

/** The cursor image and its hot spot (the drawing point), in CSS pixels. */
export interface CursorImage {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly hotspotX: number;
  readonly hotspotY: number;
}

/** Builds the cursor image for the chosen style. */
export function cursorImage(input: CursorInput): CursorImage {
  switch (input.style) {
    case 'target':
      return targetCursor(input, true);
    case 'crosshair':
      return targetCursor(input, false);
    case 'tool':
      return toolCursor(input);
    case 'dot':
      return dotCursor(input);
    case 'spotlight':
      return spotlightCursor(input);
  }
}

/** The CSS `cursor` value for {@link cursorImage}. */
export function brushCursor(input: CursorInput): string {
  const { svg, hotspotX, hotspotY } = cursorImage(input);
  return `url("${cursorDataUrl(svg)}") ${hotspotX} ${hotspotY}, crosshair`;
}

/** The image as a data URL, for CSS cursors and previews. */
export function cursorDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function inkOf(input: CursorInput): string {
  return input.tool === 'eraser' ? LIGHT : input.color;
}

function wrap(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">${body}</svg>`;
}

/** A light mark over a dark one of twice the width: visible on any background. */
function outlined(d: string, width: number): string {
  return (
    `<path d="${d}" stroke="${OUTLINE}" stroke-width="${width * 2}" stroke-linecap="round"/>` +
    `<path d="${d}" stroke="${LIGHT}" stroke-width="${width}" stroke-linecap="round"/>`
  );
}

function centreDot(c: number, s: number): string {
  return (
    `<circle cx="${c}" cy="${c}" r="${2.25 * s}" fill="${OUTLINE}"/>` +
    `<circle cx="${c}" cy="${c}" r="${1.25 * s}" fill="${LIGHT}"/>`
  );
}

function ring(c: number, r: number, color: string, s: number): string {
  return (
    `<circle cx="${c}" cy="${c}" r="${r}" stroke="${OUTLINE}" stroke-width="${3.5 * s}"/>` +
    `<circle cx="${c}" cy="${c}" r="${r}" stroke="${color}" stroke-width="${1.75 * s}"/>`
  );
}

function square(box: number, hotspot: number, body: string): CursorImage {
  return {
    svg: wrap(box, box, body),
    width: box,
    height: box,
    hotspotX: hotspot,
    hotspotY: hotspot,
  };
}

/**
 * Crosshair ticks around a centre dot at the drawing point, a ring of the
 * brush size, and optionally a badge in the ink colour with the tool icon.
 */
function targetCursor(input: CursorInput, withBadge: boolean): CursorImage {
  const s = SCALES[input.cursorSize];
  const badge = 10 * s;
  const layout = (r: number) => {
    const inner = r > 0 ? r + 4 * s : 5 * s;
    const outer = inner + 9 * s;
    // The badge sits on the diagonal, clear of the ticks and of the ring.
    const distance = Math.max(r + badge + 3 * s, (badge + 3 * s) * Math.SQRT2);
    const offset = distance * Math.SQRT1_2;
    const extent = Math.max(outer + 2 * s, withBadge ? offset + badge + 2 : 0);
    return { inner, outer, offset, extent };
  };
  const radius = input.size / 2;
  // A brush too big for the image loses its ring; the ticks still mark the spot.
  const showRing = radius >= 2 && layout(radius).extent * 2 <= MAX_BOX;
  const { inner, outer, offset, extent } = layout(showRing ? radius : 0);
  const box = Math.ceil(extent * 2);
  const c = box / 2;
  const ticks = [
    [c, c - inner, c, c - outer],
    [c, c + inner, c, c + outer],
    [c - inner, c, c - outer, c],
    [c + inner, c, c + outer, c],
  ]
    .map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`)
    .join('');
  const body = [
    outlined(ticks, 2 * s),
    showRing ? ring(c, radius, inkOf(input), s) : '',
    centreDot(c, s),
    withBadge ? toolBadge(input, c + offset, badge) : '',
  ].join('');
  return square(box, Math.round(c), body);
}

function iconName(input: CursorInput): IconName {
  return input.tool === 'shape' ? input.shape : input.tool;
}

function toolBadge(input: CursorInput, centre: number, r: number): string {
  const ink = inkOf(input);
  const glyph = prefersDarkText(ink as HexColor) ? OUTLINE : LIGHT;
  const scale = (r * 1.25) / 24;
  const shift = centre - 12 * scale;
  return (
    `<circle cx="${centre}" cy="${centre}" r="${r + 1}" fill="${OUTLINE}"/>` +
    `<circle cx="${centre}" cy="${centre}" r="${r - 0.5}" fill="${ink}" stroke="${LIGHT}" stroke-width="1.5"/>` +
    `<g transform="translate(${shift} ${shift}) scale(${scale})">` +
    iconMarkup(
      iconName(input),
      `stroke="${glyph}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`,
    ) +
    '</g>'
  );
}

/** Where each icon touches the paper, in its 24-unit grid. */
const TIPS: Readonly<Partial<Record<IconName, readonly [number, number]>>> = {
  pen: [4.5, 20],
  highlighter: [4, 19],
  eraser: [7.4, 18.7],
  line: [5, 19],
  arrow: [5, 19],
  rect: [4, 18],
  ellipse: [3.5, 12],
};

/** Just the tool: a large pen, highlighter, eraser or shape icon, its tip at the drawing point. */
function toolCursor(input: CursorInput): CursorImage {
  const s = SCALES[input.cursorSize];
  const size = Math.round(36 * s);
  const scale = size / 24;
  const name = iconName(input);
  const [tipX, tipY] = TIPS[name] ?? [12, 12];
  const pad = 4 * s;
  const box = size + pad * 2;
  const style = (color: string, width: number): string =>
    `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
  const hotspotX = Math.round(pad + tipX * scale);
  const hotspotY = Math.round(pad + tipY * scale);
  const body =
    `<g transform="translate(${pad} ${pad}) scale(${scale})">` +
    iconMarkup(name, style(OUTLINE, 4.2)) +
    iconMarkup(name, style(LIGHT, 1.9)) +
    '</g>' +
    `<circle cx="${hotspotX}" cy="${hotspotY}" r="${3.2 * s}" fill="${OUTLINE}"/>` +
    `<circle cx="${hotspotX}" cy="${hotspotY}" r="${2.2 * s}" fill="${inkOf(input)}"/>`;
  return { svg: wrap(box, box, body), width: box, height: box, hotspotX, hotspotY };
}

/** A preview of the stroke itself: a dot of the brush's size, colour and opacity. */
function dotCursor(input: CursorInput): CursorImage {
  const s = SCALES[input.cursorSize];
  const radius = Math.min(Math.max(input.size / 2, 4.5 * s), MAX_BOX / 2 - 4);
  const box = Math.ceil((radius + 3 * s) * 2);
  const c = box / 2;
  const fill =
    input.tool === 'eraser'
      ? ''
      : `<circle cx="${c}" cy="${c}" r="${radius}" fill="${input.color}" fill-opacity="${input.opacity}"/>`;
  const body =
    fill +
    `<circle cx="${c}" cy="${c}" r="${radius + 0.75 * s}" stroke="${OUTLINE}" stroke-width="${1.5 * s}"/>` +
    `<circle cx="${c}" cy="${c}" r="${radius + 2 * s}" stroke="${LIGHT}" stroke-width="${1.25 * s}"/>`;
  return square(box, Math.round(c), body);
}

/**
 * A large, soft yellow halo around the drawing point, as presenters use so
 * an audience can follow the pen, with the brush ring and centre dot inside.
 */
function spotlightCursor(input: CursorInput): CursorImage {
  const s = SCALES[input.cursorSize];
  const radius = input.size / 2;
  const halo = Math.min(Math.max(26 * s, radius + 10 * s), MAX_BOX / 2 - 2);
  const box = Math.ceil(halo * 2 + 4);
  const c = box / 2;
  const body =
    `<circle cx="${c}" cy="${c}" r="${halo}" fill="#facc15" fill-opacity=".28" stroke="#eab308" stroke-opacity=".9" stroke-width="${2 * s}"/>` +
    (radius >= 2 && radius < halo - 4 ? ring(c, radius, inkOf(input), s) : '') +
    centreDot(c, s);
  return square(box, Math.round(c), body);
}
