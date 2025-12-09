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
import { randomUUID } from 'node:crypto';
import {
  createKartonServer,
  ElectronServerTransport,
  type KartonServer,
} from '@stagewise/karton/server';
import {
  defaultState,
  type TabKartonContract,
} from '@shared/karton-contracts/web-contents-preload';
import type { SelectedElement } from '@shared/karton-contracts/ui/metadata';
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
  elementHovered: [element: SelectedElement | null];
  elementSelected: [element: SelectedElement];
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

  public async updateContextSelection(selectedElements: SelectedElement[]) {
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

  // Cache for Isolated World IDs: Map<FrameId, ExecutionContextId>
  private contextCache: Map<string, number> = new Map();

  // Cache for Frame Information: Map<FrameId, FrameInfo>
  private frameCache: Map<
    string,
    { url: string; title: string | null; isMainFrame: boolean }
  > = new Map();
  private mainFrameId: string | null = null;

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

      // Initialize frame information by getting the frame tree
      try {
        const frameTree = await this.sendCommand('Page.getFrameTree');
        this.initializeFrameTree(frameTree.frameTree);
      } catch (err) {
        this.logger.debug(
          `[ContextElementTracker] Failed to get initial frame tree: ${err}`,
        );
      }

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
    const isNeeded = this.isSelectionActive;

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
    this.frameCache.clear();
    this.mainFrameId = null;
    this.stopThrottle();
  }

  /**
   * Recursively initialize frame tree information.
   */
  private initializeFrameTree(frameTree: {
    frame: { id: string; url: string; name?: string; parentId?: string };
    childFrames?: Array<{
      frame: {
        id: string;
        url: string;
        name?: string;
        parentId?: string;
      };
      childFrames?: any[];
    }>;
  }) {
    const frame = frameTree.frame;
    const isMainFrame = frame.parentId === undefined;

    if (isMainFrame) {
      this.mainFrameId = frame.id;
    }

    // Note: frame.name is the frame's name attribute, not the document title
    // The document title will come from Page.frameTitleUpdated events
    // Preserve existing title if frame was already cached
    const existing = this.frameCache.get(frame.id);
    this.frameCache.set(frame.id, {
      url: frame.url || '',
      title: existing?.title || null,
      isMainFrame,
    });

    // Recursively process child frames
    if (frameTree.childFrames) {
      for (const childFrame of frameTree.childFrames) {
        this.initializeFrameTree(childFrame);
      }
    }
  }

  /**
   * Get frame information for a given frameId.
   * Optionally tries to fetch the title directly from the frame's document if not cached.
   */
  private async getFrameInfo(
    frameId: string,
    tryFetchTitle = false,
  ): Promise<{
    url: string;
    title: string | null;
    isMainFrame: boolean;
  }> {
    const cached = this.frameCache.get(frameId);
    if (cached) {
      // If we have a cached title, return it
      if (cached.title) {
        return cached;
      }
      // If title is missing and we should try to fetch it, attempt to get it from the document
      if (tryFetchTitle) {
        const title = await this.fetchFrameTitle(frameId);
        if (title) {
          // Update cache with the fetched title
          this.frameCache.set(frameId, {
            ...cached,
            title,
          });
          return {
            ...cached,
            title,
          };
        }
      }
      return cached;
    }

    // Fallback: assume it's the main frame if we don't have info
    const isMainFrame =
      frameId === this.mainFrameId || this.mainFrameId === null;
    return {
      url: '',
      title: null,
      isMainFrame,
    };
  }

  /**
   * Try to fetch the frame's document title directly using CDP.
   */
  private async fetchFrameTitle(frameId: string): Promise<string | null> {
    try {
      const contextId = this.contextCache.get(frameId);
      if (!contextId) {
        return null;
      }

      // Evaluate document.title in the frame's context
      const result = await this.sendCommand('Runtime.evaluate', {
        expression: 'document.title',
        contextId,
        returnByValue: true,
      });

      if (result.result?.value && typeof result.result.value === 'string') {
        return result.result.value || null;
      }
    } catch (error) {
      // Silently fail - title might not be accessible (cross-origin, etc.)
      this.logger.debug(
        `[ContextElementTracker] Failed to fetch frame title for ${frameId}: ${error}`,
      );
    }
    return null;
  }

  private sendCommand(method: string, params: any = {}): Promise<any> {
    if (!this.debugger.isAttached())
      return Promise.reject(new Error('Debugger detached'));
    return this.debugger.sendCommand(method, params);
  }

  /**
   * Listens for execution context creation to map Frames to their Isolated Worlds.
   * Also tracks frame information (URL, title, isMainFrame).
   */
  private handleCdpMessage(method: string, params: any) {
    if (method === 'Runtime.executionContextCreated') {
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
    } else if (method === 'Page.frameNavigated') {
      // Track frame information when frames navigate
      const frame = params.frame;
      if (frame?.id) {
        const isMainFrame = frame.parentId === undefined;
        if (isMainFrame) {
          this.mainFrameId = frame.id;
        }
        // Note: frame.name is the frame's name attribute, not the document title
        // The document title comes from Page.frameTitleUpdated events
        const existing = this.frameCache.get(frame.id);
        this.frameCache.set(frame.id, {
          url: frame.url || '',
          title: existing?.title || null, // Preserve existing title if available
          isMainFrame,
        });
      }
    } else if (method === 'Page.frameAttached') {
      // Track when frames are attached (for iframes)
      const frameId = params.frameId;
      const parentFrameId = params.parentFrameId;
      if (frameId && parentFrameId !== undefined) {
        // This is a subframe (iframe)
        this.frameCache.set(frameId, {
          url: '',
          title: null,
          isMainFrame: false,
        });
      }
    } else if (method === 'Page.frameDetached') {
      // Clean up frame information when frames are detached
      const frameId = params.frameId;
      if (frameId) {
        this.frameCache.delete(frameId);
        if (this.mainFrameId === frameId) {
          this.mainFrameId = null;
        }
      }
    } else if (method === 'Page.frameTitleUpdated') {
      // Update frame title when it changes
      const frameId = params.frameId;
      const title = params.title || null;
      if (frameId) {
        const existing = this.frameCache.get(frameId);
        if (existing) {
          // Update existing frame entry
          this.frameCache.set(frameId, {
            ...existing,
            title,
          });
        } else {
          // Create frame entry if it doesn't exist yet (title update can come before frameNavigated)
          const isMainFrame = frameId === this.mainFrameId;
          this.frameCache.set(frameId, {
            url: '',
            title,
            isMainFrame,
          });
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

  public async clearMousePosition() {
    // Clear the hover highlight and stop hit testing
    await this.clearHover();
  }

  public currentlyHoveredElementId(): string | null {
    return this.currentHover?.id ?? null;
  }

  public async collectHoveredElementInfo(): Promise<SelectedElement | null> {
    if (!this.currentHover) return null;
    await this.ensureConnected();
    const contextElement = await this.extractInfo(this.currentHover);

    if (!contextElement) return null;

    // Get frame information, trying to fetch title if not cached
    const frameInfo = await this.getFrameInfo(this.currentHover.frameId, true);

    // Map ContextElement to SelectedElement
    // Note: This mapping needs to align with SelectedElement schema.
    // Assuming ContextElement has most fields, but we need to add frameId, backendNodeId, tabId.
    // The caller (TabController) knows the tabId. We know frameId and backendNodeId here.

    const selectedElement = {
      ...contextElement,
      frameId: this.currentHover.frameId,
      isMainFrame: frameInfo.isMainFrame,
      frameLocation: frameInfo.url,
      frameTitle: frameInfo.title,
      backendNodeId: this.currentHover.backendId,
      // tabId will be filled by TabController
      stagewiseId: contextElement.id || randomUUID(), // fallback if id missing
      nodeType: contextElement.tagName, // simplistic mapping, ContextElement uses tagName
      // attributes, ownProperties, boundingClientRect match?
      // Check ContextElement definition:
      // attributes: Record<string, string> -> SelectedElement is slightly richer
      // ownProperties: Record<string, unknown> -> OK
      // boundingClientRect: { top, left, width, height } -> OK
    } as unknown as SelectedElement;

    // We need to return a structure that satisfies SelectedElement as much as possible,
    // but strict type matching might require a converter function.
    // For now we assume the shapes are compatible enough or we cast.
    // Ideally we update extractInfo to return SelectedElement directly, but it relies on Preload script.

    return selectedElement;
  }

  // Re-adding a tracker for *currently highlighted* items to enable diffing
  private currentlyHighlighted: Set<string> = new Set();

  public async updateHighlights(
    elements: SelectedElement[],
    currentTabId: string,
  ) {
    const hasItemsToHighlight = elements.some(
      (el) => el.tabId === currentTabId,
    );
    const hasItemsToUnhighlight = this.currentlyHighlighted.size > 0;

    if (!hasItemsToHighlight && !hasItemsToUnhighlight) return;

    await this.ensureConnected();

    const nextHighlighted = new Set<string>();

    // Highlight new ones
    for (const el of elements) {
      if (el.tabId !== currentTabId) continue;

      const key = `${el.frameId}:${el.backendNodeId}`;
      nextHighlighted.add(key);

      if (!this.currentlyHighlighted.has(key)) {
        const hoverState: HoverState = {
          id: String(el.backendNodeId),
          backendId: el.backendNodeId,
          frameId: el.frameId,
        };
        await this.triggerPreloadHighlight(hoverState, 'selected', true);
      }
    }

    // Unhighlight removed ones
    // We need to store enough info to unhighlight (frameId, backendId).
    // The key `${frameId}:${backendNodeId}` helps.
    for (const key of this.currentlyHighlighted) {
      if (!nextHighlighted.has(key)) {
        const [frameId, backendIdStr] = key.split(':');
        const backendId = Number.parseInt(backendIdStr, 10);
        const hoverState: HoverState = {
          id: backendIdStr,
          backendId: backendId,
          frameId: frameId,
        };
        await this.triggerPreloadHighlight(hoverState, 'selected', false);
      }
    }

    this.currentlyHighlighted = nextHighlighted;
    this.checkDisconnect();
  }

  public async getElementInformation(): Promise<ContextElement | null> {
    // This method was used to get info for an ID.
    // Now we expect info to be in the global store.
    // But if we need to fetch it fresh:
    // We need to know frameId and backendNodeId to resolve it.
    // If we don't have it, we can't easily fetch it without searching.
    // Assuming this method might be deprecated or we implement it if we have the info.
    // The original implementation used `selectedElements` map to find the target.
    // If we removed that map, we can't look it up unless we pass frameId/backendId.
    return null;
  }

  public async scrollToElement(
    backendNodeId: number,
    frameId: string,
  ): Promise<boolean> {
    await this.ensureConnected();
    try {
      const contextId = this.contextCache.get(frameId);
      if (!contextId) {
        this.logger.debug(
          `[ContextElementTracker] No context found for frameId: ${frameId}`,
        );
        return false;
      }

      const { object } = await this.sendCommand('DOM.resolveNode', {
        backendNodeId,
        executionContextId: contextId,
      });

      // Call scrollIntoView on the element using Runtime.callFunctionOn
      await this.sendCommand('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `function() {
          if (this.scrollIntoView) {
            this.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          }
        }`,
        returnByValue: false,
      });

      return true;
    } catch (error) {
      this.logger.error(
        `[ContextElementTracker] Failed to scroll to element: ${error}`,
      );
      return false;
    }
  }

  public async checkFrameValidity(
    frameId: string,
    expectedFrameLocation: string,
  ): Promise<boolean> {
    await this.ensureConnected();
    try {
      // Refresh frame tree to get current frame information
      const frameTree = await this.sendCommand('Page.getFrameTree');
      this.initializeFrameTree(frameTree.frameTree);

      const frameInfo = await this.getFrameInfo(frameId, false);
      if (!frameInfo || !frameInfo.url) {
        // Frame doesn't exist or has no URL
        return false;
      }

      // Compare the frame's current URL with the expected location
      // We compare origin and pathname, ignoring hash and search params
      try {
        const currentUrl = new URL(frameInfo.url);
        const expectedUrl = new URL(expectedFrameLocation);
        return (
          currentUrl.origin === expectedUrl.origin &&
          currentUrl.pathname === expectedUrl.pathname
        );
      } catch {
        // If URL parsing fails, do a simple string comparison
        return frameInfo.url === expectedFrameLocation;
      }
    } catch (error) {
      this.logger.debug(
        `[ContextElementTracker] Failed to check frame validity: ${error}`,
      );
      return false;
    }
  }

  public async checkElementExists(
    backendNodeId: number,
    frameId: string,
  ): Promise<boolean> {
    await this.ensureConnected();
    try {
      const contextId = this.contextCache.get(frameId);
      if (!contextId) {
        // Frame context doesn't exist
        return false;
      }

      // Try to resolve the node - if it succeeds, the element exists
      await this.sendCommand('DOM.resolveNode', {
        backendNodeId,
        executionContextId: contextId,
      });

      // If we get here, the element exists
      return true;
    } catch {
      // If resolving fails, the element doesn't exist
      return false;
    }
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
      const { cssLayoutViewport } = await this.sendCommand(
        'Page.getLayoutMetrics',
      );
      const scrollX = cssLayoutViewport.pageX;
      const scrollY = cssLayoutViewport.pageY;

      const { backendNodeId, frameId } = await this.sendCommand(
        'DOM.getNodeForLocation',
        {
          x: this.lastMousePos.x + scrollX,
          y: this.lastMousePos.y + scrollY,
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
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      // If no node found at location, clear hover and stop processing this position
      // This is expected when the mouse is outside the web content bounds
      if (errorMessage.includes('No node found')) {
        if (this.currentHover) {
          await this.clearHover();
        } else {
          this.lastMousePos = null; // Clear position to stop retrying
        }
        // Don't log this as an error - it's expected when mouse is outside bounds
      } else {
        this.logger.error(`[ContextElementTracker] processHitTest error: ${e}`);
      }
    }
  }

  public async clearHover() {
    if (this.currentHover && this.debugger.isAttached()) {
      await this.triggerPreloadHighlight(this.currentHover, 'hover', false);
    }
    this.currentHover = null;
    this.lastMousePos = null; // Clear mouse position to stop hit test attempts
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
