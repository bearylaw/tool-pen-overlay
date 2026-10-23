import { describe, expect, it } from 'vitest';
import { messageKeys, resolveLocale, translate } from './i18n';
import { centerIn, clampPosition, PANEL_GAP, pickArea, placePanel, snapToEdges } from './placement';

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const panel = { width: 300, height: 400 };

describe('placePanel', () => {
  it('opens below a horizontal toolbar, centred on the button', () => {
    const toolbar = { x: 600, y: 20, width: 600, height: 56 };
    const anchor = { x: 900, y: 28, width: 40, height: 40 };
    expect(placePanel({ anchor, toolbar, panel, workArea, orientation: 'horizontal' })).toEqual({
      x: 770,
      y: 76 + PANEL_GAP,
    });
  });

  it('opens above a horizontal toolbar at the bottom of the screen', () => {
    const toolbar = { x: 600, y: 960, width: 600, height: 56 };
    const anchor = { x: 900, y: 968, width: 40, height: 40 };
    expect(placePanel({ anchor, toolbar, panel, workArea, orientation: 'horizontal' }).y).toBe(
      960 - PANEL_GAP - 400,
    );
  });

  it('opens left of a vertical toolbar at the right edge and stays on screen', () => {
    const toolbar = { x: 1860, y: 900, width: 56, height: 600 };
    const anchor = { x: 1868, y: 1000, width: 40, height: 40 };
    expect(placePanel({ anchor, toolbar, panel, workArea, orientation: 'vertical' })).toEqual({
      x: 1860 - PANEL_GAP - 300,
      y: 640,
    });
  });
});

describe('snapToEdges', () => {
  const display = { x: 0, y: 0, width: 3440, height: 1440 };
  const bar = { width: 600, height: 44 };

  it('snaps flush to the bottom and right edges when dropped near them', () => {
    expect(snapToEdges({ x: 2830, y: 1390 }, bar, display)).toEqual({ x: 2840, y: 1396 });
  });

  it('snaps flush to the top and left edges', () => {
    expect(snapToEdges({ x: 9, y: -5 }, bar, display)).toEqual({ x: 0, y: 0 });
  });

  it('leaves a toolbar dropped away from the edges exactly where it is', () => {
    expect(snapToEdges({ x: 1200, y: 700 }, bar, display)).toEqual({ x: 1200, y: 700 });
  });

  it('snaps to the edges of a second display', () => {
    const right = { x: 3440, y: 0, width: 1920, height: 1080 };
    expect(snapToEdges({ x: 3450, y: 1030 }, bar, right)).toEqual({ x: 3440, y: 1036 });
  });
});

describe('centerIn', () => {
  it('centres a box in an area that does not start at zero', () => {
    expect(
      centerIn({ width: 400, height: 50 }, { x: 1920, y: 0, width: 2560, height: 1400 }),
    ).toEqual({
      x: 3000,
      y: 675,
    });
  });
});

describe('clampPosition and pickArea', () => {
  it('pulls a window back inside the area', () => {
    expect(clampPosition({ x: -50, y: 2000 }, { width: 100, height: 50 }, workArea)).toEqual({
      x: 0,
      y: 990,
    });
  });

  it('picks the area a window overlaps most, else the nearest one', () => {
    const right = { x: 1920, y: 0, width: 1280, height: 1024 };
    expect(pickArea({ x: 1900, y: 10, width: 200, height: 50 }, [workArea, right])).toBe(right);
    expect(pickArea({ x: 5000, y: 10, width: 200, height: 50 }, [workArea, right])).toBe(right);
    expect(pickArea({ x: 0, y: 0, width: 1, height: 1 }, [])).toBeNull();
  });
});

describe('i18n', () => {
  it('fills parameters and leaves unknown ones visible', () => {
    expect(translate('en', 'size.button', { size: 4 })).toBe('Brush size: 4 px');
    expect(translate('de', 'color.swatch')).toBe('Farbe {hex}');
  });

  it('has a non-empty German text for every key', () => {
    for (const k of messageKeys()) expect(translate('de', k).length).toBeGreaterThan(0);
  });

  it('resolves the system language', () => {
    expect(resolveLocale('system', 'de-AT')).toBe('de');
    expect(resolveLocale('system', 'fr-FR')).toBe('en');
    expect(resolveLocale('en', 'de-DE')).toBe('en');
  });
});
