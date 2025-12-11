import { type MessagePortMain, View, WebContentsView, shell } from 'electron';
import { getHotkeyDefinitionForEvent } from '@shared/hotkeys';
import type { Input } from 'electron';
import contextMenu from 'electron-context-menu';
import type { Logger } from '../logger';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import {
  createKartonServer,
  ElectronServerTransport,
  type KartonServer,
} from '@stagewise/karton/server';
import {
  defaultState,
  type TabKartonContract,
  type SerializableKeyboardEvent,
} from '@shared/karton-contracts/web-contents-preload';
import type { ContextElement } from '@shared/context-elements';
import { ContextElementTracker } from './context-element-tracker';
import { electronInputToDomKeyboardEvent } from '@/utils/electron-input-to-dom-keyboard-event';

export interface TabState {
  title: string;
  url: string;
  faviconUrls: string[];
  isLoading: boolean;
  isResponsive: boolean;
  error: {
    code: number;
    message?: string;
  } | null;
  navigationHistory: {
    canGoBack: boolean;
    canGoForward: boolean;
  };
  devToolsOpen: boolean;
}

export interface TabControllerEventMap {
  stateUpdated: [state: Partial<TabState>];
  movePanelToForeground: [panel: 'stagewise-ui' | 'tab-content'];
  handleKeyDown: [keyDownEvent: SerializableKeyboardEvent];
  elementHovered: [element: ContextElement | null];
  elementSelected: [element: ContextElement];
}

export class TabController extends EventEmitter<TabControllerEventMap> {
  public readonly id: string;
  private viewContainer: View;
  private webContentsView: WebContentsView;
  private logger: Logger;
  private kartonServer: KartonServer<TabKartonContract>;
  private kartonTransport: ElectronServerTransport;
  private contextElementTracker: ContextElementTracker;

  // Current state cache
  private currentState: TabState;

  constructor(id: string, logger: Logger, initialUrl?: string) {
    super();
    this.id = id;
    this.logger = logger;

    this.viewContainer = new View();
    this.viewContainer.setBorderRadius(4);
    this.viewContainer.setBackgroundColor('#FFF');
    this.webContentsView = new WebContentsView({
      webPreferences: {
        preload: path.join(
          path.dirname(new URL(import.meta.url).pathname),
          'web-content-preload/index.js',
        ),
        nodeIntegrationInSubFrames: true,
        partition: 'persist:browser-content',
      },
    });
    this.webContentsView.setBorderRadius(4);
    this.kartonTransport = new ElectronServerTransport();

    // Forward keydown events when dev tools are opened
    this.webContentsView.webContents.addListener('devtools-opened', () => {
      this.webContentsView.webContents.devToolsWebContents?.addListener(
        'input-event',
        (_e, input) => {
          const domEvent = electronInputToDomKeyboardEvent(input as Input);
          if (input.type === 'keyDown' || input.type === 'rawKeyDown') {
            const hotkeyDef = getHotkeyDefinitionForEvent(domEvent);
            if (hotkeyDef?.captureDominantly)
              this.emit('handleKeyDown', domEvent);
          }
        },
      );
    });

    this.kartonServer = createKartonServer<TabKartonContract>({
      initialState: defaultState,
      transport: this.kartonTransport,
    });
    this.registerKartonProcedureHandlers();
    this.contextElementTracker = new ContextElementTracker(
      this.webContentsView.webContents,
      this.logger,
    );

    this.contextElementTracker.on('hoverChanged', async (elementId) => {
      if (elementId) {
        const info =
          await this.contextElementTracker.collectHoveredElementInfo();
        if (info) {
          info.tabId = this.id;
          this.emit('elementHovered', info);
        }
      } else {
        this.emit('elementHovered', null);
      }
    });

    contextMenu({
      showSaveImageAs: true,
      showServices: true,
      window: this.webContentsView.webContents,
    });

    this.viewContainer.addChildView(this.webContentsView);

    this.webContentsView.webContents.session.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 stagewise/1.0.0-alpha',
    );

    this.currentState = {
      title: 'New tab',
      url: initialUrl || '',
      isLoading: false,
      isResponsive: true,
      error: null,
      navigationHistory: {
        canGoBack: false,
        canGoForward: false,
      },
      devToolsOpen: false,
      faviconUrls: [],
    };

    this.setupEventListeners();

