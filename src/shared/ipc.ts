import { z } from 'zod';
import type { CommandInput } from './commands';
import type { Settings, ShortcutAction } from './settings';

export const PANELS = ['color', 'size', 'shape', 'settings'] as const;
export type PanelKind = (typeof PANELS)[number];

const rect = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});

/** A rectangle in some coordinate space named by its user. */
export type Rect = z.output<typeof rect>;

/**
 * Requests with side effects beyond settings (windows, history, files).
 * Parsed in the main process on receipt.
 */
export const intentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setDrawMode'), enabled: z.boolean() }),
  z.object({ type: z.literal('toggleDraw') }),
  z.object({ type: z.literal('toggleInk') }),
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('redo') }),
  z.object({ type: z.literal('clear') }),
  z.object({ type: z.literal('openPanel'), panel: z.enum(PANELS), anchor: rect }),
  z.object({ type: z.literal('closePanel') }),
  z.object({ type: z.literal('recordingShortcut'), active: z.boolean() }),
  z.object({ type: z.literal('exportSettings') }),
  z.object({ type: z.literal('importSettings') }),
  z.object({ type: z.literal('hideToolbar') }),
  z.object({ type: z.literal('quit') }),
]);

export type Intent = z.output<typeof intentSchema>;

/** Content size a toolbar or panel window reports, in CSS pixels. */
export const sizeSchema = z.object({
  width: z.number().finite().positive().max(4000),
  height: z.number().finite().positive().max(4000),
});

export type ContentSize = z.output<typeof sizeSchema>;

/** What an overlay tells the main process after its strokes change. */
export const inkReportSchema = z.object({
  strokeCount: z.number().int().nonnegative(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
  /** True when the user just made a new undoable step on this overlay. */
  committed: z.boolean(),
});

export type InkReport = z.output<typeof inkReportSchema>;

/** History orders from the main process to one overlay. */
export type InkOrder =
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'clear' }
  | { readonly type: 'dropRedo' };

export type Platform = 'win32' | 'darwin' | 'linux';

/** Short-lived message shown in the settings panel. */
export interface Notice {
  readonly kind: 'info' | 'error';
  readonly key:
    | 'notice.exported'
    | 'notice.imported'
    | 'notice.importFailed'
    | 'notice.exportFailed';
}

/** State that lives only while the app runs. */
export interface Runtime {
  readonly drawMode: boolean;
  readonly inkVisible: boolean;
  readonly canUndo: boolean;
  /** Whether any overlay has strokes, so Clear has something to do. */
  readonly hasInk: boolean;
  readonly canRedo: boolean;
  readonly panel: PanelKind | null;
  readonly platform: Platform;
  /** The language in effect, `system` resolved. */
  readonly locale: 'en' | 'de';
  readonly shortcutConflicts: readonly ShortcutAction[];
  readonly version: string;
  readonly notice: Notice | null;
  readonly toolbarVisible: boolean;
}

/** Everything a window renders from. Sent whole on every change; it is small. */
export interface AppState {
  readonly settings: Settings;
  readonly runtime: Runtime;
}

/** The API the preload script exposes as `window.penOverlay`. */
export interface PenOverlayApi {
  readonly onState: (listener: (state: AppState) => void) => void;
  readonly onInkOrder: (listener: (order: InkOrder) => void) => void;
  readonly command: (command: CommandInput) => void;
  readonly intent: (intent: z.input<typeof intentSchema>) => void;
  readonly reportSize: (size: ContentSize) => void;
  readonly reportInk: (report: InkReport) => void;
}
