/** A colour as `#rrggbb`, lower case. Built only through {@link parseHex}. */
export type HexColor = string & { readonly __brand: 'HexColor' };

/** Hue in degrees [0, 360), saturation and value in [0, 1]. */
export interface Hsv {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Parses `#rgb`, `#rrggbb`, `rgb` or `rrggbb` into a normalised `#rrggbb`.
 * Returns `null` for anything else.
 */
export function parseHex(input: string): HexColor | null {
  const match = HEX_PATTERN.exec(input.trim());
  const digits = match?.[1];
  if (digits === undefined) return null;
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((c) => c + c)
          .join('')
      : digits;
  return `#${full.toLowerCase()}` as HexColor;
}

/** Like {@link parseHex} but throws; for literals known to be valid. */
export function hex(input: string): HexColor {
  const parsed = parseHex(input);
  if (parsed === null) throw new Error(`expected a hex colour like #ff0000, got "${input}"`);
  return parsed;
}

/** Converts a hex colour to HSV. */
export function hexToHsv(color: HexColor): Hsv {
  const value = Number.parseInt(color.slice(1), 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  const s = max === 0 ? 0 : delta / max;
  return { h: hueOf(r, g, b, max, delta), s, v: max };
}

function hueOf(r: number, g: number, b: number, max: number, delta: number): number {
  if (delta === 0) return 0;
  const sector =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  const degrees = sector * 60;
  return degrees < 0 ? degrees + 360 : degrees;
}

/** Converts HSV to a hex colour. Out-of-range input is clamped. */
export function hsvToHex({ h, s, v }: Hsv): HexColor {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s);
  const val = clamp01(v);
  const channel = (n: number): number => {
    const k = (n + hue / 60) % 6;
    return val - val * sat * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const toHex = (x: number): string =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(channel(5))}${toHex(channel(3))}${toHex(channel(1))}` as HexColor;
}

/** Relative luminance per WCAG 2.x, in [0, 1]. */
export function luminance(color: HexColor): number {
  const value = Number.parseInt(color.slice(1), 16);
  const linear = (c: number): number => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linear((value >> 16) & 0xff) +
    0.7152 * linear((value >> 8) & 0xff) +
    0.0722 * linear(value & 0xff)
  );
}

/** True when dark text reads better than light text on this colour. */
export function prefersDarkText(color: HexColor): boolean {
  return luminance(color) > 0.4;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
