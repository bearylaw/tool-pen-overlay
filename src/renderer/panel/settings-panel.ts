import type { CommandInput } from '../../shared/commands';
import type { AppState } from '../../shared/ipc';
import { formatAccelerator, recordShortcut } from '../../shared/keymap';
import {
  BEHAVIOR_FLAGS,
  type BehaviorFlag,
  LANGUAGES,
  ORIENTATIONS,
  SCALE_MAX,
  SCALE_MIN,
  SHORTCUT_ACTIONS,
  type ShortcutAction,
  STARTUP_MODES,
  THEMES,
  TOOLBAR_STYLES,
} from '../../shared/settings';
import { api, type Translate, translator } from '../ui/api';
import { h, setAttr } from '../ui/dom';
import {
  card,
  iconButton,
  name,
  segmented,
  setText,
  textButton,
  toggle,
  type View,
} from './controls';

const send = (command: CommandInput): void => api.command(command);

function section(heading: HTMLElement, children: readonly HTMLElement[]): HTMLElement {
  return h('section', { className: 'settings-section' }, [heading, ...children]);
}

function field(label: HTMLElement, control: HTMLElement): HTMLElement {
  return h('div', { className: 'field' }, [label, control]);
}

/** Toolbar, drawing, behaviour, defaults, shortcuts, file and app settings. */
export function settingsPanel(): View<AppState> {
  const headings = {
    toolbar: h('h3'),
    drawing: h('h3'),
    behavior: h('h3'),
    defaults: h('h3'),
    shortcuts: h('h3'),
    keys: h('h3'),
    data: h('h3'),
  };
  const labels = {
    orientation: h('span', { className: 'field-label' }),
    style: h('span', { className: 'field-label' }),
    scale: h('label', { className: 'field-label', attrs: { for: 'scale' } }),
    theme: h('span', { className: 'field-label' }),
    language: h('label', { className: 'field-label', attrs: { for: 'language' } }),
    startup: h('span', { className: 'field-label' }),
    opacity: h('label', { className: 'field-label', attrs: { for: 'opacity' } }),
  };

  const orientation = segmented(ORIENTATIONS, (value) =>
    send({ type: 'setOrientation', orientation: value }),
  );
  const theme = segmented(THEMES, (value) => send({ type: 'setTheme', theme: value }));
  const startup = segmented(STARTUP_MODES, (mode) => send({ type: 'setStartup', mode }));

  // Applied on release: the panel scales with the toolbar, so applying while
  // dragging would move the slider out from under the pointer.
  const scaleValue = h('output', { className: 'muted' });
  const scale = h('input', {
    attrs: { id: 'scale', type: 'range', min: SCALE_MIN * 100, max: SCALE_MAX * 100, step: 5 },
  });
  scale.addEventListener('input', () => {
    scaleValue.textContent = `${scale.value} %`;
  });
  scale.addEventListener('change', () =>
    send({ type: 'setScale', scale: Number(scale.value) / 100 }),
  );

  const language = h('select', { attrs: { id: 'language' } });
  language.addEventListener('change', () => {
    const value = LANGUAGES.find((l) => l === language.value);
    if (value !== undefined) send({ type: 'setLanguage', language: value });
  });

  const style = segmented(TOOLBAR_STYLES, (value) =>
    send({ type: 'setToolbarStyle', style: value }),
  );
  const pressure = toggle((enabled) => send({ type: 'setPressure', enabled }));
  const opacityValue = h('output', { className: 'muted' });
  const opacity = h('input', {
    attrs: { id: 'opacity', type: 'range', min: 10, max: 90, step: 5 },
  });
  opacity.addEventListener('input', () =>
    send({ type: 'setHighlighterOpacity', opacity: Number(opacity.value) / 100 }),
  );

  const behavior = Object.fromEntries(
    BEHAVIOR_FLAGS.map((flag) => [
      flag,
      toggle((enabled) => send({ type: 'setBehavior', flag, enabled })),
    ]),
  ) as Record<BehaviorFlag, ReturnType<typeof toggle>>;

  const defaultsSwatch = h('span', { className: 'mini-swatch' });
  const defaultsText = h('span');
  const saveDefaults = textButton('plus', () => send({ type: 'saveDefaults' }));
  const applyDefaults = textButton(null, () => send({ type: 'applyDefaults' }));

  const shortcutsHint = h('p', { className: 'hint muted' });
  const recorders = SHORTCUT_ACTIONS.map((action) => recorder(action));
  const resetShortcuts = textButton(null, () => send({ type: 'resetShortcuts' }));

  const keyLines = [h('p'), h('p'), h('p'), h('p')];

  const exportButton = textButton(null, () => api.intent({ type: 'exportSettings' }));
  const importButton = textButton(null, () => api.intent({ type: 'importSettings' }));
  let resetArmed = false;
  const resetButton = textButton(
    null,
    () => {
      if (resetArmed) {
        resetArmed = false;
        send({ type: 'resetAll' });
      } else {
        resetArmed = true;
        if (state !== null) update(state);
      }
    },
    'danger',
  );
  resetButton.addEventListener('blur', () => {
    resetArmed = false;
    if (state !== null) update(state);
  });

  const notice = h('p', { className: 'notice', attrs: { role: 'status' } });
  const version = h('span', { className: 'muted' });
  const hideToolbar = textButton(null, () => api.intent({ type: 'hideToolbar' }));
  const quit = textButton('power', () => api.intent({ type: 'quit' }), 'danger');

  const title = h('h2');
  const close = iconButton('close', () => api.intent({ type: 'closePanel' }));
  const scroller = h('div', { className: 'scroll' }, [
    notice,
    section(headings.toolbar, [
      field(labels.style, style.el),
      field(labels.orientation, orientation.el),
      field(h('div', { className: 'row between' }, [labels.scale, scaleValue]), scale),
      field(labels.theme, theme.el),
      field(labels.language, language),
    ]),
    section(headings.drawing, [
      pressure.el,
      field(h('div', { className: 'row between' }, [labels.opacity, opacityValue]), opacity),
    ]),
    section(
      headings.behavior,
      BEHAVIOR_FLAGS.map((flag) => behavior[flag].el),
    ),
    section(headings.defaults, [
      field(labels.startup, startup.el),
      h('p', { className: 'row defaults-line' }, [defaultsSwatch, defaultsText]),
      h('div', { className: 'row wrap' }, [saveDefaults, applyDefaults]),
    ]),
    section(headings.shortcuts, [
      shortcutsHint,
      ...recorders.map((r) => r.el),
      h('div', { className: 'row' }, [resetShortcuts]),
    ]),
    section(
      headings.keys,
      keyLines.map((line) => {
        line.className = 'hint muted';
        return line;
      }),
    ),
    section(headings.data, [
      h('div', { className: 'row wrap' }, [exportButton, importButton, resetButton]),
    ]),
    h('footer', { className: 'row between wrap' }, [
      version,
      h('div', { className: 'row' }, [hideToolbar, quit]),
    ]),
  ]);
  const root = card(title, close, [scroller]);
  root.classList.add('settings-panel');

  let state: AppState | null = null;

  function update(current: AppState): void {
    state = current;
    const t = translator(current);
    const { runtime } = current;
    title.textContent = t('settings.title');
    setAttr(root, 'aria-label', t('settings.title'));
    name(close, t('action.close'));
    notice.hidden = runtime.notice === null;
    notice.textContent = runtime.notice === null ? '' : t(runtime.notice.key);
    notice.classList.toggle('error', runtime.notice?.kind === 'error');
    updateToolbar(current, t);
    updateDrawing(current, t);
    updateDefaults(current, t);
    updateRest(current, t);
  }

  function updateToolbar({ settings: s }: AppState, t: Translate): void {
    headings.toolbar.textContent = t('section.toolbar');
    labels.style.textContent = t('style.label');
    style.update(
      s.toolbar.style,
      { full: t('style.full'), compact: t('style.compact') },
      t('style.label'),
    );
    labels.orientation.textContent = t('orientation.label');
    orientation.update(
      s.toolbar.orientation,
      { horizontal: t('orientation.horizontal'), vertical: t('orientation.vertical') },
      t('orientation.label'),
    );
    labels.scale.textContent = t('scale.label');
    if (document.activeElement !== scale) {
      scale.value = String(Math.round(s.toolbar.scale * 100));
      scaleValue.textContent = `${scale.value} %`;
    }
    labels.theme.textContent = t('theme.label');
    theme.update(
      s.toolbar.theme,
      { system: t('theme.system'), dark: t('theme.dark'), light: t('theme.light') },
      t('theme.label'),
    );
    labels.language.textContent = t('language.label');
    if (language.options.length === 0)
      language.append(...LANGUAGES.map((l) => h('option', { attrs: { value: l } })));
    for (const option of language.options)
      option.textContent = t(`language.${option.value as (typeof LANGUAGES)[number]}`);
    language.value = s.language;
  }

  function updateDrawing({ settings: s, runtime }: AppState, t: Translate): void {
    headings.drawing.textContent = t('section.drawing');
    pressure.update(s.drawing.pressure, t('pressure.label'));
    labels.opacity.textContent = t('size.opacity');
    const pct = Math.round(s.drawing.highlighterOpacity * 100);
    opacityValue.textContent = `${pct} %`;
    if (document.activeElement !== opacity) opacity.value = String(pct);

    headings.behavior.textContent = t('section.behavior');
    for (const flag of BEHAVIOR_FLAGS)
      behavior[flag].update(s.behavior[flag], t(`behavior.${flag}`));
    behavior.launchAtLogin.el.hidden = runtime.platform === 'linux';
  }

  function updateDefaults({ settings: s }: AppState, t: Translate): void {
    headings.defaults.textContent = t('section.defaults');
    labels.startup.textContent = t('startup.label');
    startup.update(
      s.startup,
      { last: t('startup.last'), defaults: t('startup.defaults') },
      t('startup.label'),
    );
    const d = s.defaults;
    defaultsSwatch.style.background = d.color;
    defaultsText.textContent = t('defaults.current', {
      tool: t(`tool.${d.tool}`),
      size: d.sizes[d.tool],
      color: d.color.toUpperCase(),
    });
    setText(saveDefaults, t('defaults.save'));
    setText(applyDefaults, t('defaults.apply'));
  }

  function updateRest(current: AppState, t: Translate): void {
    const { runtime } = current;

    headings.shortcuts.textContent = t('section.shortcuts');
    shortcutsHint.textContent = t('shortcuts.hint');
    for (const r of recorders) r.update(current, t);
    setText(resetShortcuts, t('shortcuts.reset'));

    headings.keys.textContent = t('section.keys');
    const lines = [
      t('keys.tools'),
      t('keys.shapes'),
      t('keys.colors'),
      t(runtime.platform === 'darwin' ? 'keys.editMac' : 'keys.edit'),
    ];
    for (const [i, line] of keyLines.entries()) line.textContent = lines[i] ?? '';

    headings.data.textContent = t('section.data');
    setText(exportButton, t('data.export'));
    setText(importButton, t('data.import'));
    setText(resetButton, t(resetArmed ? 'data.resetConfirm' : 'data.reset'));

    version.textContent = t('about.version', { version: runtime.version });
    setText(hideToolbar, t('about.hideToolbar'));
    setText(quit, t('about.quit'));
  }

  return { root, update };
}

