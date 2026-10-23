import { type HexColor, prefersDarkText } from '../../shared/color';
import type { CursorSize, Shape, Tool } from '../../shared/settings';
import { type IconName, iconMarkup } from '../ui/icons';

// Browsers ignore cursor images larger than 128 px.
const MAX_BOX = 128;
const OUTLINE = '#111111';
const SCALES: Readonly<Record<CursorSize, number>> = { standard: 1, large: 1.5 };

/** What the cursor shows: the tool, its brush size and colour. */
export interface CursorInput {
  readonly tool: Tool;
  readonly shape: Shape;
  readonly size: number;
  readonly color: HexColor;
  readonly cursorSize: CursorSize;
}

/** The cursor image and where its hot spot is, both in CSS pixels. */
export interface CursorImage {
  readonly svg: string;
  readonly box: number;
  readonly hotspot: number;
}

/**
 * Builds the drawing cursor: a centre dot at the exact drawing point, four
 * crosshair ticks, a ring showing the brush size, and a badge in the ink
 * colour with the tool's icon. Every mark has a dark outline under a light
 * line, so the cursor stays visible on any background.
 */
export function cursorImage(input: CursorInput): CursorImage {
  const s = SCALES[input.cursorSize];
  const badge = 10 * s;
  const layout = (ring: number) => {
    const inner = ring > 0 ? ring + 4 * s : 5 * s;
    const outer = inner + 9 * s;
    // The badge sits on the diagonal, clear of the ticks and of the ring.
    const distance = Math.max(ring + badge + 3 * s, (badge + 3 * s) * Math.SQRT2);
    const offset = distance * Math.SQRT1_2;
    const extent = Math.max(outer + 2 * s, offset + badge + 2);
    return { inner, outer, offset, extent };
  };
  const radius = input.size / 2;
  // A brush too big for the image loses its ring; the ticks and the badge
  // still mark the spot.
  const showRing = radius >= 2 && layout(radius).extent * 2 <= MAX_BOX;
  const { inner, outer, offset, extent } = layout(showRing ? radius : 0);
  const box = Math.ceil(extent * 2);
  const c = box / 2;

  const ink = input.tool === 'eraser' ? '#ffffff' : input.color;
  const ticks = [
    [c, c - inner, c, c - outer],
    [c, c + inner, c, c + outer],
    [c - inner, c, c - outer, c],
    [c + inner, c, c + outer, c],
  ]
    .map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`)
    .join('');
  const parts = [
    `<path d="${ticks}" stroke="${OUTLINE}" stroke-width="${4 * s}" stroke-linecap="round"/>`,
    `<path d="${ticks}" stroke="#ffffff" stroke-width="${2 * s}" stroke-linecap="round"/>`,
    showRing
      ? `<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="${OUTLINE}" stroke-width="${3.5 * s}"/>` +
        `<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="${ink}" stroke-width="${1.75 * s}"/>`
      : '',
    `<circle cx="${c}" cy="${c}" r="${2.25 * s}" fill="${OUTLINE}"/>`,
    `<circle cx="${c}" cy="${c}" r="${1.25 * s}" fill="#ffffff"/>`,
    toolBadge(input, c + offset, c + offset, badge, ink),
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" fill="none">${parts.join('')}</svg>`;
  return { svg, box, hotspot: Math.round(c) };
}

function toolBadge(
  input: CursorInput,
  cx: number,
  cy: number,
  r: number,
  ink: HexColor | string,
): string {
  const name: IconName = input.tool === 'shape' ? input.shape : input.tool;
  const glyph = prefersDarkText(ink as HexColor) ? OUTLINE : '#ffffff';
  const scale = (r * 1.25) / 24;
  const offset = 12 * scale;
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r + 1}" fill="${OUTLINE}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="${ink}" stroke="#ffffff" stroke-width="1.5"/>` +
    `<g transform="translate(${cx - offset} ${cy - offset}) scale(${scale})">` +
    iconMarkup(
      name,
      `stroke="${glyph}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"`,
    ) +
    '</g>'
  );
}

/** The CSS `cursor` value for {@link cursorImage}. */
export function brushCursor(input: CursorInput): string {
  const { svg, hotspot } = cursorImage(input);
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot} ${hotspot}, crosshair`;
}
