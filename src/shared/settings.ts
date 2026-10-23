import { z } from 'zod';
import { type HexColor, hex, parseHex } from './color';

/** Version of the settings file layout. Bump and add a step to {@link migrateSettings}. */
export const SETTINGS_VERSION = 1;

export const TOOLS = ['pen', 'highlighter', 'shape', 'eraser'] as const;
export type Tool = (typeof TOOLS)[number];

export const SHAPES = ['line', 'arrow', 'rect', 'ellipse'] as const;
export type Shape = (typeof SHAPES)[number];

export const ORIENTATIONS = ['horizontal', 'vertical'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export const TOOLBAR_STYLES = ['full', 'compact'] as const;
export type ToolbarStyle = (typeof TOOLBAR_STYLES)[number];

/** Palette colours the compact toolbar shows. */
export const COMPACT_COLORS = 2;

export const CURSOR_SIZES = ['standard', 'large'] as const;
export type CursorSize = (typeof CURSOR_SIZES)[number];

export const THEMES = ['system', 'dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const LANGUAGES = ['system', 'en', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];

export const STARTUP_MODES = ['last', 'defaults'] as const;
export type StartupMode = (typeof STARTUP_MODES)[number];

export const SHORTCUT_ACTIONS = [
  'toggleDraw',
  'toggleInk',
  'toggleToolbar',
  'clear',
  'undo',
  'redo',
] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

export const BEHAVIOR_FLAGS = ['clearOnExit', 'drawOnLaunch', 'launchAtLogin'] as const;
export type BehaviorFlag = (typeof BEHAVIOR_FLAGS)[number];

export const SIZE_MIN = 1;
export const SIZE_MAX = 96;
export const SCALE_MIN = 0.75;
export const SCALE_MAX = 2;
export const OPACITY_MIN = 0.1;
export const OPACITY_MAX = 0.9;
export const MAX_PALETTES = 12;
export const MAX_PALETTE_COLORS = 16;
export const MAX_NAME_LENGTH = 32;

/** One named, ordered list of favourite colours. */
export interface Palette {
  readonly id: string;
  readonly name: string;
  readonly colors: readonly HexColor[];
}

/** Brush sizes in CSS pixels, one per tool so switching tools keeps each size. */
export type ToolSizes = Readonly<Record<Tool, number>>;

/** What the next stroke looks like. */
export interface ToolState {
  readonly tool: Tool;
  readonly shape: Shape;
  readonly color: HexColor;
  readonly sizes: ToolSizes;
}

/** Toolbar placement in screen coordinates (DIP). */
export interface Position {
  readonly x: number;
  readonly y: number;
}

/** Everything the user can change; persisted per OS user. */
export interface Settings {
  readonly version: typeof SETTINGS_VERSION;
  readonly tool: ToolState;
  readonly defaults: ToolState;
  readonly startup: StartupMode;
  readonly palettes: readonly Palette[];
  readonly activePaletteId: string;
  readonly toolbar: {
    readonly orientation: Orientation;
    readonly style: ToolbarStyle;
    readonly scale: number;
    readonly theme: Theme;
    readonly position: Position | null;
  };
  readonly drawing: {
    readonly pressure: boolean;
    readonly highlighterOpacity: number;
    readonly cursorSize: CursorSize;
  };
  readonly behavior: Readonly<Record<BehaviorFlag, boolean>>;
  readonly shortcuts: Readonly<Record<ShortcutAction, string>>;
  readonly language: Language;
}

const DEFAULT_TOOL_STATE: ToolState = {
  tool: 'pen',
  shape: 'arrow',
  color: hex('#ef4444'),
  sizes: { pen: 4, highlighter: 20, shape: 4, eraser: 28 },
};

const DEFAULT_PALETTES: readonly Palette[] = [
  {
    id: 'p1',
    name: 'Classic',
    colors: [
      '#ef4444',
      '#f97316',
      '#facc15',
      '#22c55e',
      '#3b82f6',
      '#a855f7',
      '#ffffff',
      '#111827',
    ].map(hex),
  },
  {
    id: 'p2',
    name: 'Highlighter',
    colors: ['#fde047', '#86efac', '#67e8f9', '#f9a8d4', '#fdba74'].map(hex),
  },
];

/** Default global shortcuts, as Electron accelerators. Empty means unassigned. */
export const DEFAULT_SHORTCUTS: Readonly<Record<ShortcutAction, string>> = {
  toggleDraw: 'CommandOrControl+Alt+D',
  toggleInk: 'CommandOrControl+Alt+H',
  toggleToolbar: 'CommandOrControl+Alt+T',
  clear: 'CommandOrControl+Alt+C',
  undo: 'CommandOrControl+Alt+Z',
  redo: 'CommandOrControl+Alt+Y',
};

/** Factory settings. */
export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  tool: DEFAULT_TOOL_STATE,
  defaults: DEFAULT_TOOL_STATE,
  startup: 'last',
  palettes: DEFAULT_PALETTES,
  activePaletteId: 'p1',
  toolbar: {
    orientation: 'horizontal',
    style: 'full',
    scale: 1,
    theme: 'system',
    position: null,
  },
  drawing: { pressure: true, highlighterOpacity: 0.35, cursorSize: 'standard' },
  behavior: { clearOnExit: false, drawOnLaunch: false, launchAtLogin: false },
  shortcuts: DEFAULT_SHORTCUTS,
  language: 'system',
};

/** Clamps a brush size into the supported range and rounds to whole pixels. */
export function clampSize(size: number): number {
  return Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, size)));
}

