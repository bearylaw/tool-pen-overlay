import { app, dialog, nativeTheme } from 'electron';
import { type Command, reduce } from '../shared/commands';
import { resolveLocale, translate } from '../shared/i18n';
import type {
  AppState,
  InkReport,
  Intent,
  Notice,
  PanelKind,
  Platform,
  Rect,
  Runtime,
} from '../shared/ipc';
import type { Position, Settings, ShortcutAction } from '../shared/settings';
import {
  EMPTY_ROUTER,
  forgetDisplay,
  type RouterState,
  recordStep,
  takeRedo,
  takeUndo,
} from './history-router';
import type { Logger } from './logger';
import { createOverlayManager } from './overlays';
import { registerShortcuts, unregisterShortcuts } from './shortcuts';
import type { SettingsStore } from './store';
import { createToolbar } from './toolbar';
import { createTray } from './tray';
import type { Page } from './web';

export interface ControllerOptions {
  readonly store: SettingsStore;
  readonly log: Logger;
  readonly preload: string;
  readonly trayIcon: string;
  readonly version: string;
  readonly platform: Platform;
  readonly systemLocale: string;
}

/** The running app: owns settings and runtime state and routes every request. */
export interface Controller {
  readonly command: (command: Command) => void;
  readonly intent: (intent: Intent) => void;
  readonly reportInk: (webContentsId: number, report: InkReport) => void;
  readonly reportSize: (webContentsId: number, size: { width: number; height: number }) => void;
  readonly pageOf: (webContentsId: number) => Page | null;
  readonly showToolbar: () => void;
  readonly onDisplaysChanged: () => void;
  readonly shutdown: () => void;
}

const NOTICE_MS = 4000;
const COLOR_COMMANDS = new Set<Command['type']>([
  'setTool',
  'setShape',
  'setColor',
  'selectPaletteColor',
]);

