import { describe, expect, it } from 'vitest';
import { formatAccelerator, type KeyInput, keyAction, recordShortcut } from './keymap';

const key = (code: string, k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  code,
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('keyAction', () => {
  it('maps letters by physical position, whatever the layout prints', () => {
    // On a QWERTZ keyboard the key in the Y position prints "z".
    expect(keyAction(key('KeyZ', 'y', { ctrlKey: true }), 'win32')).toEqual({
      kind: 'intent',
      intent: { type: 'undo' },
    });
    expect(keyAction(key('KeyP', 'p'), 'linux')).toEqual({
      kind: 'command',
      command: { type: 'setTool', tool: 'pen' },
    });
  });

  it('uses Cmd on macOS and Ctrl elsewhere for undo and redo', () => {
    expect(keyAction(key('KeyZ', 'z', { metaKey: true, shiftKey: true }), 'darwin')).toEqual({
      kind: 'intent',
      intent: { type: 'redo' },
    });
    expect(keyAction(key('KeyZ', 'z', { metaKey: true }), 'win32')).toBeNull();
  });

  it('selects palette colours with 1–9 on the main row and the numpad', () => {
    expect(keyAction(key('Digit3', '3'), 'win32')).toEqual({
      kind: 'command',
      command: { type: 'selectPaletteColor', index: 2 },
    });
    expect(keyAction(key('Numpad9', '9'), 'win32')).toMatchObject({ command: { index: 8 } });
  });

  it('changes the size with brackets and plus or minus', () => {
    expect(keyAction(key('BracketRight', ']'), 'win32')).toMatchObject({
      command: { direction: 1 },
    });
    expect(keyAction(key('Slash', '-'), 'win32')).toMatchObject({ command: { direction: -1 } });
  });

  it('ignores keys combined with Alt so the system keeps them', () => {
    expect(keyAction(key('KeyP', 'p', { altKey: true }), 'win32')).toBeNull();
  });

  it('stops drawing on Escape and clears on Delete', () => {
    expect(keyAction(key('Escape', 'Escape'), 'win32')).toEqual({
      kind: 'intent',
      intent: { type: 'setDrawMode', enabled: false },
    });
    expect(keyAction(key('Delete', 'Delete'), 'win32')).toEqual({
      kind: 'intent',
      intent: { type: 'clear' },
    });
  });
});

describe('recordShortcut', () => {
  it('builds an accelerator with the modifiers in a fixed order', () => {
    expect(
      recordShortcut(key('KeyD', 'D', { ctrlKey: true, shiftKey: true, altKey: true }), 'win32'),
    ).toEqual({
      kind: 'accelerator',
      accelerator: 'CommandOrControl+Alt+Shift+D',
    });
  });

  it('allows function keys alone but not plain letters', () => {
    expect(recordShortcut(key('F8', 'F8'), 'win32')).toEqual({
      kind: 'accelerator',
      accelerator: 'F8',
    });
    expect(recordShortcut(key('KeyD', 'd'), 'win32')).toEqual({ kind: 'incomplete' });
    expect(recordShortcut(key('KeyD', 'd', { shiftKey: true }), 'win32')).toEqual({
      kind: 'incomplete',
    });
  });

  it('waits while only modifiers are held', () => {
    expect(recordShortcut(key('ControlLeft', 'Control', { ctrlKey: true }), 'win32')).toEqual({
      kind: 'incomplete',
    });
  });

  it('cancels on Escape and clears on Backspace', () => {
    expect(recordShortcut(key('Escape', 'Escape'), 'win32')).toEqual({ kind: 'cancel' });
    expect(recordShortcut(key('Backspace', 'Backspace'), 'darwin')).toEqual({ kind: 'clear' });
  });

  it('keeps Control separate from Command on macOS', () => {
    expect(recordShortcut(key('KeyK', 'k', { metaKey: true, ctrlKey: true }), 'darwin')).toEqual({
      kind: 'accelerator',
      accelerator: 'CommandOrControl+Control+K',
    });
  });
});

describe('formatAccelerator', () => {
  it('uses words on Windows and symbols on macOS', () => {
    expect(formatAccelerator('CommandOrControl+Alt+D', 'win32')).toBe('Ctrl + Alt + D');
    expect(formatAccelerator('CommandOrControl+Shift+D', 'darwin')).toBe('⌘⇧D');
    expect(formatAccelerator('', 'linux')).toBe('');
  });
});