/** Clamps the toolbar scale and rounds it to 5 % steps. */
export function clampScale(scale: number): number {
  return Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale)) * 20) / 20;
}

/** Clamps the highlighter opacity and rounds it to 5 % steps. */
export function clampOpacity(opacity: number): number {
  return Math.round(Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, opacity)) * 20) / 20;
}

/** Trims a user-entered name and caps its length. Empty input yields `null`. */
export function cleanName(name: string): string | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point.
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, MAX_NAME_LENGTH);
}

// Every field falls back on its own, so one bad value in a hand-edited file
// costs that value only, not the user's palettes.
const hexSchema = z.string().transform((value, ctx) => {
  const parsed = parseHex(value);
  if (parsed === null) {
    ctx.addIssue({ code: 'custom', message: `not a hex colour: ${value}` });
    return z.NEVER;
  }
  return parsed;
});

const sizeSchema = (fallback: number) => z.number().finite().transform(clampSize).catch(fallback);

const toolStateSchema = z
  .object({
    tool: z.enum(TOOLS).catch(DEFAULT_TOOL_STATE.tool),
    shape: z.enum(SHAPES).catch(DEFAULT_TOOL_STATE.shape),
    color: hexSchema.catch(DEFAULT_TOOL_STATE.color),
    sizes: z
      .object({
        pen: sizeSchema(DEFAULT_TOOL_STATE.sizes.pen),
        highlighter: sizeSchema(DEFAULT_TOOL_STATE.sizes.highlighter),
        shape: sizeSchema(DEFAULT_TOOL_STATE.sizes.shape),
        eraser: sizeSchema(DEFAULT_TOOL_STATE.sizes.eraser),
      })
      .catch(DEFAULT_TOOL_STATE.sizes),
  })
  .catch(DEFAULT_TOOL_STATE);

const paletteSchema = z.object({
  id: z.string().min(1).max(MAX_NAME_LENGTH),
  name: z
    .string()
    .transform((value) => cleanName(value) ?? 'Palette')
    .catch('Palette'),
  colors: z
    .array(hexSchema.nullable().catch(null))
    .transform((colors) =>
      colors.filter((c): c is HexColor => c !== null).slice(0, MAX_PALETTE_COLORS),
    )
    .catch([]),
});

const palettesSchema = z
  .array(paletteSchema.nullable().catch(null))
  .transform((palettes) => uniqueById(palettes.filter((p) => p !== null)))
  .transform((palettes) =>
    palettes.length === 0 ? DEFAULT_PALETTES : palettes.slice(0, MAX_PALETTES),
  )
  .catch(DEFAULT_PALETTES);

const positionSchema = z
  .object({ x: z.number().finite(), y: z.number().finite() })
  .transform(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }))
  .nullable()
  .catch(null);

const flag = (fallback: boolean) => z.boolean().catch(fallback);
const accelerator = (fallback: string) => z.string().max(64).catch(fallback);

