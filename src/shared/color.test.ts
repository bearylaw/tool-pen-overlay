import { describe, expect, it } from 'vitest';
import { hex, hexToHsv, hsvToHex, parseHex, prefersDarkText } from './color';

describe('parseHex', () => {
  it('normalises short and long forms with or without #', () => {
    expect(parseHex('#ABC')).toBe('#aabbcc');
    expect(parseHex('ff0000')).toBe('#ff0000');
    expect(parseHex('  #00Ff00 ')).toBe('#00ff00');
  });

  it('rejects anything else', () => {
    for (const input of ['', '#ff', '#gggggg', 'red', '#ff00000'])
      expect(parseHex(input)).toBeNull();
  });
});

describe('HSV conversion', () => {
  it('converts primaries both ways', () => {
    expect(hexToHsv(hex('#ff0000'))).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv(hex('#00ff00'))).toEqual({ h: 120, s: 1, v: 1 });
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000ff');
  });

  it('round-trips every 7th grey and a spread of colours', () => {
    for (let i = 0; i < 256; i += 7) {
      const c = hex(`#${i.toString(16).padStart(2, '0').repeat(3)}`);
      expect(hsvToHex(hexToHsv(c))).toBe(c);
    }
    for (const c of ['#ef4444', '#14b8a6', '#a855f7', '#123456', '#fedcba']) {
      expect(hsvToHex(hexToHsv(hex(c)))).toBe(c);
    }
  });

  it('wraps hue and clamps saturation and value', () => {
    expect(hsvToHex({ h: 360, s: 2, v: -1 })).toBe('#000000');
    expect(hsvToHex({ h: -120, s: 1, v: 1 })).toBe('#0000ff');
  });
});

describe('prefersDarkText', () => {
  it('is true on light colours and false on dark ones', () => {
    expect(prefersDarkText(hex('#facc15'))).toBe(true);
    expect(prefersDarkText(hex('#111827'))).toBe(false);
  });
});
