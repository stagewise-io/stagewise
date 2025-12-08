import {
  type MessagePortMain,
  View,
  WebContentsView,
  shell,
  type WebContents,
} from 'electron';
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
} from '@shared/karton-contracts/web-contents-preload';
import type { ContextElement } from '@shared/context-elements';

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
  putIntoBackground: [];
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
    this.viewContainer.setBorderRadius(8);
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
    this.webContentsView.setBorderRadius(8);
    this.kartonTransport = new ElectronServerTransport();

    this.kartonServer = createKartonServer<TabKartonContract>({
      initialState: defaultState,
      transport: this.kartonTransport,
    });
    this.registerKartonProcedureHandlers();
    this.contextElementTracker = new ContextElementTracker(
      this.webContentsView.webContents,
      this.logger,
    );

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

  public setContextSelectionMode(active: boolean) {
    // TODO: Implement context selection mode logic
    // This will likely involve sending a message to the preload script
    this.contextElementTracker.setContextSelection(active);
  }

  public setContextSelectionMouseCoordinates(x: number, y: number) {
    this.contextElementTracker.updateMousePosition(x, y);
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
      'putIntoBackground',
      async () => {
        // TODO: Switch the focus to the UI. This means: Move the UI in front of the tab again.
        this.emit('putIntoBackground');
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

interface ElementSelectorEventMap {
  hoverChanged: [elementId: string | null];
}

interface HoverState {
  id: string; // Stringified backendNodeId
  backendId: number; // Raw integer ID
  frameId: string;
}

export class ContextElementTracker extends EventEmitter<ElementSelectorEventMap> {
  private webContents: WebContents;
  private debugger: Electron.Debugger;
  private logger: Logger;
  // Logic State
  private isSelectionActive = false;
  private lastMousePos: { x: number; y: number } | null = null;
  private throttleTimer: NodeJS.Timeout | null = null;
  private readonly HIT_TEST_INTERVAL_MS = 100;

  // Data State
  private currentHover: HoverState | null = null;
  private selectedElements: Map<string, HoverState> = new Map();

  // Cache for Isolated World IDs: Map<FrameId, ExecutionContextId>
  private contextCache: Map<string, number> = new Map();

  // Initialization State
  private isInitialized = false;

  constructor(webContents: WebContents, logger: Logger) {
    super();
    this.webContents = webContents;
    this.debugger = this.webContents.debugger;
    this.logger = logger;

    this.logger.debug('[ContextElementTracker] Initialized');

    // Note: We do NOT attach here. We wait for usage.
  }

  // =========================================================================
  // Connection Lifecycle Management (Requirement #1)
  // =========================================================================

  /**
   * Ensures the debugger is attached and domains are enabled.
   * Call this before performing any CDP operations.
   */
  private async ensureConnected() {
    if (this.isInitialized) return;

    if (!this.debugger.isAttached()) {
      try {
        this.debugger.attach('1.3');
        this.logger.debug('[ContextElementTracker] Debugger attached');
      } catch (err) {
        this.logger.error(
          `[ContextElementTracker] Failed to attach debugger: ${err}`,
        );
        return;
      }
    }

    try {
      // Listen for detached event to cleanup state if user/devtools closes it
      this.debugger.on('detach', () => this.handleExternalDetach());
      this.debugger.on('message', (_event, method, params) =>
        this.handleCdpMessage(method, params),
      );

      await this.sendCommand('DOM.enable');
      await this.sendCommand('Page.enable');
      await this.sendCommand('Runtime.enable'); // Needed to find isolated worlds
      this.isInitialized = true;
    } catch (err) {
      this.logger.error(
        `[ContextElementTracker] Failed to initialize debugger domains: ${err}`,
      );
    }
  }

  /**
   * Checks if we still need the debugger. If not, detach.
   */
  private async checkDisconnect() {
    // We stay connected if:
    // 1. Context Selection (Hovering) is active
    // 2. We have at least one selected element (highlighting requires updates)
    const isNeeded = this.isSelectionActive || this.selectedElements.size > 0;

    if (!isNeeded && this.debugger.isAttached()) {
      try {
        // Clear any cached contexts before detaching
        this.contextCache.clear();
        this.debugger.detach();
        this.logger.debug('[ContextElementTracker] Debugger detached');
      } catch {
        /* ignore */
      }
    }
  }

  private handleExternalDetach() {
    // Reset internal state if connection is lost
    this.isInitialized = false;
    this.isSelectionActive = false;
    this.contextCache.clear();
    this.stopThrottle();
  }

  private sendCommand(method: string, params: any = {}): Promise<any> {
    if (!this.debugger.isAttached())
      return Promise.reject(new Error('Debugger detached'));
    return this.debugger.sendCommand(method, params);
  }

  /**
   * Listens for execution context creation to map Frames to their Isolated Worlds.
   */
  private handleCdpMessage(method: string, params: any) {
    if (method === 'Runtime.executionContextCreated') {
      this.logger.debug(
        `[ContextElementTracker] Runtime.executionContextCreated: ${JSON.stringify(params)}`,
      );
      const ctx = params.context;

      if (ctx.auxData?.frameId && ctx.name === 'Electron Isolated Context') {
        this.contextCache.set(ctx.auxData.frameId, ctx.id);
      }
    } else if (method === 'Runtime.executionContextDestroyed') {
      // Optional: Cleanup the cache if the context is destroyed
      // This happens on page navigation or reload
      for (const [frameId, ctxId] of this.contextCache.entries()) {
        if (ctxId === params.executionContextId) {
          this.contextCache.delete(frameId);
          break;
        }
      }
    }
  }

  // =========================================================================
  // Public API
  // =========================================================================

  public async setContextSelection(active: boolean) {
    if (this.isSelectionActive === active) return;
    this.isSelectionActive = active;

    if (active) {
      await this.ensureConnected();
      if (!this.throttleTimer) {
        this.throttleTimer = setInterval(
          () => this.processHitTest(),
          this.HIT_TEST_INTERVAL_MS,
        );
      }
    } else {
      this.stopThrottle();
      this.lastMousePos = null;
      await this.clearHover();
      this.checkDisconnect(); // Detach if no selections remain
    }
  }

  public async updateMousePosition(x: number, y: number) {
    if (!this.isSelectionActive) return;
    this.lastMousePos = { x, y };
    // We rely on the interval to process this
  }

  public async selectElement(elementId: string) {
    await this.ensureConnected();

    // Try to find the element in current hover
    let target: HoverState | undefined;
    if (this.currentHover?.id === elementId) {
      target = this.currentHover;
    } else {
      // Warning: Selecting a non-hovered element by ID is hard via CDP
      // unless we maintained a registry. Assuming flow is Hover->Select.
      return;
    }

    this.selectedElements.set(elementId, target);
    await this.triggerPreloadHighlight(target, 'selected', true);
  }

  public async unselectElement(elementId: string) {
    const target = this.selectedElements.get(elementId);
    if (target) {
      await this.triggerPreloadHighlight(target, 'selected', false);
      this.selectedElements.delete(elementId);
    }
    this.checkDisconnect();
  }

  public async unselectAll() {
    // We must be connected to send the "unhighlight" command
    if (this.debugger.isAttached()) {
      for (const target of this.selectedElements.values()) {
        await this.triggerPreloadHighlight(target, 'selected', false);
      }
    }
    this.selectedElements.clear();
    this.checkDisconnect();
  }

  public async getElementInformation(
    elementId: string,
  ): Promise<ContextElement | null> {
    // Only works if we have state for it
    let target = this.selectedElements.get(elementId);
    if (!target && this.currentHover?.id === elementId)
      target = this.currentHover;

    if (!target) return null;

    await this.ensureConnected();

    const result = await this.extractInfo(target);

    this.checkDisconnect(); // If we just wanted info and nothing is selected/hovered, detach.
    return result;
  }

  // =========================================================================
  // Core Logic
  // =========================================================================

  private stopThrottle() {
    if (this.throttleTimer) {
      clearInterval(this.throttleTimer);
      this.throttleTimer = null;
    }
  }

  private async processHitTest() {
    if (!this.lastMousePos || !this.isSelectionActive) return;

    try {
      const { backendNodeId, frameId } = await this.sendCommand(
        'DOM.getNodeForLocation',
        {
          x: this.lastMousePos.x,
          y: this.lastMousePos.y,
          ignorePointerEventsNone: false,
        },
      );

      if (!backendNodeId) return;

      const elementId = backendNodeId.toString();
      // FrameID might be missing if it's the Main Frame.
      // We need a reliable way to map Main Frame.
      // For now, assume empty frameId implies top-level or main.
      const actualFrameId =
        frameId || this.contextCache.keys().next().value || '';

      if (this.currentHover?.id === elementId) return;

      if (this.currentHover) {
        await this.triggerPreloadHighlight(this.currentHover, 'hover', false);
      }

      this.currentHover = {
        id: elementId,
        backendId: backendNodeId,
        frameId: actualFrameId,
      };

      await this.triggerPreloadHighlight(this.currentHover, 'hover', true);

      this.emit('hoverChanged', elementId);
    } catch {
      /* ignore hit test errors */
    }
  }

  private async clearHover() {
    if (this.currentHover && this.debugger.isAttached()) {
      await this.triggerPreloadHighlight(this.currentHover, 'hover', false);
    }
    this.currentHover = null;
    this.emit('hoverChanged', null);
  }

  /**
   * The Critical Bridge:
   * Calls the function defined in the Preload Script (Isolated World).
   */
  private async triggerPreloadHighlight(
    state: HoverState,
    type: 'hover' | 'selected',
    active: boolean,
  ) {
    const contextId = this.contextCache.get(state.frameId);

    if (!contextId) {
      // Context not found yet (maybe frame hasn't reported it, or name changed)
      return;
    }

    try {
      const { object } = await this.sendCommand('DOM.resolveNode', {
        backendNodeId: state.backendId,
        executionContextId: contextId,
      });

      await this.sendCommand('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `function(type, active) {
                 if (window.__CTX_SELECTION_UPDATE__) {
                    window.__CTX_SELECTION_UPDATE__(this, type, active);
                 }
            }`,
        arguments: [{ value: type }, { value: active }],
      });
    } catch {
      /* ignore */
    }
  }

  private async extractInfo(state: HoverState): Promise<ContextElement | null> {
    try {
      const contextId = this.contextCache.get(state.frameId);

      if (!contextId) {
        return null;
      }

      const { object } = await this.sendCommand('DOM.resolveNode', {
        backendNodeId: state.backendId,
        executionContextId: contextId,
      });

      // We use returnByValue: true to get the full JSON back over the bridge
      const result = await this.sendCommand('Runtime.callFunctionOn', {
        objectId: object.objectId,
        // We pass 'this' (the element) implicitly, and 'state.id' as the first argument
        functionDeclaration: `function(id) {
            if (window.__CTX_EXTRACT_INFO__) {
                return window.__CTX_EXTRACT_INFO__(this, id);
            }
            return null;
        }`,
        arguments: [{ value: state.id }],
        returnByValue: true, // Serialize the result back to Node.js
      });

      if (result.result?.value) {
        return result.result.value as ContextElement;
      } else {
        return null;
      }
    } catch (error) {
      console.error('Failed to extract element info:', error);
      return null;
    }
  }
}
