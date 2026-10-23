import { type HexColor, type Hsv, hexToHsv, hsvToHex, parseHex } from '../../shared/color';
import type { AppState } from '../../shared/ipc';
import { activePalette, MAX_PALETTE_COLORS } from '../../shared/settings';
import { api, translator } from '../ui/api';
import { h, replaceChildrenIfChanged, setAttr } from '../ui/dom';
import { card, iconButton, name, type View } from './controls';

interface EyeDropperResult {
  readonly sRGBHex: string;
}
declare const EyeDropper: { new (): { open: () => Promise<EyeDropperResult> } } | undefined;

/** Colour picker plus palette management: pick, save, sort, rename, delete. */
export function colorPanel(): View<AppState> {
  let state: AppState | null = null;
  let hsv: Hsv = { h: 0, s: 1, v: 1 };
  let lastSent: HexColor | null = null;
  let renaming = false;
  let pendingFrame = 0;

  const t = (...args: Parameters<ReturnType<typeof translator>>): string =>
    state === null ? '' : translator(state)(...args);

  // Sends at most one colour per frame while dragging.
  const pick = (next: Hsv): void => {
    hsv = next;
    paintPicker();
    if (pendingFrame !== 0) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      lastSent = hsvToHex(hsv);
      api.command({ type: 'setColor', color: lastSent });
    });
  };

  // Saturation/brightness square.
  const svHandle = h('span', { className: 'handle' });
  const sv = h(
    'div',
    {
      className: 'sv',
      attrs: { role: 'slider', tabindex: 0, 'aria-valuemin': 0, 'aria-valuemax': 100 },
    },
    [svHandle],
  );
  dragArea(sv, (x, y) => pick({ ...hsv, s: x, v: 1 - y }));
  sv.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: hsv.s - step },
      ArrowRight: { s: hsv.s + step },
      ArrowUp: { v: hsv.v + step },
      ArrowDown: { v: hsv.v - step },
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const next = { ...hsv, ...move };
    pick({ h: next.h, s: clamp01(next.s), v: clamp01(next.v) });
  });

  // Hue bar.
  const hueHandle = h('span', { className: 'handle' });
  const hue = h(
    'div',
    {
      className: 'hue',
      attrs: { role: 'slider', tabindex: 0, 'aria-valuemin': 0, 'aria-valuemax': 359 },
    },
    [hueHandle],
  );
  dragArea(hue, (x) => pick({ ...hsv, h: Math.min(359.9, x * 360) }));
  hue.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    pick({ ...hsv, h: (hsv.h + step * (event.shiftKey ? 15 : 3) + 360) % 360 });
  });

  const preview = h('span', { className: 'preview' });
  const hexInput = h('input', {
    attrs: { type: 'text', maxlength: 7, spellcheck: false, autocomplete: 'off' },
  });
  hexInput.addEventListener('change', () => {
    const parsed = parseHex(hexInput.value);
    if (parsed === null) {
      hexInput.value = state?.settings.tool.color ?? '';
      return;
    }
    hsv = hexToHsv(parsed);
    lastSent = parsed;
    api.command({ type: 'setColor', color: parsed });
  });
  hexInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') hexInput.dispatchEvent(new Event('change'));
  });
  const eyedropper = iconButton('eyedropper', () => {
    if (typeof EyeDropper === 'undefined') return;
    new EyeDropper()
      .open()
      .then((result) => {
        const parsed = parseHex(result.sRGBHex);
        if (parsed !== null) api.command({ type: 'setColor', color: parsed });
      })
      // Escape during the eyedropper rejects; that is a cancel, not an error.
      .catch(() => undefined);
  });
  eyedropper.hidden = typeof EyeDropper === 'undefined';
  const add = iconButton('plus', () => {
    if (state !== null) api.command({ type: 'addColor', color: state.settings.tool.color });
  });
  add.classList.add('add');

  // Palette selection and management.
  const select = h('select');
  select.addEventListener('change', () => api.command({ type: 'selectPalette', id: select.value }));
  const nameInput = h('input', { attrs: { type: 'text', maxlength: 32, spellcheck: false } });
  const renameButton = iconButton('edit', () => startRename(false));
  const newButton = iconButton('plus', () => startRename(true));
  const deleteButton = iconButton('trash', () => {
    if (state !== null) api.command({ type: 'deletePalette', id: state.settings.activePaletteId });
  });
  let creating = false;
  const startRename = (create: boolean): void => {
    if (state === null) return;
    renaming = true;
    creating = create;
    nameInput.value = create ? t('palette.defaultName') : activePalette(state.settings).name;
    render();
    nameInput.focus();
    nameInput.select();
  };
  const finishRename = (save: boolean): void => {
    if (!renaming || state === null) return;
    renaming = false;
    if (save) {
      api.command(
        creating
          ? { type: 'createPalette', name: nameInput.value }
          : { type: 'renamePalette', id: state.settings.activePaletteId, name: nameInput.value },
      );
    }
    render();
  };
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finishRename(true);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finishRename(false);
    }
  });
  nameInput.addEventListener('blur', () => finishRename(true));

  const paletteRow = h('div', { className: 'row palette-row' }, [
    select,
    renameButton,
    newButton,
    deleteButton,
  ]);
  const renameRow = h('div', { className: 'row palette-row' }, [nameInput]);
  const grid = h('div', { className: 'grid', attrs: { role: 'listbox' } });
  const message = h('p', { className: 'hint muted' });
  const title = h('h2');
  const close = iconButton('close', () => api.intent({ type: 'closePanel' }));

  const root = card(title, close, [
    paletteRow,
    renameRow,
    sv,
    hue,
    h('div', { className: 'row' }, [preview, hexInput, eyedropper, add]),
    grid,
    message,
  ]);
  root.classList.add('color-panel');

  function paintPicker(): void {
    const color = hsvToHex(hsv);
    sv.style.setProperty('--hue', `hsl(${hsv.h} 100% 50%)`);
    svHandle.style.left = `${hsv.s * 100}%`;
    svHandle.style.top = `${(1 - hsv.v) * 100}%`;
    svHandle.style.background = color;
    hueHandle.style.left = `${(hsv.h / 360) * 100}%`;
    hueHandle.style.background = `hsl(${hsv.h} 100% 50%)`;
    preview.style.background = color;
    setAttr(sv, 'aria-valuenow', Math.round(hsv.s * 100));
    setAttr(sv, 'aria-valuetext', `${Math.round(hsv.s * 100)} %, ${Math.round(hsv.v * 100)} %`);
    setAttr(hue, 'aria-valuenow', Math.round(hsv.h));
    if (document.activeElement !== hexInput) hexInput.value = color.toUpperCase();
  }

  function renderGrid(current: AppState): void {
    const palette = activePalette(current.settings);
    replaceChildrenIfChanged(grid, `${palette.id}:${palette.colors.join(',')}`, () =>
      palette.colors.map((color, index) => swatch(color, index, palette.colors.length)),
    );
    for (const el of grid.children) {
      const selected = (el as HTMLElement).dataset.color === current.settings.tool.color;
      setAttr(el, 'aria-selected', String(selected));
    }
  }

  function swatch(color: HexColor, index: number, count: number): HTMLElement {
    const el = h('button', {
      className: 'swatch',
      attrs: {
        type: 'button',
        role: 'option',
        draggable: true,
        'data-color': color,
        'data-index': index,
      },
      on: {
        click: () => api.command({ type: 'setColor', color }),
        contextmenu: (event) => {
          event.preventDefault();
          api.command({ type: 'removeColor', index });
        },
        keydown: (event) => {
          if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            api.command({ type: 'removeColor', index });
          } else if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            const to = Math.min(
              count - 1,
              Math.max(0, index + (event.key === 'ArrowLeft' ? -1 : 1)),
            );
            api.command({ type: 'moveColor', from: index, to });
          }
        },
        dragstart: (event) => event.dataTransfer?.setData('text/plain', String(index)),
        dragover: (event) => {
          event.preventDefault();
          el.classList.add('drop');
        },
        dragleave: () => el.classList.remove('drop'),
        drop: (event) => {
          event.preventDefault();
          el.classList.remove('drop');
          const from = Number(event.dataTransfer?.getData('text/plain'));
          if (Number.isInteger(from)) api.command({ type: 'moveColor', from, to: index });
        },
      },
    });
    el.style.setProperty('--swatch', color);
    name(el, t('color.swatch', { hex: color.toUpperCase() }));
    return el;
  }

  function render(): void {
    if (state === null) return;
    const current = state;
    const { settings } = current;
    const palette = activePalette(settings);
    title.textContent = t('colorPanel.title');
    name(close, t('action.close'));
    setAttr(root, 'aria-label', t('colorPanel.title'));

    replaceChildrenIfChanged(
      select,
      settings.palettes.map((p) => `${p.id}=${p.name}`).join('|'),
      () => settings.palettes.map((p) => h('option', { text: p.name, attrs: { value: p.id } })),
    );
    select.value = settings.activePaletteId;
    setAttr(select, 'aria-label', t('palette.label'));
    paletteRow.hidden = renaming;
    renameRow.hidden = !renaming;
    setAttr(nameInput, 'aria-label', t('palette.nameLabel'));
    name(renameButton, t('palette.rename'));
    name(newButton, t('palette.new'));
    name(deleteButton, t('palette.delete'));
    deleteButton.disabled = settings.palettes.length <= 1;

    if (settings.tool.color !== lastSent) {
      const next = hexToHsv(settings.tool.color);
      // Grey has no hue; keep the one the user had so the hue bar does not jump.
      hsv = next.s === 0 || next.v === 0 ? { ...next, h: hsv.h } : next;
      lastSent = settings.tool.color;
    }
    paintPicker();
    setAttr(sv, 'aria-label', t('picker.area'));
    setAttr(hue, 'aria-label', t('picker.hue'));
    setAttr(hexInput, 'aria-label', t('picker.hex'));
    name(eyedropper, t('picker.eyedropper'));

    const full = palette.colors.length >= MAX_PALETTE_COLORS;
    add.disabled = full || palette.colors.includes(settings.tool.color);
    name(add, t('palette.add'));
    setAttr(grid, 'aria-label', palette.name);
    renderGrid(current);
    message.textContent =
      palette.colors.length === 0
        ? t('palette.empty')
        : full
          ? t('palette.full')
          : t('palette.hint');
  }

  return {
    root,
    update: (next) => {
      state = next;
      render();
    },
  };
}

/** Calls `onMove` with the pointer position as fractions of the element while dragging. */
function dragArea(el: HTMLElement, onMove: (x: number, y: number) => void): void {
  const move = (event: PointerEvent): void => {
    const r = el.getBoundingClientRect();
    onMove(
      clamp01((event.clientX - r.left) / r.width),
      clamp01((event.clientY - r.top) / r.height),
    );
  };
  el.addEventListener('pointerdown', (event) => {
    el.setPointerCapture(event.pointerId);
    el.focus();
    move(event);
  });
  el.addEventListener('pointermove', (event) => {
    if (el.hasPointerCapture(event.pointerId)) move(event);
  });
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
