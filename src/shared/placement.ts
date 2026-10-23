import type { Rect } from './ipc';
import type { Orientation, Position } from './settings';

/** Space between the toolbar and an open panel, in DIP. */
export const PANEL_GAP = 6;

/** Where a panel goes relative to the toolbar button that opened it. */
export interface PanelPlacementInput {
  /** The button that opened the panel, in screen DIP. */
  readonly anchor: Rect;
  /** The toolbar window, in screen DIP. */
  readonly toolbar: Rect;
  readonly panel: { readonly width: number; readonly height: number };
  /** Work area of the display the toolbar is on. */
  readonly workArea: Rect;
  readonly orientation: Orientation;
}

/**
 * Places a panel beside the toolbar: below a horizontal toolbar (above when
 * there is no room), right of a vertical one (left when there is no room),
 * centred on the anchor button and kept inside the work area.
 */
export function placePanel(input: PanelPlacementInput): Position {
  const { anchor, toolbar, panel, workArea, orientation } = input;
  if (orientation === 'horizontal') {
    const below = toolbar.y + toolbar.height + PANEL_GAP;
    const above = toolbar.y - PANEL_GAP - panel.height;
    const fitsBelow = below + panel.height <= workArea.y + workArea.height;
    return clampPosition(
      {
        x: anchor.x + anchor.width / 2 - panel.width / 2,
        y: fitsBelow || above < workArea.y ? below : above,
      },
      panel,
      workArea,
    );
  }
  const right = toolbar.x + toolbar.width + PANEL_GAP;
  const left = toolbar.x - PANEL_GAP - panel.width;
  const fitsRight = right + panel.width <= workArea.x + workArea.width;
  return clampPosition(
    {
      x: fitsRight || left < workArea.x ? right : left,
      y: anchor.y + anchor.height / 2 - panel.height / 2,
    },
    panel,
    workArea,
  );
}

/** Moves a box so it lies inside the area; a box larger than the area is pinned to its top left. */
export function clampPosition(
  position: Position,
  size: { readonly width: number; readonly height: number },
  area: Rect,
): Position {
  const x = Math.min(Math.max(position.x, area.x), area.x + Math.max(0, area.width - size.width));
  const y = Math.min(Math.max(position.y, area.y), area.y + Math.max(0, area.height - size.height));
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * The work area a window belongs to: the one it overlaps most, else the one
 * nearest its centre (a monitor was unplugged since the position was saved).
 */
export function pickArea(window: Rect, areas: readonly Rect[]): Rect | null {
  let best: Rect | null = null;
  let bestScore = -Infinity;
  const cx = window.x + window.width / 2;
  const cy = window.y + window.height / 2;
  for (const area of areas) {
    const overlap = intersection(window, area);
    const score =
      overlap > 0
        ? overlap
        : -Math.hypot(cx - (area.x + area.width / 2), cy - (area.y + area.height / 2));
    if (score > bestScore) {
      best = area;
      bestScore = score;
    }
  }
  return best;
}

function intersection(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
