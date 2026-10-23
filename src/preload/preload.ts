import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../shared/channels';
import type { AppState, InkOrder, PenOverlayApi } from '../shared/ipc';

// The whole surface a page gets: typed sends and two listeners. Raw
// ipcRenderer is never exposed; the main process validates every message.
const api: PenOverlayApi = {
  onState: (listener) => {
    ipcRenderer.on(CHANNELS.state, (_event, state: AppState) => listener(state));
  },
  onInkOrder: (listener) => {
    ipcRenderer.on(CHANNELS.inkOrder, (_event, order: InkOrder) => listener(order));
  },
  command: (command) => ipcRenderer.send(CHANNELS.command, command),
  intent: (intent) => ipcRenderer.send(CHANNELS.intent, intent),
  reportSize: (size) => ipcRenderer.send(CHANNELS.size, size),
  reportInk: (report) => ipcRenderer.send(CHANNELS.inkReport, report),
};

contextBridge.exposeInMainWorld('penOverlay', api);
