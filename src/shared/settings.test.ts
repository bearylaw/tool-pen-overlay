import { describe, expect, it } from 'vitest';
import { hex } from './color';
import { DEFAULT_SETTINGS, migrateSettings, type Settings } from './settings';

function parse(raw: unknown): Settings {
  const result = migrateSettings(raw);
  if (!result.ok) throw new Error(result.reason);
  return result.settings;
}

describe('migrateSettings', () => {
  it('round-trips the defaults unchanged', () => {
    expect(parse(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))).toEqual(DEFAULT_SETTINGS);
  });

  it('fills an empty object with defaults', () => {
    expect(parse({})).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects input that is not an object', () => {
    expect(migrateSettings('nope')).toEqual({
      ok: false,
      reason: 'expected a settings object, got string',
    });
    expect(migrateSettings([1])).toEqual({
      ok: false,
      reason: 'expected a settings object, got an array',
    });
  });

  it('keeps valid fields when a sibling field is invalid', () => {
    const settings = parse({
      toolbar: {
        orientation: 'vertical',
        scale: 'huge',
        theme: 'dark',
        position: { x: 10, y: 20 },
      },
    });
    expect(settings.toolbar).toEqual({
      orientation: 'vertical',
      style: 'full',
      scale: 1,
      theme: 'dark',
      position: { x: 10, y: 20 },
    });
  });

  it('clamps sizes and scale into range', () => {
    const settings = parse({
      tool: {
        tool: 'pen',
        shape: 'line',
        color: '#ABC',
        sizes: { pen: 500, highlighter: 0, shape: 3.4, eraser: 20 },
      },
      toolbar: { orientation: 'horizontal', scale: 9, theme: 'system', position: null },
    });
    expect(settings.tool.sizes).toEqual({ pen: 96, highlighter: 1, shape: 3, eraser: 20 });
    expect(settings.tool.color).toBe(hex('#aabbcc'));
    expect(settings.toolbar.scale).toBe(2);
  });

  it('drops invalid colours from a palette but keeps the palette', () => {
    const settings = parse({
      palettes: [{ id: 'p1', name: '  Mine  ', colors: ['#ff0000', 'red', 12, '#00ff00'] }],
      activePaletteId: 'p1',
    });
    expect(settings.palettes).toEqual([
      { id: 'p1', name: 'Mine', colors: [hex('#ff0000'), hex('#00ff00')] },
    ]);
  });

  it('points the active palette at the first one when it no longer exists', () => {
    const settings = parse({
      palettes: [{ id: 'p7', name: 'A', colors: [] }],
      activePaletteId: 'p1',
    });
    expect(settings.activePaletteId).toBe('p7');
  });

  it('removes duplicate palette ids, keeping the first', () => {
    const settings = parse({
      palettes: [
        { id: 'p1', name: 'A', colors: [] },
        { id: 'p1', name: 'B', colors: [] },
      ],
    });
    expect(settings.palettes.map((p) => p.name)).toEqual(['A']);
  });

  it('falls back to the default palettes when none survive parsing', () => {
    expect(parse({ palettes: [] }).palettes).toEqual(DEFAULT_SETTINGS.palettes);
  });

  it('reads a file written by a newer version best-effort', () => {
    const settings = parse({ version: 9, language: 'de', somethingNew: true });
    expect(settings.version).toBe(1);
    expect(settings.language).toBe('de');
  });
});
