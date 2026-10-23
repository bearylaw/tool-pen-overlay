/** An SVG primitive inside a 24 × 24 icon, drawn with the current text colour. */
type Part =
  | { readonly path: string }
  | { readonly circle: readonly [cx: number, cy: number, r: number]; readonly fill?: boolean }
  | { readonly rect: readonly [x: number, y: number, w: number, h: number, r: number] }
  | { readonly ellipse: readonly [cx: number, cy: number, rx: number, ry: number] };

const ICONS = {
  cursor: [{ path: 'M5.5 3.5 19 10l-6.2 1.9a1 1 0 0 0-.7.7L10.2 19z' }],
  pen: [
    { path: 'M15.3 4.7a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L9 19l-4.5 1 1-4.5z' },
    { path: 'm13.5 6.5 4 4' },
  ],
  highlighter: [
    { path: 'm9.5 14.5-3 3 1 1H4l2.5-2.5' },
    { path: 'M8.5 12.5 16.6 4.4a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8l-8.1 8.1-3.5.5z' },
    { path: 'M13 20h7' },
  ],
  line: [{ path: 'M5 19 19 5' }],
  arrow: [{ path: 'M5 19 19 5' }, { path: 'M10 5h9v9' }],
  rect: [{ rect: [4, 6, 16, 12, 2] }],
  ellipse: [{ ellipse: [12, 12, 8.5, 6.5] }],
  eraser: [
    {
      path: 'M14.1 4.2a1.6 1.6 0 0 1 2.3 0l3.4 3.4a1.6 1.6 0 0 1 0 2.3L11 18.7H7.4l-3.2-3.2a1.6 1.6 0 0 1 0-2.3z',
    },
    { path: 'm8.6 9.6 5.8 5.8' },
    { path: 'M11 18.7h9' },
  ],
  undo: [{ path: 'M9 14 4 9l5-5' }, { path: 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11' }],
  redo: [{ path: 'm15 14 5-5-5-5' }, { path: 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13' }],
  trash: [
    { path: 'M4 7h16' },
    { path: 'M6 7l.9 11.2A2 2 0 0 0 8.9 20h6.2a2 2 0 0 0 2-1.8L18 7' },
    { path: 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' },
    { path: 'M10 11v5M14 11v5' },
  ],
  eye: [
    { path: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' },
    { circle: [12, 12, 3] },
  ],
  eyeOff: [
    { path: 'M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.2' },
    { path: 'M6.6 6.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 5.4-1.7' },
    { path: 'M9.9 9.9a3 3 0 0 0 4.2 4.2' },
    { path: 'm3 3 18 18' },
  ],
  settings: [
    { path: 'M4 7h9M18 7h2M4 17h3M12 17h8' },
    { circle: [15.5, 7, 2.5] },
    { circle: [9.5, 17, 2.5] },
  ],
  plus: [{ path: 'M12 5v14M5 12h14' }],
  minus: [{ path: 'M5 12h14' }],
  edit: [{ path: 'M4 20h4L19 9l-4-4L4 16z' }, { path: 'm13 7 4 4' }],
  close: [{ path: 'M6 6l12 12M18 6 6 18' }],
  eyedropper: [
    { path: 'm12.5 7.5 4 4' },
    { path: 'M14.5 9.5 6.2 17.8 4 20' },
    { path: 'M13.5 6.5 16 4a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3l-2.5 2.5' },
  ],
  grip: [
    { circle: [9, 6, 1.4], fill: true },
    { circle: [15, 6, 1.4], fill: true },
    { circle: [9, 12, 1.4], fill: true },
    { circle: [15, 12, 1.4], fill: true },
    { circle: [9, 18, 1.4], fill: true },
    { circle: [15, 18, 1.4], fill: true },
  ],
  power: [{ path: 'M12 3v8' }, { path: 'M6.3 6.8a8 8 0 1 0 11.4 0' }],
} as const satisfies Record<string, readonly Part[]>;

export type IconName = keyof typeof ICONS;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Builds an icon as DOM nodes; decorative, so hidden from screen readers. */
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon');
  for (const part of ICONS[name] as readonly Part[]) svg.append(element(part));
  return svg;
}

function element(part: Part): SVGElement {
  if ('path' in part) return withAttrs('path', { d: part.path });
  if ('circle' in part) {
    const [cx, cy, r] = part.circle;
    const circle = withAttrs('circle', { cx, cy, r });
    if (part.fill === true) circle.classList.add('filled');
    return circle;
  }
  if ('rect' in part) {
    const [x, y, width, height, rx] = part.rect;
    return withAttrs('rect', { x, y, width, height, rx });
  }
  const [cx, cy, rx, ry] = part.ellipse;
  return withAttrs('ellipse', { cx, cy, rx, ry });
}

function withAttrs(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
