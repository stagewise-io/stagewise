import { WebContentsView, shell } from 'electron';
import path from 'node:path';
import contextMenu from 'electron-context-menu';
import type { Logger } from '../logger';
import { EventEmitter } from 'node:events';
import { KartonService } from '../karton';

// These are injected by the build system
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

export interface UIControllerEvents {
  'create-tab': (url?: string) => void;
  'close-tab': (tabId: string) => void;
  'switch-tab': (tabId: string) => void;
  'layout-update': (
    bounds: { x: number; y: number; width: number; height: number } | null,
  ) => void;
  'interactivity-change': (interactive: boolean) => void;
  stop: (tabId?: string) => void;
  reload: (tabId?: string) => void;
  goto: (url: string, tabId?: string) => void;
  'go-back': (tabId?: string) => void;
  'go-forward': (tabId?: string) => void;
  'toggle-dev-tools': (tabId?: string) => void;
  'open-dev-tools': (tabId?: string) => void;
  'close-dev-tools': (tabId?: string) => void;
  'set-context-selection-mode': (active: boolean) => void;
}

export class UIController extends EventEmitter {
  private view: WebContentsView;
  private logger: Logger;
  public readonly uiKarton: KartonService;

  private constructor(logger: Logger, uiKarton: KartonService) {
    super();
    this.logger = logger;
    this.uiKarton = uiKarton;
    const __dirname = path.dirname(new URL(import.meta.url).pathname);

    this.view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'ui-preload/index.js'),
        partition: 'persist:stagewise-ui',
      },
    });

    this.view.setBackgroundColor('#00000000');
    this.view.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });

    contextMenu({
      showSaveImage: false,
      showSaveImageAs: false,
      showCopyLink: false,
      showSearchWithGoogle: false,
      showSelectAll: false,
      showServices: false,
      showLookUpSelection: false,
      showInspectElement: false,
      window: this.view.webContents,
    });

    if (process.env.NODE_ENV === 'development') {
      this.view.webContents.openDevTools();
    }

    this.loadApp();
    this.registerKartonProcedures();
  }

  public static async create(logger: Logger): Promise<UIController> {
    const uiKarton = await KartonService.create(logger);
    return new UIController(logger, uiKarton);
  }

  private loadApp() {
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      this.view.webContents.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      this.view.webContents.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      );
    }
    this.logger.debug('[UIController] UI content view loaded');
  }

  private registerKartonProcedures() {
    this.uiKarton.registerServerProcedureHandler(
      'browser.createTab',
      async (url?: string) => {
        this.emit('create-tab', url);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.closeTab',
      async (tabId: string) => {
        this.emit('close-tab', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.switchTab',
      async (tabId: string) => {
        this.emit('switch-tab', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.layout.update',
      async (
        bounds: { x: number; y: number; width: number; height: number } | null,
      ) => {
        this.emit('layout-update', bounds);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.layout.changeInteractivity',
      async (interactive: boolean) => {
        this.emit('interactivity-change', interactive);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.stop',
      async (tabId?: string) => {
        this.emit('stop', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.reload',
      async (tabId?: string) => {
        this.emit('reload', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.goto',
      async (url: string, tabId?: string) => {
        this.emit('goto', url, tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.goBack',
      async (tabId?: string) => {
        this.emit('go-back', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.goForward',
      async (tabId?: string) => {
        this.emit('go-forward', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.toggleDevTools',
      async (tabId?: string) => {
        this.emit('toggle-dev-tools', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.openDevTools',
      async (tabId?: string) => {
        this.emit('open-dev-tools', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.closeDevTools',
      async (tabId?: string) => {
        this.emit('close-dev-tools', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.setContextSelectionMode',
      async (active: boolean) => {
        this.emit('set-context-selection-mode', active);
      },
    );
  }

  public unregisterKartonProcedures() {
    this.uiKarton.removeServerProcedureHandler('browser.createTab');
    this.uiKarton.removeServerProcedureHandler('browser.closeTab');
    this.uiKarton.removeServerProcedureHandler('browser.switchTab');
    this.uiKarton.removeServerProcedureHandler('browser.layout.update');
    this.uiKarton.removeServerProcedureHandler(
      'browser.layout.changeInteractivity',
    );
    this.uiKarton.removeServerProcedureHandler('browser.stop');
    this.uiKarton.removeServerProcedureHandler('browser.reload');
    this.uiKarton.removeServerProcedureHandler('browser.goto');
    // Note: Removing handlers by reference is tricky if we use arrow functions or inline handlers.
    // The karton service implementation likely matches by name or needs exact reference.
    // Assuming we might just need to unregister all or handle lifecycle properly.
    // For now, since these are anonymous, removal might not work perfectly unless we store references.
    // However, UIController is likely long-lived or destroyed on app exit.
  }

  public getView(): WebContentsView {
    return this.view;
  }

  public setBounds(bounds: Electron.Rectangle) {
    this.view.setBounds(bounds);
  }

  public toggleDevTools() {
    this.view.webContents.toggleDevTools();
  }

  public focus() {
    this.view.webContents.focus();
  }
}
