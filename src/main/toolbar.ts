import { BrowserWindow, screen } from 'electron';
import { CHANNELS } from '../shared/channels';
import type { AppState, ContentSize, PanelKind, Rect } from '../shared/ipc';
import { clampPosition, pickArea, placePanel } from '../shared/placement';
import type { Orientation, Position } from '../shared/settings';
import type { Logger } from './logger';
import { type Page, pageUrl, securePreferences } from './web';

/** The draggable toolbar and the single panel window that opens beside it. */
export interface ToolbarManager {
  readonly broadcast: (state: AppState) => void;
  readonly setLayout: (layout: { scale: number; orientation: Orientation }) => void;
  readonly reportSize: (webContentsId: number, size: ContentSize) => void;
  /** Opens a panel or, when the same one is already open, closes it. Returns the panel now open. */
  readonly togglePanel: (kind: PanelKind, anchor: Rect) => PanelKind | null;
  readonly closePanel: () => void;
  readonly isVisible: () => boolean;
  readonly setVisible: (visible: boolean) => void;
  readonly focus: () => void;
  readonly raise: () => void;
  /** Runs a native dialog owned by the toolbar so it shows above the overlays. */
  readonly withDialogParent: <T>(run: (parent: BrowserWindow) => Promise<T>) => Promise<T>;
  readonly pageOf: (webContentsId: number) => Page | null;
}

export interface ToolbarOptions {
  readonly preload: string;
  readonly log: Logger;
  readonly position: Position | null;
  readonly scale: number;
  readonly orientation: Orientation;
  readonly onMoved: (position: Position) => void;
  /** The panel closed on its own (focus left it). */
  readonly onPanelClosed: () => void;
}

// Reopening the panel a moment after it closed on blur means the user
// clicked its toolbar button to close it; do not reopen.
const REOPEN_GUARD_MS = 250;

function chromeless(preload: string): Electron.BrowserWindowConstructorOptions {
  return {
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    useContentSize: true,
    roundedCorners: false,
    thickFrame: false,
    webPreferences: securePreferences(preload),
  };
}

