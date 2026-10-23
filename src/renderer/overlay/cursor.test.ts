import { describe, expect, it } from 'vitest';
import { hex } from '../../shared/color';
import { CURSOR_SIZES, TOOLS } from '../../shared/settings';
import { cursorImage } from './cursor';

const base = {
  tool: 'pen',
  shape: 'arrow',
  size: 4,
  color: hex('#ef4444'),
  cursorSize: 'standard',
} as const;

describe('cursorImage', () => {
  it('stays within the 128 px browsers accept, for every tool, size and scale', () => {
    for (const tool of TOOLS) {
      for (const cursorSize of CURSOR_SIZES) {
        for (let size = 1; size <= 96; size++) {
          const { box, hotspot } = cursorImage({ ...base, tool, size, cursorSize });
          expect(box).toBeLessThanOrEqual(128);
          expect(hotspot).toBe(Math.round(box / 2));
        }
      }
    }
  });

  it('is clearly visible even for a 1 px pen', () => {
    expect(cursorImage({ ...base, size: 1 }).box).toBeGreaterThanOrEqual(40);
  });

  it('is larger with the large setting', () => {
    expect(cursorImage({ ...base, cursorSize: 'large' }).box).toBeGreaterThan(
      cursorImage(base).box,
    );
  });

  it('shows the brush ring when it fits and drops it when it does not', () => {
    const ring = (size: number, cursorSize: 'standard' | 'large' = 'standard'): boolean =>
      cursorImage({ ...base, size, cursorSize }).svg.includes(`r="${size / 2}"`);
    expect(ring(20)).toBe(true);
    expect(ring(96)).toBe(true);
    expect(ring(96, 'large')).toBe(false);
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
