import { WebContentsView, shell } from 'electron';
import { domCodeToElectronKeyCode } from '../../utils/dom-code-to-electron-key-code';
import path from 'node:path';
import contextMenu from 'electron-context-menu';
import type { Logger } from '../logger';
import { EventEmitter } from 'node:events';
import { KartonService } from '../karton';
import type { SerializableKeyboardEvent } from '@shared/karton-contracts/web-contents-preload';
import type { ColorScheme } from '@shared/karton-contracts/ui';
import type { PageTransition } from '@shared/karton-contracts/pages-api/types';
import { fileURLToPath } from 'node:url';
import { canBrowserHandleUrl } from './protocol-utils';

// These are injected by the build system
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

export interface UIControllerEventMap {
  uiReady: [];
  createTab: [url?: string, setActive?: boolean];
  closeTab: [tabId: string];
  switchTab: [tabId: string];
  reorderTabs: [tabIds: string[]];
  layoutUpdate: [
    bounds: { x: number; y: number; width: number; height: number } | null,
  ];
  movePanelToForeground: [panel: 'stagewise-ui' | 'tab-content'];
  togglePanelKeyboardFocus: [panel: 'stagewise-ui' | 'tab-content'];
  stop: [tabId?: string];
  reload: [tabId?: string];
  goto: [url: string, tabId?: string, transition?: PageTransition];
  goBack: [tabId?: string];
  goForward: [tabId?: string];
  toggleDevTools: [tabId?: string];
  openDevTools: [tabId?: string];
  closeDevTools: [tabId?: string];
  setAudioMuted: [muted: boolean, tabId?: string];
  toggleAudioMuted: [tabId?: string];
  setColorScheme: [scheme: ColorScheme, tabId?: string];
  cycleColorScheme: [tabId?: string];
  setZoomPercentage: [percentage: number, tabId?: string];
  setContextSelectionMode: [active: boolean];
  setContextSelectionMouseCoordinates: [x: number, y: number];
  clearContextSelectionMouseCoordinates: [];
  passthroughWheelEvent: [
    event: {
      type: 'wheel';
      x: number;
      y: number;
      deltaX: number;
      deltaY: number;
    },
  ];
  selectHoveredElement: [];
  removeElement: [elementId: string];
  clearElements: [];
  clearPendingScreenshots: [];
  scrollToElement: [tabId: string, backendNodeId: number, frameId: string];
  checkFrameValidity: [
    tabId: string,
    frameId: string,
    expectedFrameLocation: string,
  ];
  startSearchInPage: [searchText: string, tabId?: string];
  updateSearchInPageText: [searchText: string, tabId?: string];
  nextSearchResult: [tabId?: string];
  previousSearchResult: [tabId?: string];
  stopSearchInPage: [tabId?: string];
  activateSearchBar: [];
  deactivateSearchBar: [];
}

export class UIController extends EventEmitter<UIControllerEventMap> {
  private view: WebContentsView;
  private logger: Logger;
  public readonly uiKarton: KartonService;
  private checkFrameValidityHandler?: (
    tabId: string,
    frameId: string,
    expectedFrameLocation: string,
  ) => Promise<boolean>;
  private checkElementExistsHandler?: (
    tabId: string,
    backendNodeId: number,
    frameId: string,
  ) => Promise<boolean>;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.uiKarton = new KartonService(logger);