/** Creates both windows; the toolbar shows once it has measured itself. */
export function createToolbar(options: ToolbarOptions): ToolbarManager {
  const toolbar = new BrowserWindow({ ...chromeless(options.preload), width: 480, height: 64 });
  const panel = new BrowserWindow({ ...chromeless(options.preload), width: 320, height: 400 });
  for (const win of [toolbar, panel]) {
    win.setAlwaysOnTop(true, 'screen-saver', 1);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (process.platform === 'darwin') win.setHiddenInMissionControl(true);
  }

  let layout = { scale: options.scale, orientation: options.orientation };
  let toolbarSize: ContentSize | null = null;
  let panelSize: ContentSize | null = null;
  let panelKind: PanelKind | null = null;
  let anchor: Rect | null = null;
  let closedOnBlurAt = 0;
  let closedKind: PanelKind | null = null;
  let movingProgrammatically = false;
  let placed = false;
  let wantVisible = true;
  let dialogOpen = false;
  let lastState: AppState | null = null;

  const workAreas = (): Rect[] => screen.getAllDisplays().map((d) => d.workArea);

  const setBounds = (win: BrowserWindow, bounds: Rect): void => {
    movingProgrammatically = true;
    win.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
    movingProgrammatically = false;
  };

  const layoutToolbar = (): void => {
    if (toolbarSize === null) return;
    const width = Math.ceil(toolbarSize.width * layout.scale);
    const height = Math.ceil(toolbarSize.height * layout.scale);
    const current = toolbar.getBounds();
    const start = placed ? current : initialPosition(options.position, width);
    const area =
      pickArea({ ...start, width, height }, workAreas()) ?? screen.getPrimaryDisplay().workArea;
    const position = clampPosition(start, { width, height }, area);
    setBounds(toolbar, { ...position, width, height });
    placed = true;
    if (!toolbar.isVisible() && wantVisible) toolbar.showInactive();
  };

  const layoutPanel = (): void => {
    if (panelKind === null || panelSize === null || anchor === null) return;
    const bar = toolbar.getContentBounds();
    const size = {
      width: Math.ceil(panelSize.width * layout.scale),
      height: Math.ceil(panelSize.height * layout.scale),
    };
    const screenAnchor = {
      x: bar.x + anchor.x * layout.scale,
      y: bar.y + anchor.y * layout.scale,
      width: anchor.width * layout.scale,
      height: anchor.height * layout.scale,
    };
    const workArea = screen.getDisplayMatching(bar).workArea;
    const position = placePanel({
      anchor: screenAnchor,
      toolbar: bar,
      panel: size,
      workArea,
      orientation: layout.orientation,
    });
    setBounds(panel, { ...position, ...size });
    if (!panel.isVisible()) {
      panel.show();
      panel.focus();
    }
  };

  const hidePanel = (): void => {
    panelKind = null;
    panelSize = null;
    if (panel.isVisible()) panel.hide();
  };

  panel.on('blur', () => {
    if (dialogOpen || panelKind === null) return;
    closedOnBlurAt = Date.now();
    closedKind = panelKind;
    hidePanel();
    options.onPanelClosed();
  });
  toolbar.on('move', () => {
    if (!movingProgrammatically && panelKind !== null) {
      hidePanel();
      options.onPanelClosed();
    }
  });
  toolbar.on('moved', () => {
    const { x, y } = toolbar.getBounds();
    options.onMoved({ x, y });
  });

  for (const [win, page] of [
    [toolbar, 'toolbar'],
    [panel, 'panel'],
  ] as const) {
    win.webContents.on('did-finish-load', () => {
      win.webContents.setZoomFactor(layout.scale);
      if (lastState !== null) win.webContents.send(CHANNELS.state, lastState);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      options.log.error(`${page}.crashed`, new Error(details.reason));
    });
    void win.loadURL(pageUrl(page));
  }

  return {
    broadcast: (state) => {
      lastState = state;
      toolbar.webContents.send(CHANNELS.state, state);
      panel.webContents.send(CHANNELS.state, state);
    },
    setLayout: (next) => {
      const scaleChanged = next.scale !== layout.scale;
      layout = next;
      if (scaleChanged) {
        toolbar.webContents.setZoomFactor(next.scale);
        panel.webContents.setZoomFactor(next.scale);
        layoutToolbar();
        layoutPanel();
      }
    },
    reportSize: (webContentsId, size) => {
      if (webContentsId === toolbar.webContents.id) {
        toolbarSize = size;
        layoutToolbar();
        layoutPanel();
      } else if (webContentsId === panel.webContents.id && panelKind !== null) {
        panelSize = size;
        layoutPanel();
      }
    },
    togglePanel: (kind, at) => {
      const justClosed = closedKind === kind && Date.now() - closedOnBlurAt < REOPEN_GUARD_MS;
      if (panelKind === kind || justClosed) {
        hidePanel();
        closedKind = null;
        return null;
      }
      panelKind = kind;
      anchor = at;
      panelSize = null;
      return kind;
    },
    closePanel: hidePanel,
    isVisible: () => wantVisible,
    setVisible: (visible) => {
      wantVisible = visible;
      if (visible) {
        if (toolbarSize !== null) toolbar.showInactive();
      } else {
        hidePanel();
        toolbar.hide();
      }
    },
    focus: () => {
      if (wantVisible && toolbar.isVisible() && panelKind === null) toolbar.focus();
    },
    raise: () => {
      toolbar.moveTop();
      if (panel.isVisible()) panel.moveTop();
    },
    withDialogParent: async (run) => {
      dialogOpen = true;
      try {
        return await run(toolbar);
      } finally {
        dialogOpen = false;
      }
    },
    pageOf: (id) =>
      id === toolbar.webContents.id ? 'toolbar' : id === panel.webContents.id ? 'panel' : null,
  };
}

function initialPosition(saved: Position | null, width: number): Position {
  if (saved !== null) return saved;
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + 16 };
}
