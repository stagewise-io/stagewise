import { app, Menu, shell } from 'electron';
import path from 'node:path';
import type { Logger } from './logger';
import type { WindowLayoutService } from './window-layout';
import type { AuthService } from './auth';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class AppMenuService {
  private logger: Logger;
  private authService: AuthService;
  private windowLayoutService: WindowLayoutService;

  constructor(
    logger: Logger,
    authService: AuthService,
    windowLayoutService: WindowLayoutService,
  ) {
    this.logger = logger;
    this.authService = authService;
    this.windowLayoutService = windowLayoutService;
    this.logger.debug('[AppMenuService] Initializing service');

    this.authService.registerAuthStateChangeCallback(
      this.updateApplicationMenu.bind(this),
    );

    this.updateApplicationMenu();

    this.logger.debug('[AppMenuService] Service initialized');
  }

  public teardown() {
    this.logger.debug('[AppMenuService] Teardown called');

    // TODO: Unregister listener for karton events
    this.authService.unregisterAuthStateChangeCallback(
      this.updateApplicationMenu.bind(this),
    );

    app.applicationMenu = null;

    // TODO: Think thoroughly about teardown behaviour and nullability
    // @ts-expect-error - TODO: Think thoroughly about teardown behaviour and nullability
    this.windowLayoutService = null;
    // @ts-expect-error - TODO: Think thoroughly about teardown behaviour and nullability
    this.authService = null;
    // @ts-expect-error - TODO: Think thoroughly about teardown behaviour and nullability
    this.logger = null;

    this.logger.debug('[AppMenuService] Teardown completed');
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
            label: 'Open our GitHub repository',
            click: () => {
              shell.openExternal('https://github.com/stagewise-io/stagewise');
            },
          },
          {
            label: 'Open our Discord server',
            click: () => {
              shell.openExternal('https://stagewise.io/socials/discord');
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
        label: 'User',
        id: 'user_menu',
        submenu: (() => {
          switch (this.authService.authState.status) {
            case 'authenticated':
            case 'server_unreachable':
              return [
                {
                  id: 'user_menu_open_console',
                  label: 'Open console',
                  click: () => {
                    shell.openExternal('https://console.stagewise.io');
                  },
                },
                { type: 'separator', id: 'user_menu_separator', visible: true },
                {
                  id: 'user_menu_logout',
                  label: 'Logout',
                  click: () => {
                    void this.authService.logout();
                  },
                },
              ];
            case 'unauthenticated':
            case 'authentication_invalid':
              return [
                {
                  id: 'user_menu_login',
                  label: 'Login',
                  click: () => {
                    void this.authService.startLogin();
                  },
                },
              ];
            default:
              return [
                {
                  id: 'user_menu_loading',
                  label: 'Loading...',
                  visible: true,
                },
              ];
          }
        })(),
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
