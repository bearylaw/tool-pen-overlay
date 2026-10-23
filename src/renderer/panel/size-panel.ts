import type { AppState } from '../../shared/ipc';
import { SHAPES, type Shape, SIZE_MAX, SIZE_MIN } from '../../shared/settings';
import { api, translator } from '../ui/api';
import { h, setAttr } from '../ui/dom';
import { icon } from '../ui/icons';
import { card, iconButton, name, type View } from './controls';

const PRESETS = [2, 4, 8, 16, 32, 64] as const;

// The slider is quadratic so small sizes, where one pixel matters, get most of its travel.
const toSlider = (size: number): number =>
  Math.round(Math.sqrt((size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * 1000);
const fromSlider = (value: number): number =>
  Math.round(SIZE_MIN + (SIZE_MAX - SIZE_MIN) * (value / 1000) ** 2);

/** Brush size for the current tool, plus highlighter opacity. */
export function sizePanel(): View<AppState> {
  const title = h('h2');
  const close = iconButton('close', () => api.intent({ type: 'closePanel' }));
  const value = h('output', { className: 'size-value' });
  const dot = h('span', { className: 'size-dot' });
  const slider = h('input', { attrs: { type: 'range', min: 0, max: 1000, step: 1 } });
  slider.addEventListener('input', () =>
    api.command({ type: 'setSize', size: fromSlider(Number(slider.value)) }),
  );
  const presets = PRESETS.map((size) =>
    h('button', {
      className: 'chip',
      text: String(size),
      attrs: { type: 'button' },
      on: { click: () => api.command({ type: 'setSize', size }) },
    }),
  );
  const opacityLabel = h('label', { className: 'field-label' });
  const opacityValue = h('output', { className: 'muted' });
  const opacity = h('input', { attrs: { type: 'range', min: 10, max: 90, step: 5 } });
  opacity.addEventListener('input', () =>
    api.command({ type: 'setHighlighterOpacity', opacity: Number(opacity.value) / 100 }),
  );
  const opacityRow = h('div', { className: 'stack' }, [
    h('div', { className: 'row between' }, [opacityLabel, opacityValue]),
    opacity,
  ]);

  const root = card(title, close, [
    h('div', { className: 'size-preview' }, [dot]),
    h('div', { className: 'row between' }, [
      h('span', { className: 'muted', attrs: { id: 'size-label' } }),
      value,
    ]),
    slider,
    h('div', { className: 'chips' }, presets),
    opacityRow,
  ]);
  root.classList.add('size-panel');

  return {
    root,
    update: (state) => {
      const t = translator(state);
      const { tool, sizes, color } = state.settings.tool;
      const size = sizes[tool];
      title.textContent = t('sizePanel.title');
      setAttr(root, 'aria-label', t('sizePanel.title'));
      name(close, t('action.close'));
      const toolName = t(`tool.${tool}`);
      const label = root.querySelector('#size-label');
      if (label !== null) label.textContent = toolName;
      value.textContent = t('size.value', { size });
      if (document.activeElement !== slider) slider.value = String(toSlider(size));
      setAttr(slider, 'aria-label', `${t('sizePanel.title')}: ${toolName}`);
      setAttr(slider, 'aria-valuetext', t('size.value', { size }));
      for (const [i, chip] of presets.entries())
        setAttr(chip, 'aria-pressed', String(PRESETS[i] === size));
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.background = tool === 'eraser' ? 'transparent' : color;
      dot.classList.toggle('outline', tool === 'eraser');
      dot.style.opacity =
        tool === 'highlighter' ? String(state.settings.drawing.highlighterOpacity) : '1';

      const pct = Math.round(state.settings.drawing.highlighterOpacity * 100);
      opacityRow.hidden = tool !== 'highlighter';
      opacityLabel.textContent = t('size.opacity');
      opacityValue.textContent = `${pct} %`;
      if (document.activeElement !== opacity) opacity.value = String(pct);
      setAttr(opacity, 'aria-label', t('size.opacity'));
    },
  };
}

/** The four shapes, as a radio group. */
export function shapePanel(): View<AppState> {
  const title = h('h2');
  const close = iconButton('close', () => api.intent({ type: 'closePanel' }));
  const hint = h('p', { className: 'hint muted' });
  const buttons = SHAPES.map((shape: Shape) => {
    const label = h('span');
    const el = h(
      'button',
      { className: 'shape-option', attrs: { type: 'button', role: 'radio' } },
      [icon(shape), label],
    );
    el.addEventListener('click', () => {
      api.command({ type: 'setShape', shape });
      api.intent({ type: 'closePanel' });
    });
    return { shape, el, label };
  });
  const group = h(
    'div',
    { className: 'shape-grid', attrs: { role: 'radiogroup' } },
    buttons.map((b) => b.el),
  );
  const root = card(title, close, [group, hint]);
  root.classList.add('shape-panel');

  return {
    root,
    update: (state) => {
      const t = translator(state);
      title.textContent = t('shapePanel.title');
      setAttr(root, 'aria-label', t('shapePanel.title'));
      setAttr(group, 'aria-label', t('shapePanel.title'));
      name(close, t('action.close'));
      hint.textContent = t('shapePanel.hint');
      for (const { shape, el, label } of buttons) {
        label.textContent = t(`shape.${shape}`);
        setAttr(el, 'aria-checked', String(state.settings.tool.shape === shape));
      }
    },
  };
}