    this.view = new WebContentsView({
      webPreferences: {
        preload: path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          'ui-preload/index.js',
        ),
        partition: 'persist:stagewise-ui',
      },
    });

    this.view.setBackgroundColor('#00000000');
    this.view.webContents.setWindowOpenHandler((details) => {
      // Check if the browser can handle this URL's protocol
      if (!canBrowserHandleUrl(details.url)) {
        // Open in external application (mailto:, tel:, vscode:, etc.)
        this.logger.debug(
          `[UIController] Opening URL with external handler: ${details.url}`,
        );
        shell.openExternal(details.url);
        return { action: 'deny' };
      }

      // Check disposition to determine if tab should be opened in background
      // disposition can be: 'default', 'foreground-tab', 'background-tab', 'new-window', etc.
      const setActive = details.disposition !== 'background-tab';
      this.emit('createTab', details.url, setActive);
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

    // Listen for the UI finishing load to ensure proper rendering
    this.view.webContents.once('did-finish-load', () => {
      this.logger.debug(
        '[UIController] UI finished loading, invalidating view',
      );
      // Force a repaint after UI loads to prevent invisible UI bug
      const bounds = this.view.getBounds();
      this.view.setBounds({ ...bounds });
      // Emit event so WindowLayoutService can trigger initial layout check
      this.emit('uiReady');
    });

    this.loadApp();
    this.registerKartonProcedures();
  }

  private loadApp() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
      async (url?: string, setActive?: boolean) => {
        this.emit('createTab', url, setActive);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.closeTab',
      async (tabId: string) => {
        this.emit('closeTab', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.switchTab',
      async (tabId: string) => {
        this.emit('switchTab', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.reorderTabs',
      async (tabIds: string[]) => {
        this.emit('reorderTabs', tabIds);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.layout.update',
      async (
        bounds: { x: number; y: number; width: number; height: number } | null,
      ) => {
        this.emit('layoutUpdate', bounds);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.layout.movePanelToForeground',
      async (panel: 'stagewise-ui' | 'tab-content') => {
        this.emit('movePanelToForeground', panel);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.layout.togglePanelKeyboardFocus',
      async (panel: 'stagewise-ui' | 'tab-content') => {
        this.emit('togglePanelKeyboardFocus', panel);
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
      async (url: string, tabId?: string, transition?: PageTransition) => {
        this.emit('goto', url, tabId, transition);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.goBack',
      async (tabId?: string) => {
        this.emit('goBack', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.goForward',
      async (tabId?: string) => {
        this.emit('goForward', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.toggleDevTools',
      async (tabId?: string) => {
        this.emit('toggleDevTools', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.openDevTools',
      async (tabId?: string) => {
        this.emit('openDevTools', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.closeDevTools',
      async (tabId?: string) => {
        this.emit('closeDevTools', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.setAudioMuted',
      async (muted: boolean, tabId?: string) => {
        this.emit('setAudioMuted', muted, tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.toggleAudioMuted',
      async (tabId?: string) => {
        this.emit('toggleAudioMuted', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.setColorScheme',
      async (scheme: ColorScheme, tabId?: string) => {
        this.emit('setColorScheme', scheme, tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.cycleColorScheme',
      async (tabId?: string) => {
        this.emit('cycleColorScheme', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.setZoomPercentage',
      async (percentage: number, tabId?: string) => {
        this.emit('setZoomPercentage', percentage, tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.setActive',
      async (active: boolean) => {
        this.emit('setContextSelectionMode', active);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.setMouseCoordinates',
      async (x: number, y: number) => {
        this.emit('setContextSelectionMouseCoordinates', x, y);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.clearMouseCoordinates',
      async () => {
        this.emit('clearContextSelectionMouseCoordinates');
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.passthroughWheelEvent',
      async (event) => {
        this.emit('passthroughWheelEvent', event);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.selectHoveredElement',
      async () => {
        // TODO: Implement by adding the element to the chat state controller.
        this.emit('selectHoveredElement');
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.removeElement',
      async (elementId: string) => {
        // TODO: Implement by removing the element from the chat state controller.
        this.emit('removeElement', elementId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.clearElements',
      async () => {
        // TODO: Implement by clearing all stored elements in the chat state controller.
        this.emit('clearElements');
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.contextSelection.clearPendingScreenshots',
      async () => {
        this.emit('clearPendingScreenshots');
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.scrollToElement',
      async (tabId: string, backendNodeId: number, frameId: string) => {
        this.emit('scrollToElement', tabId, backendNodeId, frameId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.checkFrameValidity',
      async (tabId: string, frameId: string, expectedFrameLocation: string) => {
        if (this.checkFrameValidityHandler) {
          return await this.checkFrameValidityHandler(
            tabId,
            frameId,
            expectedFrameLocation,
          );
        }
        return false;
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.checkElementExists',
      async (tabId: string, backendNodeId: number, frameId: string) => {
        if (this.checkElementExistsHandler) {
          return await this.checkElementExistsHandler(
            tabId,
            backendNodeId,
            frameId,
          );
        }
        return false;
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchInPage.start',
      async (searchText: string, tabId?: string) => {
        this.emit('startSearchInPage', searchText, tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchInPage.updateText',
      async (searchText: string, tabId?: string) => {
        this.emit('updateSearchInPageText', searchText, tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchInPage.next',
      async (tabId?: string) => {
        this.emit('nextSearchResult', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchInPage.previous',
      async (tabId?: string) => {
        this.emit('previousSearchResult', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchInPage.stop',
      async (tabId?: string) => {
        this.emit('stopSearchInPage', tabId);
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchBar.activate',
      async () => {
        this.emit('activateSearchBar');
      },
    );
    this.uiKarton.registerServerProcedureHandler(
      'browser.searchBar.deactivate',
      async () => {
        this.emit('deactivateSearchBar');
      },
    );
  }

  public forwardFocusEvent(tabId: string) {
    this.view.webContents.send('stagewise-tab-focused', tabId);
  }

  public forwardKeyDownEvent(key: SerializableKeyboardEvent) {
    const electronKeyCode = domCodeToElectronKeyCode(key.code, key.key);
    const modifiers = [
      key.ctrlKey ? ('control' as const) : undefined,
      key.altKey ? ('alt' as const) : undefined,
      key.shiftKey ? ('shift' as const) : undefined,
      key.metaKey ? ('meta' as const) : undefined,
    ].filter(Boolean) as ('control' | 'alt' | 'shift' | 'meta')[];

    this.view.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: electronKeyCode,
      modifiers,
    });
  }

  public setCheckFrameValidityHandler(
    handler: (
      tabId: string,
      frameId: string,
      expectedFrameLocation: string,
    ) => Promise<boolean>,
  ) {
    this.checkFrameValidityHandler = handler;
  }

  public setCheckElementExistsHandler(
    handler: (
      tabId: string,
      backendNodeId: number,
      frameId: string,
    ) => Promise<boolean>,
  ) {
    this.checkElementExistsHandler = handler;
  }

  public unregisterKartonProcedures() {
    this.uiKarton.removeServerProcedureHandler('browser.createTab');
    this.uiKarton.removeServerProcedureHandler('browser.closeTab');
    this.uiKarton.removeServerProcedureHandler('browser.switchTab');
    this.uiKarton.removeServerProcedureHandler('browser.reorderTabs');
    this.uiKarton.removeServerProcedureHandler('browser.layout.update');
    this.uiKarton.removeServerProcedureHandler(
      'browser.layout.movePanelToForeground',
    );
    this.uiKarton.removeServerProcedureHandler(
      'browser.layout.togglePanelKeyboardFocus',
    );
    this.uiKarton.removeServerProcedureHandler('browser.stop');
    this.uiKarton.removeServerProcedureHandler('browser.reload');
    this.uiKarton.removeServerProcedureHandler('browser.goto');
    this.uiKarton.removeServerProcedureHandler('browser.goBack');
    this.uiKarton.removeServerProcedureHandler('browser.goForward');
    this.uiKarton.removeServerProcedureHandler('browser.toggleDevTools');
    this.uiKarton.removeServerProcedureHandler('browser.openDevTools');
    this.uiKarton.removeServerProcedureHandler('browser.closeDevTools');
    this.uiKarton.removeServerProcedureHandler('browser.setAudioMuted');
    this.uiKarton.removeServerProcedureHandler('browser.toggleAudioMuted');
    this.uiKarton.removeServerProcedureHandler('browser.setColorScheme');
    this.uiKarton.removeServerProcedureHandler('browser.cycleColorScheme');
    this.uiKarton.removeServerProcedureHandler('browser.setZoomPercentage');
    this.uiKarton.removeServerProcedureHandler(
      'browser.contextSelection.setActive',
    );
    this.uiKarton.removeServerProcedureHandler(
      'browser.contextSelection.setMouseCoordinates',
    );
    this.uiKarton.removeServerProcedureHandler(
      'browser.contextSelection.selectHoveredElement',
    );
    this.uiKarton.removeServerProcedureHandler(
      'browser.contextSelection.removeElement',
    );
    this.uiKarton.removeServerProcedureHandler(
      'browser.contextSelection.clearElements',
    );
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
