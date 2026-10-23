import type { CommandInput } from './commands';
import type { Intent, Platform } from './ipc';

/** The parts of a keyboard event the key map looks at. */
export interface KeyInput {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** What a key press inside one of the app's windows asks for. */
export type KeyAction =
  | { readonly kind: 'command'; readonly command: CommandInput }
  | { readonly kind: 'intent'; readonly intent: Intent };

const TOOL_KEYS: Readonly<Record<string, CommandInput>> = {
  KeyP: { type: 'setTool', tool: 'pen' },
  KeyH: { type: 'setTool', tool: 'highlighter' },
  KeyS: { type: 'setTool', tool: 'shape' },
  KeyE: { type: 'setTool', tool: 'eraser' },
  KeyL: { type: 'setShape', shape: 'line' },
  KeyA: { type: 'setShape', shape: 'arrow' },
  KeyR: { type: 'setShape', shape: 'rect' },
  KeyO: { type: 'setShape', shape: 'ellipse' },
};

const SMALLER = new Set(['[', '-', '_']);
const BIGGER = new Set([']', '+', '=']);

/**
 * Maps a key press to an action, using physical key codes for letters and
 * digits so the map works on any keyboard layout. Returns `null` when the
 * key means nothing here, so the event is left alone.
 */
export function keyAction(input: KeyInput, platform: Platform): KeyAction | null {
  const mod = platform === 'darwin' ? input.metaKey : input.ctrlKey;
  if (mod) return modifiedAction(input);
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  return plainAction(input);
}

function modifiedAction(input: KeyInput): KeyAction | null {
  if (input.code === 'KeyZ') {
    return { kind: 'intent', intent: { type: input.shiftKey ? 'redo' : 'undo' } };
  }
  if (input.code === 'KeyY') return { kind: 'intent', intent: { type: 'redo' } };
  return null;
}

function plainAction(input: KeyInput): KeyAction | null {
  if (input.key === 'Escape')
    return { kind: 'intent', intent: { type: 'setDrawMode', enabled: false } };
  if (input.key === 'Delete' || input.key === 'Backspace') {
    return { kind: 'intent', intent: { type: 'clear' } };
  }
  const tool = TOOL_KEYS[input.code];
  if (tool !== undefined) return { kind: 'command', command: tool };
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(input.code)?.[1];
  if (digit !== undefined) {
    return { kind: 'command', command: { type: 'selectPaletteColor', index: Number(digit) - 1 } };
  }
  if (SMALLER.has(input.key) || input.code === 'NumpadSubtract') {
    return { kind: 'command', command: { type: 'nudgeSize', direction: -1 } };
  }
  if (BIGGER.has(input.key) || input.code === 'NumpadAdd') {
    return { kind: 'command', command: { type: 'nudgeSize', direction: 1 } };
  }
  return null;
}

const NAMED_CODES: Readonly<Record<string, string>> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
};

/** The accelerator key for a physical key code, or `null` for modifiers and unknown keys. */
function acceleratorKey(code: string): string | null {
  const letterOrDigit = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code);
  if (letterOrDigit !== null) return letterOrDigit[1] ?? letterOrDigit[2] ?? null;
  const numpad = /^Numpad([0-9])$/.exec(code)?.[1];
  if (numpad !== undefined) return `num${numpad}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED_CODES[code] ?? null;
}

/** Outcome of turning a key press into a global shortcut. */
export type RecordedShortcut =
  | { readonly kind: 'incomplete' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'clear' }
  | { readonly kind: 'accelerator'; readonly accelerator: string };

/**
 * Builds an Electron accelerator from a key press while recording a
 * shortcut. Escape cancels, Backspace or Delete alone clears, a modifier
 * on its own is incomplete. Anything but F-keys needs Ctrl/Cmd or Alt, so
 * a global shortcut never swallows plain typing.
 */
export function recordShortcut(input: KeyInput, platform: Platform): RecordedShortcut {
  const mod = platform === 'darwin' ? input.metaKey : input.ctrlKey;
  const plain = !mod && !input.altKey && !input.shiftKey;
  if (plain && input.key === 'Escape') return { kind: 'cancel' };
  if (plain && (input.key === 'Backspace' || input.key === 'Delete')) return { kind: 'clear' };
  const key = acceleratorKey(input.code);
  if (key === null) return { kind: 'incomplete' };
  const isFunctionKey = /^F\d+$/.test(key);
  if (!mod && !input.altKey && !isFunctionKey) return { kind: 'incomplete' };
  const parts = [
    mod ? 'CommandOrControl' : null,
    platform === 'darwin' && input.ctrlKey ? 'Control' : null,
    input.altKey ? 'Alt' : null,
    input.shiftKey ? 'Shift' : null,
    key,
  ].filter((part): part is string => part !== null);
  return { kind: 'accelerator', accelerator: parts.join('+') };
}

/** Human-readable form of an accelerator for the given platform. */
export function formatAccelerator(accelerator: string, platform: Platform): string {
  if (accelerator === '') return '';
  const names: Readonly<Record<string, string>> =
    platform === 'darwin'
      ? { CommandOrControl: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧' }
      : { CommandOrControl: 'Ctrl', Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
  const separator = platform === 'darwin' ? '' : ' + ';
  return accelerator
    .split('+')
    .map((part) => names[part] ?? part)
    .join(separator);
}