/** Builds every window and starts the app in the state the settings describe. */
export function createController(options: ControllerOptions): Controller {
  const { store, log } = options;
  const loaded = store.load();
  let settings: Settings =
    loaded.startup === 'defaults' ? { ...loaded, tool: loaded.defaults } : loaded;
  let router: RouterState = EMPTY_ROUTER;
  let recording = false;
  let noticeTimer: NodeJS.Timeout | null = null;
  const inkReports = new Map<number, InkReport>();
  const anchors = new Map<PanelKind, Rect>();
  let runtime: Runtime = {
    drawMode: false,
    inkVisible: true,
    canUndo: false,
    hasInk: false,
    canRedo: false,
    panel: null,
    platform: options.platform,
    locale: resolveLocale(settings.language, options.systemLocale),
    shortcutConflicts: [],
    version: options.version,
    notice: null,
    toolbarVisible: true,
  };

  const overlays = createOverlayManager({
    preload: options.preload,
    log,
    onCreated: () => {
      toolbar.raise();
      overlays.broadcast(state());
    },
    onRemoved: (displayId) => {
      inkReports.delete(displayId);
      router = forgetDisplay(router, displayId);
      updateHistoryFlags();
    },
  });
  const toolbar = createToolbar({
    preload: options.preload,
    log,
    position: settings.toolbar.position,
    scale: settings.toolbar.scale,
    orientation: settings.toolbar.orientation,
    onMoved: savePosition,
    onPanelClosed: () => {
      setRuntime({ panel: null });
      if (runtime.drawMode) toolbar.focus();
    },
  });
  const tray = createTray(options.trayIcon, {
    toggleDraw: () => setDrawMode(!runtime.drawMode),
    toggleToolbar: () => setToolbarVisible(!runtime.toolbarVisible),
    showToolbar: () => setToolbarVisible(true),
    clear,
    openSettings: () => {
      setToolbarVisible(true);
      openPanel('settings', anchors.get('settings') ?? { x: 0, y: 0, width: 40, height: 40 });
    },
    quit: () => app.quit(),
  });

  function state(): AppState {
    return { settings, runtime };
  }

  function publish(): void {
    const current = state();
    overlays.broadcast(current);
    toolbar.broadcast(current);
    tray.update({
      locale: runtime.locale,
      drawMode: runtime.drawMode,
      toolbarVisible: runtime.toolbarVisible,
    });
  }

  function setRuntime(change: Partial<Runtime>): void {
    runtime = { ...runtime, ...change };
    publish();
  }

  function applySettings(next: Settings): void {
    if (next === settings) return;
    const previous = settings;
    settings = next;
    store.save(next);
    if (next.shortcuts !== previous.shortcuts && !recording)
      runtime = { ...runtime, shortcutConflicts: register() };
    if (next.behavior.launchAtLogin !== previous.behavior.launchAtLogin) applyLoginItem();
    if (next.toolbar.theme !== previous.toolbar.theme) nativeTheme.themeSource = next.toolbar.theme;
    if (
      next.toolbar.scale !== previous.toolbar.scale ||
      next.toolbar.orientation !== previous.toolbar.orientation
    ) {
      toolbar.setLayout({ scale: next.toolbar.scale, orientation: next.toolbar.orientation });
    }
    runtime = { ...runtime, locale: resolveLocale(next.language, options.systemLocale) };
    publish();
  }

  function savePosition(position: Position): void {
    // Not published: no window renders the position, and dragging should stay cheap.
    settings = { ...settings, toolbar: { ...settings.toolbar, position } };
    store.save(settings);
  }

  function register(): ShortcutAction[] {
    return registerShortcuts(settings.shortcuts, runShortcut, log);
  }

  function runShortcut(action: ShortcutAction): void {
    const actions: Record<ShortcutAction, () => void> = {
      toggleDraw: () => setDrawMode(!runtime.drawMode),
      toggleInk,
      toggleToolbar: () => setToolbarVisible(!runtime.toolbarVisible),
      clear,
      undo,
      redo,
    };
    actions[action]();
  }

  function applyLoginItem(): void {
    if (options.platform === 'linux') return;
    app.setLoginItemSettings({ openAtLogin: settings.behavior.launchAtLogin });
  }

  function setDrawMode(enabled: boolean): void {
    if (enabled === runtime.drawMode) return;
    if (!enabled && settings.behavior.clearOnExit) clear();
    overlays.setDrawMode(enabled);
    runtime = { ...runtime, drawMode: enabled, inkVisible: enabled ? true : runtime.inkVisible };
    publish();
    if (enabled) {
      setToolbarVisible(true);
      toolbar.focus();
    }
  }

  function setToolbarVisible(visible: boolean): void {
    toolbar.setVisible(visible);
    if (!visible) runtime = { ...runtime, panel: null };
    setRuntime({ toolbarVisible: visible });
  }

  function toggleInk(): void {
    const inkVisible = !runtime.inkVisible;
    if (!inkVisible && runtime.drawMode) setDrawMode(false);
    setRuntime({ inkVisible });
  }

  function updateHistoryFlags(): void {
    setRuntime({
      canUndo: router.undo.length > 0,
      canRedo: router.redo.length > 0,
      hasInk: [...inkReports.values()].some((r) => r.strokeCount > 0),
    });
  }

  function undo(): void {
    const taken = takeUndo(router);
    if (taken === null) return;
    router = taken.state;
    for (const id of taken.displays) overlays.send(id, { type: 'undo' });
    updateHistoryFlags();
  }

  function redo(): void {
    const taken = takeRedo(router);
    if (taken === null) return;
    router = taken.state;
    for (const id of taken.displays) overlays.send(id, { type: 'redo' });
    updateHistoryFlags();
  }

  function clear(): void {
    const withInk = overlays
      .displayIds()
      .filter((id) => (inkReports.get(id)?.strokeCount ?? 0) > 0);
    if (withInk.length === 0) return;
    for (const id of withInk) overlays.send(id, { type: 'clear' });
    newStep(withInk);
  }

  function newStep(displays: readonly number[]): void {
    router = recordStep(router, displays);
    for (const id of overlays.displayIds()) {
      if (!displays.includes(id)) overlays.send(id, { type: 'dropRedo' });
    }
    updateHistoryFlags();
  }

  function openPanel(kind: PanelKind, anchor: Rect): void {
    anchors.set(kind, anchor);
    setRuntime({ panel: toolbar.togglePanel(kind, anchor) });
  }

  function closePanel(): void {
    toolbar.closePanel();
    setRuntime({ panel: null });
    if (runtime.drawMode) toolbar.focus();
  }

  function showNotice(notice: Notice): void {
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => setRuntime({ notice: null }), NOTICE_MS);
    runtime = { ...runtime, notice };
    const anchor = anchors.get('settings');
    if (anchor !== undefined && runtime.panel !== 'settings') openPanel('settings', anchor);
    else publish();
  }

  async function exportSettings(): Promise<void> {
    closePanel();
    const result = await toolbar.withDialogParent((parent) =>
      dialog.showSaveDialog(parent, {
        title: translate(runtime.locale, 'dialog.export'),
        defaultPath: 'pen-overlay-settings.json',
        filters: [{ name: translate(runtime.locale, 'dialog.filter'), extensions: ['json'] }],
      }),
    );
    if (result.canceled || result.filePath === undefined) return;
    try {
      store.exportTo(result.filePath, settings);
      showNotice({ kind: 'info', key: 'notice.exported' });
    } catch (error) {
      log.error('settings.export-failed', error);
      showNotice({ kind: 'error', key: 'notice.exportFailed' });
    }
  }

  async function importSettings(): Promise<void> {
    closePanel();
    const result = await toolbar.withDialogParent((parent) =>
      dialog.showOpenDialog(parent, {
        title: translate(runtime.locale, 'dialog.import'),
        properties: ['openFile'],
        filters: [{ name: translate(runtime.locale, 'dialog.filter'), extensions: ['json'] }],
      }),
    );
    const file = result.filePaths[0];
    if (result.canceled || file === undefined) return;
    const imported = store.importFrom(file);
    if (imported === null) {
      showNotice({ kind: 'error', key: 'notice.importFailed' });
      return;
    }
    // The toolbar stays where it is on this machine's screens.
    applySettings({
      ...imported,
      toolbar: { ...imported.toolbar, position: settings.toolbar.position },
    });
    showNotice({ kind: 'info', key: 'notice.imported' });
  }

  function setRecording(active: boolean): void {
    recording = active;
    if (active) unregisterShortcuts();
    else setRuntime({ shortcutConflicts: register() });
  }

  const intents: {
    readonly [K in Intent['type']]: (request: Extract<Intent, { type: K }>) => void;
  } = {
    setDrawMode: (request) => setDrawMode(request.enabled),
    toggleDraw: () => setDrawMode(!runtime.drawMode),
    toggleInk,
    undo,
    redo,
    clear,
    openPanel: (request) => openPanel(request.panel, request.anchor),
    closePanel: () => {
      if (runtime.panel !== null) closePanel();
    },
    recordingShortcut: (request) => setRecording(request.active),
    exportSettings: () => {
      exportSettings().catch((error: unknown) => log.error('settings.export-crashed', error));
    },
    importSettings: () => {
      importSettings().catch((error: unknown) => log.error('settings.import-crashed', error));
    },
    hideToolbar: () => setToolbarVisible(false),
    quit: () => app.quit(),
  };

  function intent(request: Intent): void {
    (intents[request.type] as (r: Intent) => void)(request);
  }

  nativeTheme.themeSource = settings.toolbar.theme;
  runtime = { ...runtime, shortcutConflicts: register() };
  overlays.sync();
  publish();
  if (settings.behavior.drawOnLaunch) setDrawMode(true);
  log.info('app.started', {
    version: options.version,
    platform: options.platform,
    locale: runtime.locale,
  });

  return {
    command: (command) => {
      applySettings(reduce(settings, command));
      if (COLOR_COMMANDS.has(command.type)) setDrawMode(true);
    },
    intent,
    reportInk: (webContentsId, report) => {
      const displayId = overlays.displayOf(webContentsId);
      if (displayId === null) return;
      inkReports.set(displayId, report);
      if (report.committed) newStep([displayId]);
      else updateHistoryFlags();
    },
    reportSize: (webContentsId, size) => toolbar.reportSize(webContentsId, size),
    pageOf: (webContentsId) =>
      overlays.displayOf(webContentsId) !== null ? 'overlay' : toolbar.pageOf(webContentsId),
    showToolbar: () => setToolbarVisible(true),
    onDisplaysChanged: () => {
      overlays.sync();
      toolbar.raise();
    },
    shutdown: () => {
      unregisterShortcuts();
      store.flush();
    },
  };
}
