import { describe, expect, it } from 'vitest';
import { hex } from '../../shared/color';
import { CURSOR_SIZES, CURSOR_STYLES, SHAPES, TOOLS } from '../../shared/settings';
import { type CursorInput, cursorImage } from './cursor';

const base: CursorInput = {
  style: 'target',
  tool: 'pen',
  shape: 'arrow',
  size: 4,
  color: hex('#ef4444'),
  opacity: 1,
  cursorSize: 'standard',
};

describe('cursorImage', () => {
  it('stays within the 128 px browsers accept, with the hot spot inside, for every combination', () => {
    for (const style of CURSOR_STYLES) {
      for (const tool of TOOLS) {
        for (const shape of SHAPES) {
          for (const cursorSize of CURSOR_SIZES) {
            for (const size of [1, 2, 4, 12, 40, 96]) {
              const image = cursorImage({ ...base, style, tool, shape, size, cursorSize });
              expect(image.width).toBeLessThanOrEqual(128);
              expect(image.height).toBeLessThanOrEqual(128);
              expect(image.hotspotX).toBeGreaterThanOrEqual(0);
              expect(image.hotspotX).toBeLessThanOrEqual(image.width);
              expect(image.hotspotY).toBeLessThanOrEqual(image.height);
            }
          }
        }
      }
    }
  });

  it('is clearly visible even for a 1 px pen in every style', () => {
    for (const style of CURSOR_STYLES) {
      expect(cursorImage({ ...base, style, size: 1 }).width).toBeGreaterThanOrEqual(12);
    }
    expect(cursorImage({ ...base, size: 1 }).width).toBeGreaterThanOrEqual(40);
  });

  it('is larger with the large setting', () => {
    for (const style of CURSOR_STYLES) {
      const large = cursorImage({ ...base, style, cursorSize: 'large' });
      expect(large.width).toBeGreaterThan(cursorImage({ ...base, style }).width);
    }
  });

  it('shows the tool badge only in the crosshair-and-tool style', () => {
    const glyph = 'stroke-width="2.4"';
    expect(cursorImage(base).svg).toContain(glyph);
    expect(cursorImage({ ...base, style: 'crosshair' }).svg).not.toContain(glyph);
  });

  it('puts the hot spot of the tool icon at the pen tip, not the centre', () => {
    const image = cursorImage({ ...base, style: 'tool' });
    expect(image.hotspotX).toBeLessThan(image.width / 3);
    expect(image.hotspotY).toBeGreaterThan((image.height * 2) / 3);
  });

  it('previews the highlighter at its opacity in the brush style', () => {
    const svg = cursorImage({
      ...base,
      style: 'dot',
      tool: 'highlighter',
      size: 20,
      opacity: 0.35,
    }).svg;
    expect(svg).toContain('fill-opacity="0.35"');
  });

  it('draws the badge glyph dark on light ink and light on dark ink', () => {
    expect(cursorImage({ ...base, color: hex('#fde047') }).svg).toContain(
      'stroke="#111111" stroke-width="2.4"',
    );
    expect(cursorImage({ ...base, color: hex('#1e3a8a') }).svg).toContain(
      'stroke="#ffffff" stroke-width="2.4"',
    );
  });
});
