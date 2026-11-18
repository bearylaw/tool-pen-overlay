// Pure planning for the screen freeze, kept apart from Electron so it can be
// tested without a desktop.

/** A display as the freeze needs it: id and size in DIP. */
export interface DisplayShape {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly scaleFactor: number;
}

/**
 * Thumbnail box that holds every display at its physical resolution. The
 * capturer scales each screen to fit this one box.
 */
export function captureSize(displays: readonly DisplayShape[]): {
  width: number;
  height: number;
} {
  let width = 1;
  let height = 1;
  for (const d of displays) {
    width = Math.max(width, Math.round(d.width * d.scaleFactor));
    height = Math.max(height, Math.round(d.height * d.scaleFactor));
  }
  return { width, height };
}

/**
 * Pairs each display with its captured screen. Windows and macOS name the
 * display on every source; some Linux setups leave it empty, and then the
 * order is trusted only when the counts match. A display without a source
 * is left out: it is not frozen rather than frozen with the wrong picture.
 */
export function pairSources<T extends { readonly display_id: string }>(
  displayIds: readonly number[],
  sources: readonly T[],
): Map<number, T> {
  const pairs = new Map<number, T>();
  for (const id of displayIds) {
    const source = sources.find((s) => s.display_id === String(id));
    if (source !== undefined) pairs.set(id, source);
  }
  const unnamed = sources.every((s) => s.display_id === '');
  if (pairs.size === 0 && unnamed && sources.length === displayIds.length) {
    displayIds.forEach((id, i) => {
      const source = sources[i];
      if (source !== undefined) pairs.set(id, source);
    });
  }
  return pairs;
}
