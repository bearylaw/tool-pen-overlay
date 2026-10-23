import { BrowserWindow, type Display, screen } from 'electron';
import { CHANNELS } from '../shared/channels';
import type { AppState, InkOrder } from '../shared/ipc';
import type { Logger } from './logger';
import { pageUrl, securePreferences } from './web';

/** One transparent, always-on-top drawing surface per display. */
export interface OverlayManager {
  /** Creates, moves or removes overlays to match the connected displays. */
  readonly sync: () => void;
  readonly setDrawMode: (enabled: boolean) => void;
  readonly send: (displayId: number, order: InkOrder) => void;
  readonly broadcast: (state: AppState) => void;
  /** Display id for a renderer, or `null` when it is not an overlay. */
  readonly displayOf: (webContentsId: number) => number | null;
  readonly displayIds: () => readonly number[];
  readonly webContentsIds: () => readonly number[];
}

export interface OverlayOptions {
  readonly preload: string;
  readonly log: Logger;
  /** A display disappeared; its strokes are gone. */
  readonly onRemoved: (displayId: number) => void;
  /** Overlays were (re)created and need the current state. */
  readonly onCreated: () => void;
}

/** Creates the manager. Call `sync` once the app is ready and on display changes. */
export function createOverlayManager(options: OverlayOptions): OverlayManager {
  const windows = new Map<number, BrowserWindow>();
  let drawMode = false;
  let lastState: AppState | null = null;

  const create = (display: Display): BrowserWindow => {
    const win = new BrowserWindow({
      ...display.bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // Never takes focus: clicks draw without activating, so the window
      // never jumps above the toolbar and keyboard focus stays where it was.
      focusable: false,
      alwaysOnTop: true,
      enableLargerThanScreen: true,
      roundedCorners: false,
      thickFrame: false,
      webPreferences: securePreferences(options.preload),
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (process.platform === 'darwin') win.setHiddenInMissionControl(true);
    win.setIgnoreMouseEvents(!drawMode);
    win.webContents.on('did-finish-load', () => {
      if (lastState !== null) win.webContents.send(CHANNELS.state, lastState);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      options.log.error('overlay.crashed', new Error(details.reason), { displayId: display.id });
    });
    win.once('ready-to-show', () => {
      win.showInactive();
      // Windows sizes a window by the DPI of the display it was created on;
      // setting the bounds again once shown fixes mixed-DPI setups.
      win.setBounds(display.bounds);
      options.onCreated();
    });
    void win.loadURL(pageUrl('overlay'));
    return win;
  };

  const sync = (): void => {
    const displays = screen.getAllDisplays();
    const ids = new Set(displays.map((d) => d.id));
    for (const [id, win] of windows) {
      if (ids.has(id)) continue;
      win.destroy();
      windows.delete(id);
      options.onRemoved(id);
    }
    for (const display of displays) {
      const existing = windows.get(display.id);
      if (existing === undefined) windows.set(display.id, create(display));
      else existing.setBounds(display.bounds);
    }
    options.log.info('overlays.synced', { displays: displays.length });
  };

  return {
    sync,
    setDrawMode: (enabled) => {
      drawMode = enabled;
      for (const win of windows.values()) win.setIgnoreMouseEvents(!enabled);
    },
    send: (displayId, order) => windows.get(displayId)?.webContents.send(CHANNELS.inkOrder, order),
    broadcast: (state) => {
      lastState = state;
      for (const win of windows.values()) win.webContents.send(CHANNELS.state, state);
    },
    displayOf: (webContentsId) => {
      for (const [id, win] of windows) if (win.webContents.id === webContentsId) return id;
      return null;
    },
    displayIds: () => [...windows.keys()],
    webContentsIds: () => [...windows.values()].map((w) => w.webContents.id),
  };
}