    if (initialUrl) {
      this.loadURL(initialUrl);
    }
  }

  public getViewContainer(): View {
    return this.viewContainer;
  }

  public setBounds(bounds: Electron.Rectangle) {
    this.viewContainer.setBounds(bounds);
    // Resize child to match container
    this.webContentsView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
    });
  }

  public setVisible(visible: boolean) {
    this.viewContainer.setVisible(visible);
  }

  public loadURL(url: string) {
    this.updateState({ url });
    this.webContentsView.webContents.loadURL(url);
  }

  public reload() {
    this.webContentsView.webContents.reload();
  }

  public stop() {
    this.webContentsView.webContents.stop();
  }

  public goBack() {
    if (this.webContentsView.webContents.navigationHistory.canGoBack()) {
      this.webContentsView.webContents.navigationHistory.goBack();
    }
  }

  public goForward() {
    if (this.webContentsView.webContents.navigationHistory.canGoForward()) {
      this.webContentsView.webContents.navigationHistory.goForward();
    }
  }

  public openDevTools() {
    this.webContentsView.webContents.openDevTools();
  }

  public closeDevTools() {
    this.webContentsView.webContents.closeDevTools();
  }

  public toggleDevTools() {
    this.webContentsView.webContents.toggleDevTools();
  }

  public focus() {
    this.webContentsView.webContents.focus();
  }

  public setContextSelectionMode(active: boolean) {
    // TODO: Implement context selection mode logic
    // This will likely involve sending a message to the preload script
    this.contextElementTracker.setContextSelection(active);
  }

  public async selectHoveredElement() {
    const info = await this.contextElementTracker.collectHoveredElementInfo();
    if (info) {
      info.tabId = this.id;
      this.emit('elementSelected', info);
    }
  }

  public async updateContextSelection(selectedElements: ContextElement[]) {
    await this.contextElementTracker.updateHighlights(
      selectedElements,
      this.id,
    );
  }

  public async scrollToElement(
    backendNodeId: number,
    frameId: string,
  ): Promise<boolean> {
    return await this.contextElementTracker.scrollToElement(
      backendNodeId,
      frameId,
    );
  }

  public async checkFrameValidity(
    frameId: string,
    expectedFrameLocation: string,
  ): Promise<boolean> {
    return await this.contextElementTracker.checkFrameValidity(
      frameId,
      expectedFrameLocation,
    );
  }

  public async checkElementExists(
    backendNodeId: number,
    frameId: string,
  ): Promise<boolean> {
    return await this.contextElementTracker.checkElementExists(
      backendNodeId,
      frameId,
    );
  }

  public setContextSelectionMouseCoordinates(x: number, y: number) {
    this.webContentsView.webContents.sendInputEvent({
      type: 'mouseMove',
      x,
      y,
    });
    this.contextElementTracker.updateMousePosition(x, y);
  }

  public async clearContextSelectionMouseCoordinates() {
    await this.contextElementTracker.clearMousePosition();
  }

  public passthroughWheelEvent(event: {
    type: 'wheel';
    x: number;
    y: number;
    deltaX: number;
    deltaY: number;
  }) {
    const ev: Electron.MouseWheelInputEvent = {
      type: 'mouseWheel',
      x: event.x,
      y: event.y,
      deltaX: -event.deltaX,
      deltaY: -event.deltaY,
    };
    this.webContentsView.webContents.sendInputEvent(ev);
  }

  public get webContentsId(): number {
    return this.webContentsView.webContents.id;
  }

  public addKartonConnection(connection: MessagePortMain) {
    const connectionId = this.kartonTransport.setPort(connection);
    this.logger.debug(
      `[TabController] Added karton connection to tab ${this.id} with connection ID ${connectionId}`,
    );
  }

  private registerKartonProcedureHandlers() {
    this.kartonServer.registerServerProcedureHandler(
      'movePanelToForeground',
      async (panel: 'stagewise-ui' | 'tab-content') => {
        this.emit('movePanelToForeground', panel);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'handleKeyDown',
      async (key) => {
        this.emit('handleKeyDown', key);
      },
    );
  }

  /**
   * Call this to make the tab store the currently hovered element as a selected element.
   * This will toggle the hovered elment to be reported as one of the stored elements.
   */
  // public selectHoveredElement() {
  //   this.contextElementTracker.selectHoveredElement();
  // }

  // public removeSelectedElement(id: string) {
  //   this.contextElementTracker.removeSelectedElement(id);
  // }

  public destroy() {
    // View destruction is handled by removing from parent, but we can explicitly help if needed
    // The webcontents will be destroyed when the view is destroyed
    this.removeAllListeners();
  }

  public getState(): TabState {
    return { ...this.currentState };
  }

  private updateState(updates: Partial<TabState>) {
    this.currentState = { ...this.currentState, ...updates };
    this.emit('stateUpdated', updates);
  }

  private setupEventListeners() {
    const wc = this.webContentsView.webContents;

    wc.on('did-navigate', (_event, url) => {
      this.updateState({
        url,
        navigationHistory: {
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
        },
      });
    });

    wc.on('did-navigate-in-page', (_event, url) => {
      this.updateState({
        url,
        navigationHistory: {
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
        },
      });
    });

    wc.on('did-start-loading', () => {
      this.updateState({
        isLoading: true,
        error: null,
      });
    });

    wc.on('did-stop-loading', () => {
      this.updateState({
        isLoading: false,
        error: null,
      });
    });

    wc.on('did-fail-load', (_event, errorCode, errorDescription) => {
      // Ignore "abort" errors (like when a user hits the Stop button)
      if (errorCode !== -3) {
        this.logger.error(`Page failed: ${errorDescription}`);
        this.updateState({
          isLoading: false,
          error: {
            code: errorCode,
            message: errorDescription,
          },
        });
      }
    });

    wc.on('page-title-updated', (_event, title) => {
      this.updateState({ title });
    });

    wc.on('devtools-closed', () => {
      this.updateState({ devToolsOpen: false });
    });

    wc.on('devtools-opened', () => {
      this.updateState({ devToolsOpen: true });
    });

    wc.on('responsive', () => {
      this.updateState({ isResponsive: true });
    });

    wc.on('unresponsive', () => {
      this.updateState({ isResponsive: false });
    });

    wc.on('page-favicon-updated', (_event, faviconUrls) => {
      this.updateState({ faviconUrls });
    });

    wc.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });
  }
}
