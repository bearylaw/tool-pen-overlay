import { h, setAttr } from '../ui/dom';
import { type IconName, icon } from '../ui/icons';

/** A panel's DOM plus how to refresh it from new state. */
export interface View<S> {
  readonly root: HTMLElement;
  readonly update: (state: S) => void;
}

/** A labelled group of mutually exclusive buttons. */
export interface Segmented<T extends string> {
  readonly el: HTMLElement;
  readonly update: (value: T, labels: Readonly<Record<T, string>>, groupLabel: string) => void;
}

/** Creates a segmented control; arrow keys move between options like radio buttons. */
export function segmented<T extends string>(
  options: readonly T[],
  onPick: (value: T) => void,
): Segmented<T> {
  const buttons = options.map((value) =>
    h('button', {
      className: 'segment',
      attrs: { type: 'button', role: 'radio', 'data-value': value },
      on: { click: () => onPick(value) },
    }),
  );
  const el = h('div', { className: 'segmented', attrs: { role: 'radiogroup' } }, buttons);
  el.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = options[(index + step + options.length) % options.length];
    if (next !== undefined) {
      onPick(next);
      buttons[options.indexOf(next)]?.focus();
    }
  });
  return {
    el,
    update: (value, labels, groupLabel) => {
      setAttr(el, 'aria-label', groupLabel);
      for (const [i, button] of buttons.entries()) {
        const option = options[i] as T;
        const checked = option === value;
        button.textContent = labels[option];
        setAttr(button, 'aria-checked', String(checked));
        button.tabIndex = checked ? 0 : -1;
      }
    },
  };
}

/** An on/off switch with its label. */
export interface Toggle {
  readonly el: HTMLElement;
  readonly update: (checked: boolean, label: string) => void;
}

export function toggle(onChange: (checked: boolean) => void): Toggle {
  const text = h('span', { className: 'toggle-label' });
  const track = h('span', { className: 'switch', attrs: { 'aria-hidden': 'true' } }, [
    h('span', { className: 'knob' }),
  ]);
  const button = h('button', { className: 'toggle', attrs: { type: 'button', role: 'switch' } }, [
    text,
    track,
  ]);
  button.addEventListener('click', () => onChange(button.getAttribute('aria-checked') !== 'true'));
  return {
    el: button,
    update: (checked, label) => {
      text.textContent = label;
      setAttr(button, 'aria-checked', String(checked));
    },
  };
}

/** A small button with an icon and visible text. */
export function textButton(
  iconName: IconName | null,
  onClick: () => void,
  className = '',
): HTMLButtonElement {
  const label = h('span');
  const el = h('button', { className: `text-btn ${className}`.trim(), attrs: { type: 'button' } }, [
    ...(iconName === null ? [] : [icon(iconName)]),
    label,
  ]);
  el.addEventListener('click', onClick);
  return el;
}

/** Sets the visible text of a {@link textButton}. */
export function setText(button: HTMLButtonElement, text: string): void {
  const span = button.querySelector('span');
  if (span !== null) span.textContent = text;
}

/** An icon-only button with an accessible name. */
export function iconButton(iconName: IconName, onClick: () => void): HTMLButtonElement {
  const el = h('button', { className: 'btn small', attrs: { type: 'button' } }, [icon(iconName)]);
  el.addEventListener('click', onClick);
  return el;
}

/** Names an icon-only button for screen readers and as a tooltip. */
export function name(el: HTMLElement, text: string): void {
  setAttr(el, 'aria-label', text);
  setAttr(el, 'title', text);
}

/** The card every panel lives in: title bar with close button, then content. */
export function card(
  title: HTMLElement,
  close: HTMLButtonElement,
  body: readonly HTMLElement[],
): HTMLElement {
  return h('section', { className: 'panel card', attrs: { role: 'dialog', tabindex: -1 } }, [
    h('header', { className: 'panel-head' }, [title, close]),
    ...body,
  ]);
}
