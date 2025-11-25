import { BaseWindow, View, WebContentsView, app, shell } from 'electron';
import path from 'node:path';
import type { KartonService } from './karton';
import type { Logger } from './logger';
import contextMenu from 'electron-context-menu';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export class WindowLayoutService {
  private logger: Logger;
  private kartonService: KartonService;

  private baseWindow: BaseWindow;
  private webContentsViewContainer: View;
  private webContentsView: WebContentsView;
  private uiContentView: WebContentsView;

  constructor(logger: Logger, kartonService: KartonService) {
    this.logger = logger;
    this.kartonService = kartonService;

    this.logger.debug('[WindowLayoutService] Initializing service');

    this.baseWindow = new BaseWindow({
      width: 800,
      height: 600,
      title: 'stagewise',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 14 },
      vibrancy: 'popover',
      backgroundMaterial: 'mica',
      backgroundColor: '#fafafa00',
      transparent: true,
      roundedCorners: true,
      closable: true,
      frame: false,
    });

    this.webContentsViewContainer = new View();
    this.webContentsViewContainer.setBorderRadius(12);
    this.webContentsViewContainer.setBackgroundColor('#FFF');

    this.webContentsView = new WebContentsView({});
    this.webContentsView.setBorderRadius(12);
    contextMenu({
      showSaveImageAs: true,
      showServices: true,
      window: this.webContentsView.webContents,
    });

    this.webContentsViewContainer.addChildView(this.webContentsView);
    this.baseWindow.contentView.addChildView(this.webContentsViewContainer);

    this.uiContentView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    this.uiContentView.setBackgroundColor('#00000000');
    this.uiContentView.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });
    this.baseWindow.contentView.addChildView(this.uiContentView);

    this.uiContentView.webContents.openDevTools();

    // Sync sizes on startup and resize
    this.handleMainWindowResize();
    this.baseWindow.on('resize', this.handleMainWindowResize.bind(this));

    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      this.uiContentView.webContents.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      this.uiContentView.webContents.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      );
    }

    this.logger.debug('[WindowLayoutService] UI content view loaded');

    this.logger.debug(
      '[WindowLayoutService] Registering karton event listeners',
    );
    this.kartonService.registerServerProcedureHandler(
      'webContent.layout.update',
      this.handleWebContentBoundsChange.bind(this),
    );
    this.kartonService.registerServerProcedureHandler(
      'webContent.layout.changeInteractivity',
      this.handleWebContentInteractivityChange.bind(this),
    );
    this.kartonService.registerServerProcedureHandler(
      'webContent.stop',
      this.handleWebContentStop.bind(this),
    );
    this.kartonService.registerServerProcedureHandler(
      'webContent.reload',
      this.handleWebContentReload.bind(this),
    );
    this.kartonService.registerServerProcedureHandler(
      'webContent.goto',
      this.handleWebContentGoto.bind(this),
    );
    this.kartonService.registerServerProcedureHandler(
      'webContent.goBack',
      this.handleWebContentGoBack.bind(this),
    );
    this.kartonService.registerServerProcedureHandler(
      'webContent.goForward',
      this.handleWebContentGoForward.bind(this),
    );
    this.kartonService.registerServerProcedureHandler(
      'webContent.toggleDevTools',
      this.handleWebContentToggleDevTools.bind(this),
    );
    this.kartonService.registerServerProcedureHandler(
      'webContent.openDevTools',
      this.handleWebContentOpenDevTools.bind(this),
    );
    this.kartonService.registerServerProcedureHandler(
      'webContent.closeDevTools',
      this.handleWebContentCloseDevTools.bind(this),
    );
    this.logger.debug(
      '[WindowLayoutService] Karton event listeners registered',
    );

    this.logger.debug(
      '[WindowLayoutService] Setting initial web contents karton state...',
    );

    this.kartonService.setState((draft) => {
      draft.webContent = {
        devToolsOpen: false,
        state: 'loaded',
        url: '',
        isLoading: false,
        isResponsive: true,
        navigationHistory: {
          canGoBack: false,
          canGoForward: false,
        },
        title: 'New tab',
      };
    });

    // Register all handlers for the UI content view.
    this.webContentsView.webContents.on('did-navigate', (_event, url) => {
      this.kartonService.setState((draft) => {
        draft.webContent.url = url;
        draft.webContent.navigationHistory.canGoBack =
          this.webContentsView.webContents.navigationHistory.canGoBack();
        draft.webContent.navigationHistory.canGoForward =
          this.webContentsView.webContents.navigationHistory.canGoForward();
      });
    });
    this.webContentsView.webContents.on(
      'did-navigate-in-page',
      (_event, url) => {
        this.kartonService.setState((draft) => {
          draft.webContent.url = url;
          draft.webContent.navigationHistory.canGoBack =
            this.webContentsView.webContents.navigationHistory.canGoBack();
          draft.webContent.navigationHistory.canGoForward =
            this.webContentsView.webContents.navigationHistory.canGoForward();
        });
      },
    );

    this.webContentsView.webContents.on('did-start-loading', () => {
      this.kartonService.setState((draft) => {
        draft.webContent.isLoading = true;
        draft.webContent.error = null;
      });
    });
    this.webContentsView.webContents.on('did-stop-loading', () => {
      this.kartonService.setState((draft) => {
        draft.webContent.isLoading = false;
        draft.webContent.error = null;
      });
    });
    this.webContentsView.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription) => {
        // Ignore "abort" errors (like when a user hits the Stop button)
        if (errorCode !== -3) {
          console.log('Page failed:', errorDescription);
          this.kartonService.setState((draft) => {
            draft.webContent.isLoading = false;
            draft.webContent.error = {
              code: errorCode,
              message: errorDescription,
            };
          });
        }
      },
    );

    this.webContentsView.webContents.on(
      'page-title-updated',
      (_event, title) => {
        this.kartonService.setState((draft) => {
          draft.webContent.title = title;
        });
      },
    );

    this.webContentsView.webContents.on('devtools-closed', () => {
      this.kartonService.setState((draft) => {
        draft.webContent.devToolsOpen = false;
      });
    });
    this.webContentsView.webContents.on('devtools-opened', () => {
      this.kartonService.setState((draft) => {
        draft.webContent.devToolsOpen = true;
      });
    });

    this.webContentsView.webContents.on('responsive', () => {
      this.kartonService.setState((draft) => {
        draft.webContent.isResponsive = true;
      });
    });
    this.webContentsView.webContents.on('unresponsive', () => {
      this.kartonService.setState((draft) => {
        draft.webContent.isResponsive = false;
      });
    });

    this.webContentsView.webContents.on(
      'page-favicon-updated',
      (_event, faviconUrls) => {
        this.kartonService.setState((draft) => {
          draft.webContent.faviconUrls = faviconUrls;
        });
      },
    );
    this.webContentsView.webContents.setWindowOpenHandler((details) => {
      // WIP: While we don't support tabs, we use the shell to open links in the user's default browser.
      shell.openExternal(details.url);
      return { action: 'deny' };
    });
    this.webContentsView.webContents.session.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 stagewise/1.0.0-alpha',
    );

    // Open home page on startup.
    this.handleWebContentGoto('https://google.com');

    this.logger.debug(
      '[WindowLayoutService] Set initial web contents karton state',
    );

    this.logger.debug('[WindowLayoutService] Service initialized');
  }

  public teardown() {
    this.logger.debug('[WindowLayoutService] Teardown called');
    this.kartonService.removeServerProcedureHandler(
      'webContent.layout.update',
      this.handleWebContentBoundsChange.bind(this),
    );
    this.kartonService.removeServerProcedureHandler(
      'webContent.layout.changeInteractivity',
      this.handleWebContentInteractivityChange.bind(this),
    );
    this.kartonService.removeServerProcedureHandler(
      'webContent.stop',
      this.handleWebContentStop.bind(this),
    );
    this.kartonService.removeServerProcedureHandler(
      'webContent.reload',
      this.handleWebContentReload.bind(this),
    );
    this.kartonService.removeServerProcedureHandler(
      'webContent.goto',
      this.handleWebContentGoto.bind(this),
    );
    this.kartonService.removeServerProcedureHandler(
      'webContent.goBack',
      this.handleWebContentGoBack.bind(this),
    );
    this.kartonService.removeServerProcedureHandler(
      'webContent.goForward',
      this.handleWebContentGoForward.bind(this),
    );
    this.kartonService.removeServerProcedureHandler(
      'webContent.toggleDevTools',
      this.handleWebContentToggleDevTools.bind(this),
    );
    this.kartonService.removeServerProcedureHandler(
      'webContent.openDevTools',
      this.handleWebContentOpenDevTools.bind(this),
    );
    this.kartonService.removeServerProcedureHandler(
      'webContent.closeDevTools',
      this.handleWebContentCloseDevTools.bind(this),
    );

    app.applicationMenu = null;

    this.baseWindow.contentView.removeChildView(this.uiContentView);
    this.baseWindow.contentView.removeChildView(this.webContentsViewContainer);
    this.baseWindow.destroy();

    this.uiContentView = null;
    this.webContentsViewContainer = null;
    this.webContentsView = null;
    this.baseWindow = null;

    this.logger.debug('[WindowLayoutService] Teardown completed');
  }

  public toggleUIDevTools() {
    this.uiContentView.webContents.toggleDevTools();
  }

  private handleMainWindowResize() {
    const bounds = this.baseWindow.getContentBounds();

    // Layer 3 (UI) also fills the whole screen
    this.uiContentView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
    });
  }

  private handleWebContentInteractivityChange(interactive: boolean) {
    // Depending on the interactivity, we either push the UI on top of the window or the web contents view container.
    if (interactive) {
      this.baseWindow.contentView.addChildView(this.webContentsViewContainer);
      //this.webContentsView.webContents.focus();
    } else {
      this.baseWindow.contentView.addChildView(this.uiContentView);
      //this.uiContentView.webContents.focus();
    }
  }

  private handleWebContentBoundsChange(
    bounds: { x: number; y: number; width: number; height: number } | null,
  ) {
    // If bounds is null, the webcontents view container should disappear (don't close, but hide and suspend the view and all children, like an inactive tab)
    // If bounds is set, the wecontents view container should be resized and moved to follow the bounds that it's given.
    // As usual, every child of the webcontents view container should be resized to stay full-width of it's parent.
    if (bounds) {
      this.webContentsViewContainer.setVisible(true);
      this.webContentsViewContainer.setBounds(bounds);
      this.webContentsView.setBounds({
        x: 0,
        y: 0,
        width: bounds.width,
        height: bounds.height,
      });
    } else {
      this.webContentsViewContainer.setVisible(false);
    }
  }

  private handleWebContentStop() {
    this.webContentsView.webContents.stop();
  }

  private handleWebContentReload() {
    this.webContentsView.webContents.reload();
  }

  private handleWebContentGoto(url: string) {
    this.kartonService.setState((draft) => {
      // Optimistic update of the URL in the karton state.
      draft.webContent.url = url;
    });
    this.webContentsView.webContents.loadURL(url);
  }

  private handleWebContentGoBack() {
    this.webContentsView.webContents.navigationHistory.goBack();
  }

  private handleWebContentGoForward() {
    this.webContentsView.webContents.navigationHistory.goForward();
  }

  private handleWebContentOpenDevTools() {
    this.webContentsView.webContents.openDevTools();
  }

  private handleWebContentCloseDevTools() {
    this.webContentsView.webContents.closeDevTools();
  }

  private handleWebContentToggleDevTools() {
    this.webContentsView.webContents.toggleDevTools();
  }
}
