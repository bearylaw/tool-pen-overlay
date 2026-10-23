import { join, normalize, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, net, protocol, session } from 'electron';
import type { Logger } from './logger';

/** The windows the app serves, one host each under `app://`. */
export const PAGES = ['overlay', 'toolbar', 'panel'] as const;
export type Page = (typeof PAGES)[number];

const SCHEME = 'app';

/** Must run before `app.whenReady`. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false } },
  ]);
}

/** URL of a page's entry document. */
export function pageUrl(page: Page): string {
  return `${SCHEME}://${page}/index.html`;
}

/** True for URLs the app itself serves. */
export function isAppUrl(url: string): boolean {
  return url.startsWith(`${SCHEME}://`);
}

/**
 * Serves `app://<page>/<file>` from `<rendererRoot>/<page>/<file>`. A custom
 * scheme instead of `file://` gives each window its own origin (so zoom
 * does not leak between them) and confines what a page can load.
 */
export function serveRenderer(rendererRoot: string, log: Logger): void {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    const page = PAGES.find((p) => p === url.hostname);
    const relativePath = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
    if (page === undefined) return notFound(log, request.url);
    const root = join(rendererRoot, page);
    const file = join(root, relativePath);
    const fromRoot = relative(root, file);
    if (fromRoot.startsWith('..') || fromRoot.includes(`..${sep}`))
      return notFound(log, request.url);
    return net.fetch(pathToFileURL(file).toString());
  });
}

function notFound(log: Logger, url: string): Response {
  log.warn('protocol.not-found', { url });
  return new Response('Not found', { status: 404 });
}

/** Hardened web preferences shared by every window (Electron security checklist). */
export function securePreferences(preload: string): Electron.WebPreferences {
  return {
    preload,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
    backgroundThrottling: false,
    devTools: !app.isPackaged,
  };
}

/** Denies permissions, navigation and new windows everywhere. */
export function lockDownWebContents(log: Logger): void {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    log.warn('permission.denied', { permission });
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (url !== contents.getURL()) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}
