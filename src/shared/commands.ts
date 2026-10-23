import { z } from 'zod';
import { type HexColor, parseHex } from './color';
import {
  activePalette,
  BEHAVIOR_FLAGS,
  CURSOR_SIZES,
  clampOpacity,
  clampScale,
  clampSize,
  cleanName,
  DEFAULT_SETTINGS,
  LANGUAGES,
  MAX_PALETTE_COLORS,
  MAX_PALETTES,
  ORIENTATIONS,
  type Palette,
  type Settings,
  SHAPES,
  SHORTCUT_ACTIONS,
  STARTUP_MODES,
  THEMES,
  TOOLBAR_STYLES,
  TOOLS,
} from './settings';

const hexColor = z.string().transform((value, ctx) => {
  const parsed = parseHex(value);
  if (parsed === null) {
    ctx.addIssue({ code: 'custom', message: `not a hex colour: ${value}` });
    return z.NEVER;
  }
  return parsed;
});
const index = z.number().int().min(0).max(255);
const id = z.string().min(1).max(32);
const name = z.string().max(200);

/**
 * Every change a window may ask for that only touches settings. Parsed in
 * the main process on receipt; the reducer below is the only writer.
 */
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setTool'), tool: z.enum(TOOLS) }),
  z.object({ type: z.literal('setShape'), shape: z.enum(SHAPES) }),
  z.object({ type: z.literal('setColor'), color: hexColor }),
  z.object({ type: z.literal('setSize'), size: z.number().finite() }),
  z.object({ type: z.literal('nudgeSize'), direction: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({ type: z.literal('selectPaletteColor'), index }),
  z.object({ type: z.literal('addColor'), color: hexColor }),
  z.object({ type: z.literal('removeColor'), index }),
  z.object({ type: z.literal('moveColor'), from: index, to: index }),
  z.object({ type: z.literal('createPalette'), name }),
  z.object({ type: z.literal('renamePalette'), id, name }),
  z.object({ type: z.literal('deletePalette'), id }),
  z.object({ type: z.literal('selectPalette'), id }),
  z.object({ type: z.literal('setOrientation'), orientation: z.enum(ORIENTATIONS) }),
  z.object({ type: z.literal('setToolbarStyle'), style: z.enum(TOOLBAR_STYLES) }),
  z.object({ type: z.literal('setScale'), scale: z.number().finite() }),
  z.object({ type: z.literal('setTheme'), theme: z.enum(THEMES) }),
  z.object({ type: z.literal('setLanguage'), language: z.enum(LANGUAGES) }),
  z.object({ type: z.literal('setPressure'), enabled: z.boolean() }),
  z.object({ type: z.literal('setCursorSize'), cursorSize: z.enum(CURSOR_SIZES) }),
  z.object({ type: z.literal('setHighlighterOpacity'), opacity: z.number().finite() }),
  z.object({ type: z.literal('setBehavior'), flag: z.enum(BEHAVIOR_FLAGS), enabled: z.boolean() }),
  z.object({ type: z.literal('setStartup'), mode: z.enum(STARTUP_MODES) }),
  z.object({ type: z.literal('saveDefaults') }),
  z.object({ type: z.literal('applyDefaults') }),
  z.object({
    type: z.literal('setShortcut'),
    action: z.enum(SHORTCUT_ACTIONS),
    accelerator: z.string().max(64),
  }),
  z.object({ type: z.literal('resetShortcuts') }),
  z.object({ type: z.literal('resetAll') }),
]);

/** A settings change, as parsed by {@link commandSchema}. */
export type Command = z.output<typeof commandSchema>;

/** What a window sends; colours are still plain strings before parsing. */
export type CommandInput = z.input<typeof commandSchema>;

/**
 * Applies one command. Pure: returns a new settings object, or the same one
 * when the command does not change anything (an out-of-range index, a name
 * that is empty after trimming).
 */
export function reduce(settings: Settings, command: Command): Settings {
  switch (command.type) {
    case 'setTool':
      return withTool(settings, { tool: command.tool });
    case 'setShape':
      return withTool(settings, { tool: 'shape', shape: command.shape });
    case 'setColor':
      return withColor(settings, command.color);
    case 'setSize':
      return withSize(settings, command.size);
    case 'nudgeSize':
      return withSize(settings, nudge(settings.tool.sizes[settings.tool.tool], command.direction));
    case 'selectPaletteColor': {
      const color = activePalette(settings).colors[command.index];
      return color === undefined ? settings : withColor(settings, color);
    }
    default:
      return reducePalettes(settings, command) ?? reducePreferences(settings, command);
  }
}

function reducePalettes(settings: Settings, command: Command): Settings | null {
  switch (command.type) {
    case 'addColor':
      return updateActivePalette(settings, (colors) =>
        colors.includes(command.color) || colors.length >= MAX_PALETTE_COLORS
          ? colors
          : [...colors, command.color],
      );
    case 'removeColor':
      return updateActivePalette(settings, (colors) =>
        colors.filter((_, i) => i !== command.index),
      );
    case 'moveColor':
      return updateActivePalette(settings, (colors) => move(colors, command.from, command.to));
    case 'createPalette':
      return createPalette(settings, command.name);
    case 'renamePalette':
      return renamePalette(settings, command.id, command.name);
    case 'deletePalette':
      return deletePalette(settings, command.id);
    case 'selectPalette':
      return settings.palettes.some((p) => p.id === command.id)
        ? { ...settings, activePaletteId: command.id }
        : settings;
    default:
      return null;
  }
}

