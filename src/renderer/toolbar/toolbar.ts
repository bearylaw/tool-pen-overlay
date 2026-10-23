import '../ui/theme.css';
import './toolbar.css';
import type { CommandInput } from '../../shared/commands';
import type { AppState, PanelKind } from '../../shared/ipc';
import { activePalette, COMPACT_COLORS, type Shape, type Tool } from '../../shared/settings';
import { api, bindAppKeys, reportSizeOf, translator } from '../ui/api';
import { h, replaceChildrenIfChanged, setAttr, viewportRect } from '../ui/dom';
import { type IconName, icon } from '../ui/icons';

let state: AppState | null = null;

const SHAPE_ICONS: Readonly<Record<Shape, IconName>> = {
  line: 'line',
  arrow: 'arrow',
  rect: 'rect',
  ellipse: 'ellipse',
};

function button(iconName: IconName, onClick: (el: HTMLButtonElement) => void): HTMLButtonElement {
  const el: HTMLButtonElement = h('button', { className: 'btn', attrs: { type: 'button' } }, [
    icon(iconName),
  ]);
  el.addEventListener('click', () => onClick(el));
  return el;
}

function openPanel(panel: PanelKind, anchor: HTMLElement): void {
  api.intent({ type: 'openPanel', panel, anchor: viewportRect(anchor) });
}

function send(command: CommandInput): void {
  api.command(command);
}

const grip = h('div', { className: 'grip' }, [icon('grip')]);
const cursor = button('cursor', () => api.intent({ type: 'setDrawMode', enabled: false }));
const toolButtons: Record<Tool, HTMLButtonElement> = {
  pen: button('pen', () => send({ type: 'setTool', tool: 'pen' })),
  highlighter: button('highlighter', () => send({ type: 'setTool', tool: 'highlighter' })),
  shape: button('arrow', (el) => {
    // A second click on the active shape tool opens the shape picker.
    if (state?.runtime.drawMode === true && state.settings.tool.tool === 'shape')
      openPanel('shape', el);
    else send({ type: 'setTool', tool: 'shape' });
  }),
  eraser: button('eraser', () => send({ type: 'setTool', tool: 'eraser' })),
};
toolButtons.shape.classList.add('has-more');
toolButtons.shape.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  openPanel('shape', toolButtons.shape);
});

const swatches = h('div', { className: 'swatches' });
const customColor = h('button', { className: 'btn color-more', attrs: { type: 'button' } }, [
  h('span', { className: 'ring' }, [h('span', { className: 'fill' })]),
]);
customColor.addEventListener('click', () => openPanel('color', customColor));

const sizeDot = h('span', { className: 'dot' });
const size = h('button', { className: 'btn size', attrs: { type: 'button' } }, [sizeDot]);
size.addEventListener('click', () => openPanel('size', size));
size.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    send({ type: 'nudgeSize', direction: event.deltaY < 0 ? 1 : -1 });
  },
  { passive: false },
);

const undo = button('undo', () => api.intent({ type: 'undo' }));
const redo = button('redo', () => api.intent({ type: 'redo' }));
const clear = button('trash', () => api.intent({ type: 'clear' }));
const ink = button('eye', () => api.intent({ type: 'toggleInk' }));
const settings = button('settings', (el) => openPanel('settings', el));

const sep = (): HTMLElement => h('div', { className: 'sep', attrs: { role: 'separator' } });

// Hidden in compact mode, together with the shape tool and the colour picker.
const sizeSeparator = sep();

const bar = h('div', { className: 'bar card', attrs: { role: 'toolbar' } }, [
  grip,
  h('div', { className: 'group', attrs: { role: 'group' } }, [
    cursor,
    toolButtons.pen,
    toolButtons.highlighter,
    toolButtons.shape,
    toolButtons.eraser,
  ]),
  sep(),
  h('div', { className: 'group colors', attrs: { role: 'group' } }, [swatches, customColor]),
  sizeSeparator,
  size,
  sep(),
  h('div', { className: 'group', attrs: { role: 'group' } }, [undo, redo, clear, ink]),
  sep(),
  settings,
]);

const frame = h('div', { className: 'frame' }, [bar]);
document.body.append(frame);
const measure = reportSizeOf(frame);

function label(el: HTMLElement, text: string, keys?: string): void {
  setAttr(el, 'aria-label', text);
  setAttr(el, 'title', keys === undefined ? text : `${text} (${keys})`);
  if (keys !== undefined) setAttr(el, 'aria-keyshortcuts', keys);
}