/** A row that shows a global shortcut and records a new one when clicked. */
function recorder(action: ShortcutAction): {
  el: HTMLElement;
  update: (state: AppState, t: Translate) => void;
} {
  let recording = false;
  let state: AppState | null = null;
  let translate: Translate | null = null;
  const label = h('span', { className: 'field-label' });
  const keys = h('button', { className: 'recorder', attrs: { type: 'button' } });
  const warning = h('span', { className: 'warning' });

  const stop = (): void => {
    if (!recording) return;
    recording = false;
    api.intent({ type: 'recordingShortcut', active: false });
    paint();
  };
  const paint = (): void => {
    if (state === null || translate === null) return;
    const accelerator = state.settings.shortcuts[action];
    keys.textContent = recording
      ? translate('shortcut.recording')
      : accelerator === ''
        ? translate('shortcut.none')
        : formatAccelerator(accelerator, state.runtime.platform);
    keys.classList.toggle('recording', recording);
    setAttr(keys, 'aria-label', `${translate(`shortcut.${action}`)}: ${keys.textContent}`);
    const conflict = state.runtime.shortcutConflicts.includes(action);
    warning.textContent = conflict ? translate('shortcut.conflict') : '';
    warning.hidden = !conflict;
  };

  keys.addEventListener('click', () => {
    if (recording) return;
    recording = true;
    api.intent({ type: 'recordingShortcut', active: true });
    paint();
  });
  keys.addEventListener('blur', stop);
  keys.addEventListener('keydown', (event) => {
    if (!recording || state === null) return;
    event.preventDefault();
    event.stopPropagation();
    const result = recordShortcut(event, state.runtime.platform);
    if (result.kind === 'incomplete') return;
    if (result.kind === 'clear') api.command({ type: 'setShortcut', action, accelerator: '' });
    if (result.kind === 'accelerator')
      api.command({ type: 'setShortcut', action, accelerator: result.accelerator });
    stop();
  });

  return {
    el: h('div', { className: 'shortcut-row' }, [
      label,
      h('div', { className: 'stack end' }, [keys, warning]),
    ]),
    update: (next, t) => {
      state = next;
      translate = t;
      label.textContent = t(`shortcut.${action}`);
      paint();
    },
  };
}