function reducePreferences(settings: Settings, command: Command): Settings {
  switch (command.type) {
    case 'setOrientation':
      return { ...settings, toolbar: { ...settings.toolbar, orientation: command.orientation } };
    case 'setToolbarStyle':
      return { ...settings, toolbar: { ...settings.toolbar, style: command.style } };
    case 'setScale':
      return { ...settings, toolbar: { ...settings.toolbar, scale: clampScale(command.scale) } };
    case 'setTheme':
      return { ...settings, toolbar: { ...settings.toolbar, theme: command.theme } };
    case 'setLanguage':
      return { ...settings, language: command.language };
    case 'setCursorSize':
      return { ...settings, drawing: { ...settings.drawing, cursorSize: command.cursorSize } };
    case 'setPressure':
      return { ...settings, drawing: { ...settings.drawing, pressure: command.enabled } };
    case 'setHighlighterOpacity':
      return {
        ...settings,
        drawing: { ...settings.drawing, highlighterOpacity: clampOpacity(command.opacity) },
      };
    case 'setBehavior':
      return { ...settings, behavior: { ...settings.behavior, [command.flag]: command.enabled } };
    case 'setStartup':
      return { ...settings, startup: command.mode };
    case 'saveDefaults':
      return { ...settings, defaults: settings.tool };
    case 'applyDefaults':
      return { ...settings, tool: settings.defaults };
    case 'setShortcut':
      return {
        ...settings,
        shortcuts: { ...settings.shortcuts, [command.action]: command.accelerator.trim() },
      };
    case 'resetShortcuts':
      return { ...settings, shortcuts: DEFAULT_SETTINGS.shortcuts };
    case 'resetAll':
      // The toolbar stays where the user put it; everything else is factory.
      return {
        ...DEFAULT_SETTINGS,
        toolbar: { ...DEFAULT_SETTINGS.toolbar, position: settings.toolbar.position },
      };
    default:
      return settings;
  }
}

/** Brush-size steps used by `[` and `]` and the mouse wheel: finer when small. */
export function nudge(size: number, direction: 1 | -1): number {
  const step = size < 8 ? 1 : size < 24 ? 2 : 4;
  return clampSize(size + direction * step);
}

function withTool(settings: Settings, change: Partial<Settings['tool']>): Settings {
  return { ...settings, tool: { ...settings.tool, ...change } };
}

function withColor(settings: Settings, color: HexColor): Settings {
  // Picking a colour while erasing means the user wants to draw again.
  const tool = settings.tool.tool === 'eraser' ? 'pen' : settings.tool.tool;
  return withTool(settings, { color, tool });
}

function withSize(settings: Settings, size: number): Settings {
  const { tool, sizes } = settings.tool;
  return withTool(settings, { sizes: { ...sizes, [tool]: clampSize(size) } });
}

function updateActivePalette(
  settings: Settings,
  update: (colors: readonly HexColor[]) => readonly HexColor[],
): Settings {
  const active = activePalette(settings);
  const colors = update(active.colors);
  if (colors === active.colors) return settings;
  return replacePalette(settings, { ...active, colors });
}

function replacePalette(settings: Settings, palette: Palette): Settings {
  return {
    ...settings,
    palettes: settings.palettes.map((p) => (p.id === palette.id ? palette : p)),
  };
}

function createPalette(settings: Settings, rawName: string): Settings {
  const cleaned = cleanName(rawName);
  if (cleaned === null || settings.palettes.length >= MAX_PALETTES) return settings;
  const palette: Palette = { id: nextPaletteId(settings.palettes), name: cleaned, colors: [] };
  return { ...settings, palettes: [...settings.palettes, palette], activePaletteId: palette.id };
}

function renamePalette(settings: Settings, paletteId: string, rawName: string): Settings {
  const cleaned = cleanName(rawName);
  const palette = settings.palettes.find((p) => p.id === paletteId);
  if (cleaned === null || palette === undefined) return settings;
  return replacePalette(settings, { ...palette, name: cleaned });
}

function deletePalette(settings: Settings, paletteId: string): Settings {
  if (settings.palettes.length <= 1) return settings;
  const palettes = settings.palettes.filter((p) => p.id !== paletteId);
  if (palettes.length === settings.palettes.length) return settings;
  const activePaletteId =
    settings.activePaletteId === paletteId ? (palettes[0]?.id ?? '') : settings.activePaletteId;
  return { ...settings, palettes, activePaletteId };
}

/** `p<n>` with n one past the highest number in use; stable and collision-free. */
function nextPaletteId(palettes: readonly Palette[]): string {
  const highest = palettes.reduce((max, p) => {
    const n = /^p(\d+)$/.exec(p.id)?.[1];
    return n === undefined ? max : Math.max(max, Number(n));
  }, 0);
  return `p${highest + 1}`;
}

function move<T>(items: readonly T[], from: number, to: number): readonly T[] {
  const item = items[from];
  if (item === undefined || from === to || to >= items.length) return items;
  const without = items.filter((_, i) => i !== from);
  return [...without.slice(0, to), item, ...without.slice(to)];
}
