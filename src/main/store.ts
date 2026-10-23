import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_SETTINGS, migrateSettings, type Settings } from '../shared/settings';
import type { Logger } from './logger';

/** Reads and writes the settings file in the user's config directory. */
export interface SettingsStore {
  readonly load: () => Settings;
  /** Schedules a write; rapid changes (dragging a slider) are coalesced. */
  readonly save: (settings: Settings) => void;
  /** Writes a pending change now; called on quit. */
  readonly flush: () => void;
  readonly exportTo: (file: string, settings: Settings) => void;
  /** Reads a settings file from anywhere; `null` when it is not valid settings. */
  readonly importFrom: (file: string) => Settings | null;
}

const SAVE_DELAY_MS = 300;

/** Creates the store for `<dir>/settings.json`. */
export function createSettingsStore(dir: string, log: Logger): SettingsStore {
  const file = join(dir, 'settings.json');
  let pending: Settings | null = null;
  let timer: NodeJS.Timeout | null = null;

  const flush = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (pending === null) return;
    const settings = pending;
    pending = null;
    try {
      writeAtomically(file, settings);
    } catch (error) {
      log.error('settings.write-failed', error, { file });
    }
  };

  return {
    load: () => loadFrom(file, log),
    save: (settings) => {
      pending = settings;
      if (timer === null) timer = setTimeout(flush, SAVE_DELAY_MS);
    },
    flush,
    exportTo: (target, settings) => writeAtomically(target, settings),
    importFrom: (source) => {
      try {
        const result = migrateSettings(JSON.parse(readFileSync(source, 'utf8')));
        if (result.ok) return result.settings;
        log.warn('settings.import-rejected', { reason: result.reason });
      } catch (error) {
        log.warn('settings.import-unreadable', { message: (error as Error).message });
      }
      return null;
    },
  };
}

function loadFrom(file: string, log: Logger): Settings {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_SETTINGS;
    log.error('settings.read-failed', error, { file });
    return DEFAULT_SETTINGS;
  }
  try {
    const result = migrateSettings(JSON.parse(text));
    if (result.ok) return result.settings;
    log.warn('settings.rejected', { reason: result.reason });
  } catch (error) {
    log.warn('settings.unparsable', { message: (error as Error).message });
  }
  // Keep the broken file so nothing the user made is silently lost.
  const backup = file.replace(/\.json$/, `.broken-${Date.now()}.json`);
  copyFileSync(file, backup);
  log.warn('settings.backed-up', { backup });
  return DEFAULT_SETTINGS;
}

function writeAtomically(file: string, settings: Settings): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
}
