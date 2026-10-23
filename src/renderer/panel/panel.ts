import '../ui/theme.css';
import './panel.css';
import type { AppState, PanelKind } from '../../shared/ipc';
import { api, bindAppKeys, reportSizeOf } from '../ui/api';
import { h } from '../ui/dom';
import { colorPanel } from './color-panel';
import type { View } from './controls';
import { settingsPanel } from './settings-panel';
import { shapePanel, sizePanel } from './size-panel';

const FACTORIES: Readonly<Record<PanelKind, () => View<AppState>>> = {
  color: colorPanel,
  size: sizePanel,
  shape: shapePanel,
  settings: settingsPanel,
};

let state: AppState | null = null;
let current: { readonly kind: PanelKind; readonly view: View<AppState> } | null = null;

const frame = h('div', { className: 'frame' });
document.body.append(frame);
const report = reportSizeOf(frame);

function render(next: AppState): void {
  state = next;
  document.documentElement.lang = next.runtime.locale;
  const kind = next.runtime.panel;
  if (kind === null) {
    current = null;
    frame.replaceChildren();
    return;
  }
  if (current?.kind !== kind) {
    current = { kind, view: FACTORIES[kind]() };
    frame.replaceChildren(current.view.root);
    current.view.update(next);
    // A new panel may have the same size as the last one, in which case the
    // resize observer stays silent; the main process waits for a report.
    requestAnimationFrame(() => {
      report();
      // Focus the dialog itself: screen readers announce it, Tab reaches its controls.
      current?.view.root.focus({ preventScroll: true });
    });
    return;
  }
  current.view.update(next);
}

// Escape closes the panel before anything else sees it.
document.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    api.intent({ type: 'closePanel' });
  },
  { capture: false },
);
bindAppKeys(() => state);
api.onState(render);
