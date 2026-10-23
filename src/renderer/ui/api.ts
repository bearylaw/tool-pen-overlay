import { type MessageKey, translate } from '../../shared/i18n';
import type { AppState, PenOverlayApi } from '../../shared/ipc';
import { keyAction } from '../../shared/keymap';
import { isTyping } from './dom';

declare global {
  interface Window {
    readonly penOverlay: PenOverlayApi;
  }
}

/** The preload bridge. */
export const api: PenOverlayApi = window.penOverlay;

/** Translator bound to the state's locale. */
export type Translate = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string;

/** Returns a translator for the given state. */
export function translator(state: AppState): Translate {
  return (key, params) => translate(state.runtime.locale, key, params);
}

/**
 * Routes app key bindings (tools, colours, undo…) to the main process while
 * this window has focus. Typing into a field is left alone.
 */
export function bindAppKeys(getState: () => AppState | null): void {
  document.addEventListener('keydown', (event) => {
    const state = getState();
    if (state === null || event.defaultPrevented || event.repeat || isTyping(event.target)) return;
    const action = keyAction(event, state.runtime.platform);
    if (action === null) return;
    event.preventDefault();
    if (action.kind === 'command') api.command(action.command);
    else api.intent(action.intent);
  });
}

/**
 * Reports the size of `el` to the main process whenever it changes, so the
 * window always fits its content exactly.
 */
export function reportSizeOf(el: HTMLElement): () => void {
  const report = (): void => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0)
      api.reportSize({ width: Math.ceil(r.width), height: Math.ceil(r.height) });
  };
  new ResizeObserver(report).observe(el);
  return report;
}
