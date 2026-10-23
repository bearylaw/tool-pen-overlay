import { join } from 'node:path';
import { app, type IpcMainEvent, ipcMain, Menu, screen } from 'electron';
import { CHANNELS } from '../shared/channels';
import { commandSchema } from '../shared/commands';
import { inkReportSchema, intentSchema, type Platform, sizeSchema } from '../shared/ipc';
import { type Controller, createController } from './controller';
import { createLogger, type Logger } from './logger';
import { createSettingsStore } from './store';
import { isAppUrl, lockDownWebContents, registerScheme, serveRenderer } from './web';

// Composition root: process-level setup, IPC wiring and app lifecycle.

if (process.argv.includes('--version')) {
  process.stdout.write(`${app.getVersion()}\n`);
  app.exit(0);
}

if (!app.requestSingleInstanceLock()) app.exit(0);

if (process.platform === 'linux') {
  // Transparent windows on X11 need an ARGB visual.
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

// Development and the smoke test can point settings at a throwaway folder.
const userDataOverride = app.isPackaged ? undefined : process.env.PEN_OVERLAY_USER_DATA;
if (userDataOverride !== undefined && userDataOverride !== '')
  app.setPath('userData', userDataOverride);

registerScheme();

const distRoot = join(__dirname, '..');
const log = createLogger(join(app.getPath('userData'), 'logs'), !app.isPackaged);

process.on('uncaughtException', (error) => log.error('process.uncaught', error));
process.on('unhandledRejection', (reason) => log.error('process.unhandled-rejection', reason));

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  if (process.platform === 'darwin') app.dock?.hide();
  lockDownWebContents(log);
  serveRenderer(join(distRoot, 'renderer'), log);

  const controller = createController({
    store: createSettingsStore(app.getPath('userData'), log),
    log,
    preload: join(distRoot, 'preload', 'preload.cjs'),
    trayIcon: join(
      distRoot,
      'assets',
      process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png',
    ),
    version: app.getVersion(),
    platform: process.platform as Platform,
    systemLocale: app.getLocale(),
  });

  wireIpc(controller, log);
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed'] as const) {
    screen.on(event as 'display-added', () => controller.onDisplaysChanged());
  }
  app.on('second-instance', () => controller.showToolbar());
  app.on('will-quit', () => controller.shutdown());
});

// The app lives in the tray; closing windows never quits it.
app.on('window-all-closed', () => undefined);

function wireIpc(controller: Controller, logger: Logger): void {
  const from = (event: IpcMainEvent): ReturnType<Controller['pageOf']> => {
    if (!isAppUrl(event.senderFrame?.url ?? '')) return null;
    return controller.pageOf(event.sender.id);
  };
  const rejected = (channel: string, issues: number): void =>
    logger.warn('ipc.rejected', { channel, issues });

  ipcMain.on(CHANNELS.command, (event, payload: unknown) => {
    if (from(event) === null) return;
    const parsed = commandSchema.safeParse(payload);
    if (parsed.success) controller.command(parsed.data);
    else rejected(CHANNELS.command, parsed.error.issues.length);
  });
  ipcMain.on(CHANNELS.intent, (event, payload: unknown) => {
    if (from(event) === null) return;
    const parsed = intentSchema.safeParse(payload);
    if (parsed.success) controller.intent(parsed.data);
    else rejected(CHANNELS.intent, parsed.error.issues.length);
  });
  ipcMain.on(CHANNELS.size, (event, payload: unknown) => {
    const page = from(event);
    if (page !== 'toolbar' && page !== 'panel') return;
    const parsed = sizeSchema.safeParse(payload);
    if (parsed.success) controller.reportSize(event.sender.id, parsed.data);
    else rejected(CHANNELS.size, parsed.error.issues.length);
  });
  ipcMain.on(CHANNELS.inkReport, (event, payload: unknown) => {
    if (from(event) !== 'overlay') return;
    const parsed = inkReportSchema.safeParse(payload);
    if (parsed.success) controller.reportInk(event.sender.id, parsed.data);
    else rejected(CHANNELS.inkReport, parsed.error.issues.length);
  });
}