function renderSwatches(current: AppState): void {
  const t = translator(current);
  const palette = activePalette(current.settings);
  const compact = current.settings.toolbar.style === 'compact';
  const colors = compact ? palette.colors.slice(0, COMPACT_COLORS) : palette.colors;
  replaceChildrenIfChanged(swatches, `${current.runtime.locale}:${colors.join(',')}`, () =>
    colors.map((color, index) => {
      const swatch = h('button', {
        className: 'swatch',
        attrs: { type: 'button', 'data-color': color },
        on: { click: () => send({ type: 'selectPaletteColor', index }) },
      });
      // Right-click reaches the colour picker, the only way to it in compact mode.
      swatch.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        openPanel('color', swatch);
      });
      swatch.style.setProperty('--swatch', color);
      const name = t('color.swatch', { hex: color.toUpperCase() });
      label(
        swatch,
        t('color.swatchMore', { color: name }),
        index < 9 ? String(index + 1) : undefined,
      );
      return swatch;
    }),
  );
  const active = current.settings.tool.color;
  for (const el of swatches.children) {
    setAttr(el, 'aria-pressed', (el as HTMLElement).dataset.color === active ? 'true' : 'false');
  }
}

function renderSize(current: AppState): void {
  const { tool, sizes, color } = current.settings.tool;
  const px = sizes[tool];
  const diameter = 4 + 16 * Math.sqrt((px - 1) / 95);
  sizeDot.style.width = `${diameter}px`;
  sizeDot.style.height = `${diameter}px`;
  sizeDot.style.setProperty('--dot', color);
  sizeDot.classList.toggle('outline', tool === 'eraser');
  sizeDot.style.opacity =
    tool === 'highlighter'
      ? String(Math.max(0.45, current.settings.drawing.highlighterOpacity))
      : '1';
}

function render(current: AppState): void {
  const t = translator(current);
  const { settings: s, runtime } = current;
  document.documentElement.lang = runtime.locale;
  const vertical = s.toolbar.orientation === 'vertical';
  bar.classList.toggle('vertical', vertical);
  setAttr(bar, 'aria-orientation', s.toolbar.orientation);
  label(bar, t('toolbar.label'));
  const compact = s.toolbar.style === 'compact';
  bar.classList.toggle('compact', compact);
  for (const el of [toolButtons.shape, customColor, sizeSeparator, size]) el.hidden = compact;
  setAttr(grip, 'title', t('toolbar.drag'));

  const drawing = runtime.drawMode;
  setAttr(cursor, 'aria-pressed', String(!drawing));
  label(cursor, t('tool.cursor'), 'Escape');
  const keys: Record<Tool, string> = { pen: 'P', highlighter: 'H', shape: 'S', eraser: 'E' };
  for (const tool of Object.keys(toolButtons) as Tool[]) {
    const el = toolButtons[tool];
    setAttr(el, 'aria-pressed', String(drawing && s.tool.tool === tool));
    label(el, t(`tool.${tool}`), keys[tool]);
  }
  const shapeName = s.tool.shape;
  replaceChildrenIfChanged(toolButtons.shape, shapeName, () => [icon(SHAPE_ICONS[shapeName])]);
  label(toolButtons.shape, `${t('tool.shape')}: ${t(`shape.${shapeName}`)}`, 'S');

  renderSwatches(current);
  customColor.style.setProperty('--current', s.tool.color);
  label(customColor, t('color.custom'));
  renderSize(current);
  label(size, t('size.button', { size: s.tool.sizes[s.tool.tool] }), '[ ]');

  undo.disabled = !runtime.canUndo;
  redo.disabled = !runtime.canRedo;
  clear.disabled = !runtime.hasInk;
  const mod = runtime.platform === 'darwin' ? 'Meta' : 'Control';
  label(undo, t('action.undo'), `${mod}+Z`);
  label(redo, t('action.redo'), `${mod}+Y`);
  label(clear, t('action.clear'), 'Delete');
  replaceChildrenIfChanged(ink, String(runtime.inkVisible), () => [
    icon(runtime.inkVisible ? 'eye' : 'eyeOff'),
  ]);
  label(ink, t(runtime.inkVisible ? 'action.hideInk' : 'action.showInk'));
  setAttr(ink, 'aria-pressed', String(!runtime.inkVisible));
  label(settings, t('action.settings'));

  for (const [el, panel] of [
    [customColor, 'color'],
    [size, 'size'],
    [toolButtons.shape, 'shape'],
    [settings, 'settings'],
  ] as const) {
    setAttr(el, 'aria-haspopup', 'dialog');
    setAttr(el, 'aria-expanded', String(runtime.panel === panel));
  }
  measure();
}

bindAppKeys(() => state);
api.onState((next) => {
  state = next;
  render(next);
});
