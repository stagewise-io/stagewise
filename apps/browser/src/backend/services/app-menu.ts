import { app, Menu } from 'electron';
import path from 'node:path';
import type { Logger } from './logger';
import type { WindowLayoutService } from './window-layout';
import { fileURLToPath } from 'node:url';
import { DisposableService } from './disposable';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class AppMenuService extends DisposableService {
  private readonly logger: Logger;
  private readonly windowLayoutService: WindowLayoutService;

  constructor(logger: Logger, windowLayoutService: WindowLayoutService) {
    super();
    this.logger = logger;
    this.windowLayoutService = windowLayoutService;

    this.logger.debug('[AppMenuService] Initializing service');

    this.updateApplicationMenu();

    this.logger.debug('[AppMenuService] Service initialized');
  }

  protected onTeardown(): void {
    this.logger.debug('[AppMenuService] Teardown called');

    app.applicationMenu = null;

    this.logger.debug('[AppMenuService] Teardown complete');
  }
  private updateApplicationMenu() {
    app.applicationMenu = Menu.buildFromTemplate([
      {
        label: app.name,
        id: 'about_menu',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.windowLayoutService.openSettings();
            },
          },
          { type: 'separator' },
          {
            label: 'Open our GitHub repository',
            click: () => {
              void this.windowLayoutService.openUrl(
                'https://github.com/stagewise-io/stagewise',
              );
            },
          },
          {
            label: 'Open our Discord server',
            click: () => {
              void this.windowLayoutService.openUrl(
                'https://ade.stagewise.io/socials/discord',
              );
            },
          },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        role: 'editMenu',
      },
      {
        label: 'Help',
        id: 'help_menu',
        submenu: [
          {
            id: 'help_menu_report_issue',
            label: 'Report an issue',
            click: () => {},
            visible: true,
          },
          { type: 'separator' },
          {
            id: 'help_menu_toggle_dev_tools',
            label: 'Toggle developer tools',
            click: () => {
              this.windowLayoutService.toggleUIDevTools();
            },
            visible: true,
          },
        ],
      },
    ]);
  }
}
