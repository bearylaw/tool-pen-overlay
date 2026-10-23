import type { HexColor } from '../../shared/color';
import type { Tool } from '../../shared/settings';

// Browsers ignore cursor images above 128 px; beyond that a crosshair is clearer anyway.
const MAX_CURSOR = 120;

/**
 * A CSS cursor that previews the brush: a ring of the brush size in the
 * ink colour with a contrasting halo, so it reads on any background.
 */
export function brushCursor(tool: Tool, size: number, color: HexColor): string {
  if (tool === 'shape') return 'crosshair';
  const diameter = Math.max(4, size);
  if (diameter > MAX_CURSOR) return 'crosshair';
  const box = Math.ceil(diameter + 4);
  const c = box / 2;
  const r = diameter / 2;
  const ring = tool === 'eraser' ? '#ffffff' : color;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="3"/>` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${ring}" stroke-width="1.5"/>` +
    (diameter >= 10 ? `<circle cx="${c}" cy="${c}" r="1" fill="${ring}"/>` : '') +
    '</svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round(c)} ${Math.round(c)}, crosshair`;
}
