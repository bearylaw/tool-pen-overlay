/** Options for {@link h}. Attributes are set with `setAttribute`, never as HTML. */
export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string | number | boolean>>;
  readonly on?: {
    readonly [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void;
  };
}

/** Creates an element. The only way UI is built: no `innerHTML` anywhere. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options.className !== undefined) el.className = options.className;
  if (options.text !== undefined) el.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) setAttr(el, name, value);
  for (const [type, listener] of Object.entries(options.on ?? {})) {
    el.addEventListener(type, listener as EventListener);
  }
  el.append(...children);
  return el;
}

/** Sets an attribute; `false` removes it, `true` sets it empty. */
export function setAttr(el: Element, name: string, value: string | number | boolean): void {
  if (value === false) el.removeAttribute(name);
  else el.setAttribute(name, value === true ? '' : String(value));
}

/** Replaces an element's children only when the key changed, to keep focus and avoid churn. */
export function replaceChildrenIfChanged(
  el: HTMLElement,
  key: string,
  build: () => readonly Node[],
): void {
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.replaceChildren(...build());
}

/** Rect of an element relative to the window's viewport, in CSS pixels. */
export function viewportRect(el: Element): { x: number; y: number; width: number; height: number } {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** True when keyboard input is meant for a text field, not for shortcuts. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    (target instanceof HTMLInputElement &&
      !['range', 'checkbox', 'radio', 'button'].includes(target.type)) ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
