import { Menu, nativeImage, Tray } from 'electron';
import { type Locale, translate } from '../shared/i18n';

/** What the tray menu needs to show and do. */
export interface TrayModel {
  readonly locale: Locale;
  readonly drawMode: boolean;
  readonly toolbarVisible: boolean;
}

export interface TrayActions {
  readonly toggleDraw: () => void;
  readonly toggleToolbar: () => void;
  readonly showToolbar: () => void;
  readonly resetPosition: () => void;
  readonly clear: () => void;
  readonly openSettings: () => void;
  readonly quit: () => void;
}

/** The notification-area icon; the way back when the toolbar is hidden. */
export interface AppTray {
  readonly update: (model: TrayModel) => void;
}

/** Creates the tray icon. `iconPath` is a PNG; on macOS a template image. */
export function createTray(iconPath: string, actions: TrayActions): AppTray {
  const image = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') image.setTemplateImage(true);
  const tray = new Tray(image);
  tray.on('click', actions.showToolbar);

  return {
    update: (model) => {
      const t = (key: Parameters<typeof translate>[1]): string => translate(model.locale, key);
      tray.setToolTip(t('tray.tooltip'));
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: t('tray.draw'),
            type: 'checkbox',
            checked: model.drawMode,
            click: actions.toggleDraw,
          },
          {
            label: t('tray.showToolbar'),
            type: 'checkbox',
            checked: model.toolbarVisible,
            click: actions.toggleToolbar,
          },
          { label: t('tray.resetPosition'), click: actions.resetPosition },
          { label: t('tray.clear'), click: actions.clear },
          { label: t('tray.settings'), click: actions.openSettings },
          { type: 'separator' },
          { label: t('tray.quit'), click: actions.quit },
        ]),
      );
    },
  };
}
