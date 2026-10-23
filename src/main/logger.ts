import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Structured log written as JSON lines; also mirrored to the console in development. */
export interface Logger {
  readonly info: (event: string, data?: Record<string, unknown>) => void;
  readonly warn: (event: string, data?: Record<string, unknown>) => void;
  readonly error: (event: string, error: unknown, data?: Record<string, unknown>) => void;
  readonly file: string;
}

const MAX_BYTES = 1_000_000;

/**
 * Creates a logger writing to `<dir>/main.log`, rotating once to
 * `main.old.log` past one megabyte. Never logs settings contents.
 */
export function createLogger(dir: string, mirrorToConsole: boolean): Logger {
  const file = join(dir, 'main.log');
  mkdirSync(dir, { recursive: true });

  const write = (level: string, event: string, data: Record<string, unknown>): void => {
    const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...data });
    if (mirrorToConsole) console.info(line);
    try {
      rotateIfLarge(file);
      appendFileSync(file, `${line}\n`);
    } catch (error) {
      // The log is the place errors go; if it cannot be written, stderr is all that is left.
      console.error('log write failed', error);
    }
  };

  return {
    file,
    info: (event, data = {}) => write('info', event, data),
    warn: (event, data = {}) => write('warn', event, data),
    error: (event, error, data = {}) =>
      write('error', event, { ...data, error: describeError(error) }),
  };
}

function rotateIfLarge(file: string): void {
  try {
    if (statSync(file).size > MAX_BYTES) renameSync(file, file.replace(/\.log$/, '.old.log'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error)
    return { name: error.name, message: error.message, stack: error.stack };
  return { value: String(error) };
}
