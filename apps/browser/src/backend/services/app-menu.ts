import { app, Menu } from 'electron';
import path from 'node:path';
import type { Logger } from './logger';
import type { WindowLayoutService } from './window-layout';
import type { AuthService } from './auth';
import { fileURLToPath } from 'node:url';
import { DisposableService } from './disposable';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class AppMenuService extends DisposableService {
  private readonly logger: Logger;
  private readonly authService: AuthService;
  private readonly windowLayoutService: WindowLayoutService;

  // Store bound callback reference for proper unregistration
  private readonly boundUpdateApplicationMenu: () => void;

  constructor(
    logger: Logger,
    authService: AuthService,
    windowLayoutService: WindowLayoutService,
  ) {
    super();
    this.logger = logger;
    this.authService = authService;
    this.windowLayoutService = windowLayoutService;

    // Bind once and store reference for later unregistration
    this.boundUpdateApplicationMenu = this.updateApplicationMenu.bind(this);

    this.logger.debug('[AppMenuService] Initializing service');

    this.authService.registerAuthStateChangeCallback(
      this.boundUpdateApplicationMenu,
    );

    this.updateApplicationMenu();

    this.logger.debug('[AppMenuService] Service initialized');
  }

  protected onTeardown(): void {
    this.logger.debug('[AppMenuService] Teardown called');

    this.authService.unregisterAuthStateChangeCallback(
      this.boundUpdateApplicationMenu,
    );

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
                'https://stagewise.io/socials/discord',
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
                    void this.windowLayoutService.openUrl(
                      'https://console.stagewise.io',
                    );
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
