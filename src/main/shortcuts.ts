import { globalShortcut } from 'electron';
import { SHORTCUT_ACTIONS, type ShortcutAction } from '../shared/settings';
import type { Logger } from './logger';

/**
 * Registers the global shortcuts, replacing any registered before. Returns
 * the actions whose accelerator another app already holds (or that Electron
 * rejects), so the settings panel can say so.
 */
export function registerShortcuts(
  shortcuts: Readonly<Record<ShortcutAction, string>>,
  run: (action: ShortcutAction) => void,
  log: Logger,
): ShortcutAction[] {
  globalShortcut.unregisterAll();
  const conflicts: ShortcutAction[] = [];
  const taken = new Set<string>();
  for (const action of SHORTCUT_ACTIONS) {
    const accelerator = shortcuts[action];
    if (accelerator === '') continue;
    if (taken.has(accelerator)) {
      conflicts.push(action);
      continue;
    }
    try {
      if (globalShortcut.register(accelerator, () => run(action))) taken.add(accelerator);
      else conflicts.push(action);
    } catch (error) {
      // Electron throws on an accelerator it cannot parse (a hand-edited file).
      log.warn('shortcut.invalid', { action, accelerator, message: (error as Error).message });
      conflicts.push(action);
    }
  }
  if (conflicts.length > 0) log.warn('shortcut.conflicts', { conflicts });
  return conflicts;
}

/** Releases every global shortcut, e.g. while the user records a new one. */
export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll();
}