const settingsV1Schema = z.object({
  tool: toolStateSchema,
  defaults: toolStateSchema,
  startup: z.enum(STARTUP_MODES).catch(DEFAULT_SETTINGS.startup),
  palettes: palettesSchema,
  activePaletteId: z.string().catch(DEFAULT_SETTINGS.activePaletteId),
  toolbar: z
    .object({
      orientation: z.enum(ORIENTATIONS).catch(DEFAULT_SETTINGS.toolbar.orientation),
      style: z.enum(TOOLBAR_STYLES).catch(DEFAULT_SETTINGS.toolbar.style),
      scale: z.number().finite().transform(clampScale).catch(DEFAULT_SETTINGS.toolbar.scale),
      theme: z.enum(THEMES).catch(DEFAULT_SETTINGS.toolbar.theme),
      position: positionSchema,
    })
    .catch(DEFAULT_SETTINGS.toolbar),
  drawing: z
    .object({
      pressure: flag(DEFAULT_SETTINGS.drawing.pressure),
      cursorSize: z.enum(CURSOR_SIZES).catch(DEFAULT_SETTINGS.drawing.cursorSize),
      highlighterOpacity: z
        .number()
        .finite()
        .transform(clampOpacity)
        .catch(DEFAULT_SETTINGS.drawing.highlighterOpacity),
    })
    .catch(DEFAULT_SETTINGS.drawing),
  behavior: z
    .object({
      clearOnExit: flag(DEFAULT_SETTINGS.behavior.clearOnExit),
      drawOnLaunch: flag(DEFAULT_SETTINGS.behavior.drawOnLaunch),
      launchAtLogin: flag(DEFAULT_SETTINGS.behavior.launchAtLogin),
    })
    .catch(DEFAULT_SETTINGS.behavior),
  shortcuts: z
    .object({
      toggleDraw: accelerator(DEFAULT_SHORTCUTS.toggleDraw),
      toggleInk: accelerator(DEFAULT_SHORTCUTS.toggleInk),
      toggleToolbar: accelerator(DEFAULT_SHORTCUTS.toggleToolbar),
      clear: accelerator(DEFAULT_SHORTCUTS.clear),
      undo: accelerator(DEFAULT_SHORTCUTS.undo),
      redo: accelerator(DEFAULT_SHORTCUTS.redo),
    })
    .catch(DEFAULT_SHORTCUTS),
  language: z.enum(LANGUAGES).catch(DEFAULT_SETTINGS.language),
});

/** Why a settings file could not be read; the caller falls back to defaults. */
export type SettingsParseResult =
  | { readonly ok: true; readonly settings: Settings }
  | { readonly ok: false; readonly reason: string };

/**
 * Parses settings of any known version into the current shape. Missing or
 * invalid fields fall back to their default one by one; only input that is
 * not an object at all is rejected.
 */
export function migrateSettings(raw: unknown): SettingsParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: `expected a settings object, got ${describe(raw)}` };
  }
  const version = (raw as { version?: unknown }).version;
  if (version !== undefined && typeof version !== 'number') {
    return { ok: false, reason: `expected a numeric version, got ${describe(version)}` };
  }
  // Version 1 is the only layout so far. A newer file (written by a newer
  // release) is read best-effort: unknown fields are dropped, known ones kept.
  const withDefaults = { ...DEFAULT_SETTINGS, ...(raw as Record<string, unknown>) };
  const parsed = settingsV1Schema.parse(withDefaults);
  return { ok: true, settings: normalise({ version: SETTINGS_VERSION, ...parsed }) };
}

/** Restores the invariants a schema cannot express (references between fields). */
function normalise(settings: Settings): Settings {
  const activeExists = settings.palettes.some((p) => p.id === settings.activePaletteId);
  const firstPalette = settings.palettes[0] ?? DEFAULT_PALETTES[0];
  return activeExists || firstPalette === undefined
    ? settings
    : { ...settings, activePaletteId: firstPalette.id };
}

function uniqueById(palettes: readonly Palette[]): Palette[] {
  const seen = new Set<string>();
  return palettes.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

/** The palette currently shown on the toolbar. */
export function activePalette(settings: Settings): Palette {
  const palette =
    settings.palettes.find((p) => p.id === settings.activePaletteId) ?? settings.palettes[0];
  if (palette === undefined) throw new Error('settings invariant: at least one palette exists');
  return palette;
}

/** Size of the brush for the currently selected tool. */
export function currentSize(tool: ToolState): number {
  return tool.sizes[tool.tool];
}
