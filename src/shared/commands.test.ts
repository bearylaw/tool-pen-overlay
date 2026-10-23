import { describe, expect, it } from 'vitest';
import { hex } from './color';
import { type CommandInput, commandSchema, nudge, reduce } from './commands';
import { DEFAULT_SETTINGS, MAX_PALETTE_COLORS, type Settings } from './settings';

function run(settings: Settings, ...inputs: CommandInput[]): Settings {
  return inputs.reduce((s, input) => reduce(s, commandSchema.parse(input)), settings);
}

const red = hex('#ef4444');
const teal = hex('#14b8a6');

describe('tools and brushes', () => {
  it('keeps a separate size per tool', () => {
    const s = run(
      DEFAULT_SETTINGS,
      { type: 'setTool', tool: 'highlighter' },
      { type: 'setSize', size: 30 },
      { type: 'setTool', tool: 'pen' },
      { type: 'setSize', size: 6 },
    );
    expect(s.tool.sizes.highlighter).toBe(30);
    expect(s.tool.sizes.pen).toBe(6);
  });

  it('switches to the shape tool when a shape is picked', () => {
    const s = run(DEFAULT_SETTINGS, { type: 'setShape', shape: 'rect' });
    expect(s.tool).toMatchObject({ tool: 'shape', shape: 'rect' });
  });

  it('switches from the eraser to the pen when a colour is picked', () => {
    const s = run(
      DEFAULT_SETTINGS,
      { type: 'setTool', tool: 'eraser' },
      { type: 'setColor', color: '#14B8A6' },
    );
    expect(s.tool).toMatchObject({ tool: 'pen', color: teal });
  });

  it('nudges sizes in finer steps when small', () => {
    expect(nudge(4, 1)).toBe(5);
    expect(nudge(12, 1)).toBe(14);
    expect(nudge(40, -1)).toBe(36);
    expect(nudge(1, -1)).toBe(1);
  });

  it('rejects a colour that is not hex', () => {
    expect(commandSchema.safeParse({ type: 'setColor', color: 'red' }).success).toBe(false);
  });
});

describe('palettes', () => {
  it('adds the colour to the active palette once', () => {
    const s = run(
      DEFAULT_SETTINGS,
      { type: 'addColor', color: '#14b8a6' },
      { type: 'addColor', color: '#14b8a6' },
    );
    expect(s.palettes[0]?.colors.at(-1)).toBe(teal);
    expect(s.palettes[0]?.colors.filter((c) => c === teal)).toHaveLength(1);
  });

  it('stops adding when the palette is full', () => {
    const full = Array.from(
      { length: MAX_PALETTE_COLORS },
      (_, i) => `#0000${i.toString(16).padStart(2, '0')}`,
    );
    let s = run(DEFAULT_SETTINGS, { type: 'createPalette', name: 'Full' });
    s = run(s, ...full.map((color): CommandInput => ({ type: 'addColor', color })));
    expect(run(s, { type: 'addColor', color: '#ffffff' })).toBe(s);
  });

  it('moves a colour to a new position', () => {
    const s = run(DEFAULT_SETTINGS, { type: 'moveColor', from: 0, to: 2 });
    expect(s.palettes[0]?.colors.slice(0, 3)).toEqual([hex('#f97316'), hex('#facc15'), red]);
  });

  it('removes a colour by index', () => {
    const s = run(DEFAULT_SETTINGS, { type: 'removeColor', index: 0 });
    expect(s.palettes[0]?.colors[0]).toBe(hex('#f97316'));
  });

  it('selects a palette colour by index and ignores indexes past the end', () => {
    const s = run(DEFAULT_SETTINGS, { type: 'selectPaletteColor', index: 4 });
    expect(s.tool.color).toBe(hex('#3b82f6'));
    expect(run(s, { type: 'selectPaletteColor', index: 99 })).toBe(s);
  });

  it('creates a palette with a fresh id and makes it active', () => {
    const s = run(DEFAULT_SETTINGS, { type: 'createPalette', name: '  Brand  ' });
    expect(s.palettes.at(-1)).toEqual({ id: 'p3', name: 'Brand', colors: [] });
    expect(s.activePaletteId).toBe('p3');
  });

  it('ignores a palette name that is blank', () => {
    expect(run(DEFAULT_SETTINGS, { type: 'createPalette', name: '   ' })).toBe(DEFAULT_SETTINGS);
  });

  it('renames a palette', () => {
    const s = run(DEFAULT_SETTINGS, { type: 'renamePalette', id: 'p2', name: 'Neon' });
    expect(s.palettes[1]?.name).toBe('Neon');
  });

  it('deletes the active palette and activates the first remaining one', () => {
    const s = run(
      DEFAULT_SETTINGS,
      { type: 'selectPalette', id: 'p2' },
      { type: 'deletePalette', id: 'p2' },
    );
    expect(s.palettes.map((p) => p.id)).toEqual(['p1']);
    expect(s.activePaletteId).toBe('p1');
  });

  it('never deletes the last palette', () => {
    const one = run(DEFAULT_SETTINGS, { type: 'deletePalette', id: 'p2' });
    expect(run(one, { type: 'deletePalette', id: 'p1' })).toBe(one);
  });
});

describe('preferences and defaults', () => {
  it('saves the current tool as the default and applies it later', () => {
    const custom = run(
      DEFAULT_SETTINGS,
      { type: 'setColor', color: '#14b8a6' },
      { type: 'setSize', size: 9 },
    );
    const saved = run(custom, { type: 'saveDefaults' }, { type: 'setColor', color: '#000000' });
    const applied = run(saved, { type: 'applyDefaults' });
    expect(applied.tool).toEqual(custom.tool);
  });

  it('clamps the toolbar scale', () => {
    expect(run(DEFAULT_SETTINGS, { type: 'setScale', scale: 5 }).toolbar.scale).toBe(2);
    expect(run(DEFAULT_SETTINGS, { type: 'setScale', scale: 1.23 }).toolbar.scale).toBe(1.25);
  });

  it('resets everything but keeps the toolbar position', () => {
    const moved: Settings = {
      ...DEFAULT_SETTINGS,
      toolbar: { ...DEFAULT_SETTINGS.toolbar, position: { x: 5, y: 6 } },
    };
    const changed = run(
      moved,
      { type: 'setOrientation', orientation: 'vertical' },
      { type: 'resetAll' },
    );
    expect(changed.toolbar).toEqual({ ...DEFAULT_SETTINGS.toolbar, position: { x: 5, y: 6 } });
  });

  it('sets and resets a shortcut', () => {
    const s = run(DEFAULT_SETTINGS, { type: 'setShortcut', action: 'clear', accelerator: 'F8' });
    expect(s.shortcuts.clear).toBe('F8');
    expect(run(s, { type: 'resetShortcuts' }).shortcuts).toEqual(DEFAULT_SETTINGS.shortcuts);
  });
});

describe('toolbar style and latency', () => {
  it('switches between full and compact toolbars', () => {
    const compact = run(DEFAULT_SETTINGS, { type: 'setToolbarStyle', style: 'compact' });
    expect(compact.toolbar.style).toBe('compact');
    expect(run(compact, { type: 'setToolbarStyle', style: 'full' }).toolbar.style).toBe('full');
  });
});
