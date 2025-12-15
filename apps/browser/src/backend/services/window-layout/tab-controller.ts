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
  isPlayingAudio: boolean;
  isMuted: boolean;
  error: {
    code: number;
    message?: string;
  } | null;
  navigationHistory: {
    canGoBack: boolean;
    canGoForward: boolean;
  };
  devToolsOpen: boolean;
  screenshot: string | null; // Data URL of the tab screenshot
  search: {
    text: string;
    resultsCount: number;
    activeMatchIndex: number;
  } | null;
}

export interface TabControllerEventMap {
  stateUpdated: [state: Partial<TabState>];
  movePanelToForeground: [panel: 'stagewise-ui' | 'tab-content'];
  handleKeyDown: [keyDownEvent: SerializableKeyboardEvent];
  elementHovered: [element: ContextElement | null];
  elementSelected: [element: ContextElement];
  tabFocused: [tabId: string];
  viewportSizeChanged: [
    size: {
      width: number;
      height: number;
      scale: number;
      top: number;
      left: number;
    },
  ];
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

  // Viewport size cache
  private currentViewportSize: {
    width: number;
    height: number;
    top: number;
    left: number;
    scale: number;
    fitScale: number;
    appliedDeviceScaleFactor: number;
  } | null = null;

  // Viewport layout cache (scroll position, scale, zoom)
  private currentViewportLayout: {
    top: number;
    left: number;
    scale: number;
    zoom: number;
  } | null = null;

  // Viewport tracking
  private viewportTrackingInterval: NodeJS.Timeout | null = null;
  private readonly VIEWPORT_TRACKING_INTERVAL_MS = 1000; // Reduced from 200ms to 1s
  private isContextSelectionActive = false;

  // Screenshot tracking
  private screenshotInterval: NodeJS.Timeout | null = null;
  private readonly SCREENSHOT_INTERVAL_MS = 15000; // 15 seconds
  private screenshotOnResizeTimeout: NodeJS.Timeout | null = null;
  private readonly SCREENSHOT_RESIZE_DEBOUNCE_MS = 200; // 200ms debounce

  // DevTools debugger tracking
  private devToolsDebugger: Electron.Debugger | null = null;
  private devToolsPlaceholderObjectId: string | null = null;
  private devToolsDeviceModeWrapperObjectId: string | null = null;

  // Callback to create new tabs
  private onCreateTab?: (url: string) => void;

  // Search state tracking
  private currentSearchRequestId: number | null = null;
  private currentSearchText: string | null = null;

  constructor(
    id: string,
    logger: Logger,
    initialUrl?: string,
    onCreateTab?: (url: string) => void,
  ) {
    super();
    this.id = id;
    this.logger = logger;
    this.onCreateTab = onCreateTab;

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
      this.webContentsView.webContents.devToolsWebContents?.addListener(
        'focus',
        () => {
          this.emit('tabFocused', this.id);
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

    // Track pending info collection to avoid duplicate work
    let pendingInfoCollection: NodeJS.Timeout | null = null;
    let lastHoveredElementId: string | null = null;

    this.contextElementTracker.on('hoverChanged', (elementId) => {
      // Clear any pending info collection
      if (pendingInfoCollection) {
        clearTimeout(pendingInfoCollection);
        pendingInfoCollection = null;
      }

      if (elementId) {
        // If it's the same element, don't re-collect info
        if (lastHoveredElementId === elementId) {
          return;
        }

        lastHoveredElementId = elementId;

        // Defer expensive info collection until mouse has settled
        // This keeps mouse movement responsive while still collecting full info
        pendingInfoCollection = setTimeout(async () => {
          pendingInfoCollection = null;
          const info =
            await this.contextElementTracker.collectHoveredElementInfo();
          if (info && lastHoveredElementId === elementId) {
            // Double-check elementId hasn't changed during async operation
            info.tabId = this.id;
            this.emit('elementHovered', info);
          }
        }, 200); // Wait 200ms after mouse stops moving
      } else {
        lastHoveredElementId = null;
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
      isPlayingAudio: this.webContentsView.webContents.isCurrentlyAudible(),
      isMuted: this.webContentsView.webContents.audioMuted,
      error: null,
      navigationHistory: {
        canGoBack: false,
        canGoForward: false,
      },
      devToolsOpen: false,
      faviconUrls: [],
      screenshot: null,
      search: null,
    };

    this.setupEventListeners();
    this.startViewportTracking();
    this.startScreenshotTracking();
    this.setupScreenshotOnResize();

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

    // Trigger debounced screenshot capture on bounds change
    this.debouncedScreenshotCapture();
  }

  public setVisible(visible: boolean) {
    this.viewContainer.setVisible(visible);
    // Update audio state when tab becomes visible to ensure it's current
    if (visible) {
      this.updateAudioState();
    }
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

  public setAudioMuted(muted: boolean) {
    this.webContentsView.webContents.setAudioMuted(muted);
    // Update state immediately to keep it in sync
    this.updateAudioState();
  }

  public toggleAudioMuted() {
    const currentMuted = this.webContentsView.webContents.audioMuted;
    this.webContentsView.webContents.setAudioMuted(!currentMuted);
    // Update state immediately to keep it in sync
    this.updateAudioState();
  }

  public focus() {
    this.webContentsView.webContents.focus();
  }

  public async setContextSelectionMode(active: boolean) {
    // TODO: Implement context selection mode logic
    // This will likely involve sending a message to the preload script
    this.isContextSelectionActive = active;

    // Ensure viewport size is fetched before enabling context selection
    if (active) {
      // Retry viewport update with exponential backoff
      let retries = 3;
      let delay = 100;
      while (retries > 0) {
        try {
          await this.updateViewportInfo();
          // Validate that we have a valid viewport size
          if (this.currentViewportSize) {
            break; // Success, exit retry loop
          }
        } catch (err) {
          this.logger.debug(
            `[TabController] Failed to update viewport info on context selection activation (${retries} retries left): ${err}`,
          );
        }
        retries--;
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        }
      }
    }

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
    // Compensate for scroll position when emitting input events
    // The coordinates are relative to the viewport, but we need to account for scroll

    const scale = this.currentViewportSize?.scale || 1;
    const adjustedX = Math.floor(x / scale);
    const adjustedY = Math.floor(y / scale);

    // TODO: In some cases the coords are not right when changing to a small device in emulation and not reloading the page. I don't know why (glenn) but we should fix this sometime. For now this takes too much time.

    this.webContentsView.webContents.sendInputEvent({
      type: 'mouseMove',
      x: adjustedX,
      y: adjustedY,
    });
    this.contextElementTracker.updateMousePosition(adjustedX, adjustedY);

    // Trigger immediate viewport update on mouse move when context selection is active
    // This ensures viewport size is up-to-date for accurate coordinate calculations
    if (this.isContextSelectionActive) {
      this.updateViewportInfo().catch((err) => {
        this.logger.debug(
          `[TabController] Failed to update viewport info on mouse move: ${err}`,
        );
      });
    }
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
    const scale = this.currentViewportSize?.scale || 1;
    const adjustedX = Math.floor(event.x / scale);
    const adjustedY = Math.floor(event.y / scale);

    const ev: Electron.MouseWheelInputEvent = {
      type: 'mouseWheel',
      x: adjustedX,
      y: adjustedY,
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
    this.stopViewportTracking();
    this.stopScreenshotTracking();

    // Clear any pending screenshot on resize
    if (this.screenshotOnResizeTimeout) {
      clearTimeout(this.screenshotOnResizeTimeout);
      this.screenshotOnResizeTimeout = null;
    }

    this.detachDevToolsDebugger();

    // Close karton server and transport
    this.kartonServer.close().catch((err) => {
      this.logger.debug(`[TabController] Error closing karton server: ${err}`);
    });

    // Explicitly destroy the webContents to stop all processes
    // In Electron, WebContents must be explicitly destroyed
    if (!this.webContentsView.webContents.isDestroyed()) {
      this.webContentsView.webContents.close({ waitForBeforeUnload: false });
    }

    this.removeAllListeners();
  }

  public getState(): TabState {
    return { ...this.currentState };
  }

  public getViewportSize(): {
    width: number;
    height: number;
    scale: number;
    fitScale: number;
    appliedDeviceScaleFactor: number;
    top: number;
    left: number;
  } | null {
    return this.currentViewportSize ? { ...this.currentViewportSize } : null;
  }

  public getViewportLayout(): {
    top: number;
    left: number;
    scale: number;
    zoom: number;
  } | null {
    return this.currentViewportLayout
      ? { ...this.currentViewportLayout }
      : null;
  }

  private updateState(updates: Partial<TabState>) {
    this.currentState = { ...this.currentState, ...updates };
    this.emit('stateUpdated', updates);
  }

  private updateAudioState() {
    const wc = this.webContentsView.webContents;
    this.updateState({
      isPlayingAudio: wc.isCurrentlyAudible(),
      isMuted: wc.audioMuted,
    });
  }

  private setupEventListeners() {
    const wc = this.webContentsView.webContents;

    wc.on('did-navigate', (_event, url) => {
      this.stopSearch(); // Clear search on navigation
      this.updateState({
        url,
        navigationHistory: {
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
        },
      });
    });

    wc.on('did-navigate-in-page', (_event, url) => {
      this.stopSearch(); // Clear search on in-page navigation
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
      // Update audio state when page finishes loading
      this.updateAudioState();
      // Capture screenshot when page finishes loading
      this.captureScreenshot().catch((err) => {
        this.logger.debug(
          `[TabController] Failed to capture screenshot on page load: ${err}`,
        );
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

    wc.on('focus', () => {
      this.emit('tabFocused', this.id);
    });

    wc.on('page-title-updated', (_event, title) => {
      this.updateState({ title });
    });

    wc.on('devtools-closed', async () => {
      this.updateState({ devToolsOpen: false });
      this.detachDevToolsDebugger();
      // Immediately update viewport size when DevTools close
      // to transition back to regular viewport tracking (full size)
      try {
        await this.updateViewportInfo();
      } catch (err) {
        this.logger.debug(
          `[TabController] Failed to update viewport size after DevTools close: ${err}`,
        );
      }
    });

    wc.on('devtools-opened', () => {
      this.updateState({ devToolsOpen: true });
      // Attach debugger after a short delay to ensure devToolsWebContents is ready
      setTimeout(() => {
        this.attachDevToolsDebugger();
      }, 100);
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

    wc.on('audio-state-changed', () => {
      // Use isCurrentlyAudible() for reliable state checking
      this.updateAudioState();
    });

    wc.on('found-in-page', (_event, result) => {
      this.handleFoundInPage(result);
    });

    wc.setWindowOpenHandler((details) => {
      if (this.onCreateTab) {
        this.onCreateTab(details.url);
      } else {
        // Fallback to external browser if no callback is provided
        shell.openExternal(details.url);
      }
      return { action: 'deny' };
    });
  }

  private startViewportTracking() {
    if (this.viewportTrackingInterval) {
      return;
    }

    // Only poll viewport when context selection is active OR DevTools are open
    this.viewportTrackingInterval = setInterval(() => {
      // Only poll if context selection is active or DevTools are open
      if (this.isContextSelectionActive || this.currentState.devToolsOpen) {
        this.updateViewportInfo().catch((err) => {
          this.logger.debug(
            `[TabController] Failed to update viewport info: ${err}`,
          );
        });
      }
    }, this.VIEWPORT_TRACKING_INTERVAL_MS);

    // Initial update
    this.updateViewportInfo().catch((err) => {
      this.logger.debug(
        `[TabController] Failed to update viewport info: ${err}`,
      );
    });
  }

  private stopViewportTracking() {
    if (this.viewportTrackingInterval) {
      clearInterval(this.viewportTrackingInterval);
      this.viewportTrackingInterval = null;
    }
  }

  private startScreenshotTracking() {
    if (this.screenshotInterval) {
      return;
    }

    // Capture screenshot every 15 seconds
    this.screenshotInterval = setInterval(() => {
      this.captureScreenshot().catch((err) => {
        this.logger.debug(
          `[TabController] Failed to capture screenshot: ${err}`,
        );
      });
    }, this.SCREENSHOT_INTERVAL_MS);

    // Initial capture
    this.captureScreenshot().catch((err) => {
      this.logger.debug(
        `[TabController] Failed to capture initial screenshot: ${err}`,
      );
    });
  }

  private stopScreenshotTracking() {
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
    }
  }

  private setupScreenshotOnResize() {
    // Listen to viewport size changes and capture screenshot with debounce
    this.on('viewportSizeChanged', () => {
      this.debouncedScreenshotCapture();
    });
  }

  private debouncedScreenshotCapture() {
    // Clear any pending screenshot capture
    if (this.screenshotOnResizeTimeout) {
      clearTimeout(this.screenshotOnResizeTimeout);
    }

    // Schedule screenshot capture after debounce period
    this.screenshotOnResizeTimeout = setTimeout(() => {
      this.screenshotOnResizeTimeout = null;
      this.captureScreenshot().catch((err) => {
        this.logger.debug(
          `[TabController] Failed to capture screenshot on resize: ${err}`,
        );
      });
    }, this.SCREENSHOT_RESIZE_DEBOUNCE_MS);
  }

  private async captureScreenshot(): Promise<void> {
    const wc = this.webContentsView.webContents;

    // Don't capture if webContents is destroyed, loading, or showing an error
    if (
      wc.isDestroyed() ||
      wc.isLoading() ||
      this.currentState.error !== null ||
      this.currentState.url === 'ui-main'
    ) {
      return;
    }

    try {
      // Capture the page as a NativeImage
      const image = await wc.capturePage();
      // Convert to data URL (PNG format)
      const dataUrl = image.toDataURL();
      // Update state with screenshot
      this.updateState({ screenshot: dataUrl });
    } catch (err) {
      // Log error but don't throw - screenshot capture failures shouldn't break the tab
      this.logger.debug(`[TabController] Error capturing screenshot: ${err}`);
    }
  }

  private async updateViewportInfo() {
    const wc = this.webContentsView.webContents;

    if (wc.isDestroyed() || wc.isLoading()) {
      return;
    }

    const isDevToolsOpen = this.currentState.devToolsOpen;

    // Get visualViewport info from main page (needed for scale and layout in all cases)
    let visualViewport: {
      scale: number;
      zoom: number;
      pageX: number;
      pageY: number;
      clientWidth: number;
      clientHeight: number;
    } | null = null;

    // Check if debugger is already attached (ContextElementTracker keeps it attached)
    // If not attached, we can't proceed - ContextElementTracker should have attached it
    if (!wc.debugger.isAttached()) {
      this.logger.debug(
        '[TabController] Debugger not attached, cannot get viewport info',
      );
      return;
    }

    try {
      const layoutMetrics = await wc.debugger.sendCommand(
        'Page.getLayoutMetrics',
      );
      visualViewport = layoutMetrics.cssVisualViewport;

      if (!visualViewport) {
        // If visual viewport is not available, we can't get accurate scale
        // This should be rare, but we'll skip emitting in this case
        return;
      }

      // Validate viewport dimensions are reasonable
      if (visualViewport.clientWidth <= 0 || visualViewport.clientHeight <= 0) {
        this.logger.debug(
          `[TabController] Invalid viewport dimensions: ${visualViewport.clientWidth}x${visualViewport.clientHeight}`,
        );
        return;
      }

      // Store viewport layout (scroll position, scale, zoom) for input event compensation
      this.currentViewportLayout = {
        top: visualViewport.pageY || 0,
        left: visualViewport.pageX || 0,
        scale: visualViewport.scale,
        zoom: visualViewport.zoom || 1,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // Handle "target closed" errors with retry logic
      if (errorMessage.includes('target closed')) {
        this.logger.debug(
          `[TabController] Target closed while getting visualViewport, will retry: ${err}`,
        );
        // Don't return immediately - let the retry mechanism handle it
        throw err;
      }
      // Ignore other errors - might happen if page is not ready
      this.logger.debug(`[TabController] Error getting visualViewport: ${err}`);
      return;
    }

    // Get size information - either from DevTools bounds or visualViewport
    if (isDevToolsOpen) {
      // When DevTools are open, get bounds from DevTools placeholder element
      // Scale will be retrieved from DevTools device mode model
      await this.updateViewportSizeFromDevTools();
    } else {
      // When DevTools are closed, use full visualViewport dimensions
      // Scale is always 1 in non-devtools mode
      const viewportSize = {
        width: visualViewport.clientWidth,
        height: visualViewport.clientHeight,
        top: 0,
        left: 0,
        scale: 1,
        fitScale: 1,
        appliedDeviceScaleFactor: 1,
      };
      // Only emit if values actually changed
      if (
        !this.currentViewportSize ||
        this.currentViewportSize.width !== viewportSize.width ||
        this.currentViewportSize.height !== viewportSize.height ||
        this.currentViewportSize.top !== viewportSize.top ||
        this.currentViewportSize.left !== viewportSize.left ||
        this.currentViewportSize.scale !== viewportSize.scale ||
        this.currentViewportSize.fitScale !== viewportSize.fitScale ||
        this.currentViewportSize.appliedDeviceScaleFactor !==
          viewportSize.appliedDeviceScaleFactor
      ) {
        this.currentViewportSize = viewportSize;
        this.emit('viewportSizeChanged', viewportSize);
      }
    }
  }

  /**
   * Get viewport size from DevTools placeholder element bounds
   * and get scale from DevTools device mode model
   */
  private async updateViewportSizeFromDevTools() {
    if (
      !this.devToolsDebugger ||
      !this.devToolsDebugger.isAttached() ||
      !this.devToolsPlaceholderObjectId
    ) {
      // DevTools debugger not ready yet, skip this update
      return;
    }

    try {
      // Get the box model which contains position and size information
      const boxModel = await this.devToolsDebugger.sendCommand(
        'DOM.getBoxModel',
        {
          objectId: this.devToolsPlaceholderObjectId,
        },
      );

      if (boxModel.model?.content) {
        // content array format: [x1, y1, x2, y2, x3, y3, x4, y4]
        // This represents the four corners of the content box
        const content = boxModel.model.content;
        if (content.length >= 8) {
          // Calculate bounds from content box corners
          const x = Math.min(content[0], content[2], content[4], content[6]);
          const y = Math.min(content[1], content[3], content[5], content[7]);
          const right = Math.max(
            content[0],
            content[2],
            content[4],
            content[6],
          );
          const bottom = Math.max(
            content[1],
            content[3],
            content[5],
            content[7],
          );
          const width = right - x;
          const height = bottom - y;

          // Get scale from DevTools device mode model
          // deviceModeWrapper.deviceModeView.model.scale()
          let scale = 1;
          let appliedDeviceScaleFactor = 1;
          let fitScale = 1;
          if (this.devToolsDeviceModeWrapperObjectId) {
            try {
              const scaleResult = await this.devToolsDebugger.sendCommand(
                'Runtime.callFunctionOn',
                {
                  objectId: this.devToolsDeviceModeWrapperObjectId,
                  functionDeclaration: `
                    function() {
                      try {
                        // this is DeviceModeWrapper, access deviceModeView property
                        if (this.deviceModeView && this.deviceModeView.model) {
                          return { scale: this.deviceModeView.model.scale(), fitScale: this.deviceModeView.model.fitScale(), appliedDeviceScaleFactor: this.deviceModeView.model.appliedDeviceScaleFactor()};
                        }
                        return { scale: 1, fitScale: 1, appliedDeviceScaleFactor: 1 };
                      } catch (e) {
                        return { scale: 1, fitScale: 1, appliedDeviceScaleFactor: 1 };
                      }
                    }
                  `,
                  returnByValue: true,
                },
              );
              if (
                scaleResult.result?.value !== undefined &&
                typeof scaleResult.result.value.scale === 'number' &&
                typeof scaleResult.result.value.appliedDeviceScaleFactor ===
                  'number' &&
                typeof scaleResult.result.value.fitScale === 'number'
              ) {
                scale = scaleResult.result.value.scale;
                appliedDeviceScaleFactor =
                  scaleResult.result.value.appliedDeviceScaleFactor;
                fitScale = scaleResult.result.value.fitScale;
              }
            } catch (err) {
              // If we can't get the scale, fall back to 1
              this.logger.debug(
                `[TabController] Failed to get scale from device mode: ${err}`,
              );
            }
          }

          // Emit viewportSizeChanged with DevTools bounds and scale from device mode
          const viewportSize = {
            width,
            height,
            top: y,
            left: x,
            scale,
            fitScale,
            appliedDeviceScaleFactor,
          };
          // Only emit if values actually changed
          if (
            !this.currentViewportSize ||
            this.currentViewportSize.width !== viewportSize.width ||
            this.currentViewportSize.height !== viewportSize.height ||
            this.currentViewportSize.top !== viewportSize.top ||
            this.currentViewportSize.left !== viewportSize.left ||
            this.currentViewportSize.scale !== viewportSize.scale ||
            this.currentViewportSize.fitScale !== viewportSize.fitScale ||
            this.currentViewportSize.appliedDeviceScaleFactor !==
              viewportSize.appliedDeviceScaleFactor
          ) {
            this.currentViewportSize = viewportSize;
            this.emit('viewportSizeChanged', viewportSize);
          }
        }
      }
    } catch (err) {
      // Element might not be available yet, or nodeId might be invalid
      // Try to re-acquire the element reference
      if (
        err instanceof Error &&
        (err.message.includes('No node') ||
          err.message.includes('not found') ||
          err.message.includes('invalid'))
      ) {
        // Try to get the element again
        await this.getDevToolsPlaceholderElement();
      }
    }
  }

  /**
   * Attach debugger to DevTools WebContents to intercept setInspectedPageBounds calls
   */
  private async attachDevToolsDebugger() {
    const wc = this.webContentsView.webContents;
    const devToolsWebContents = wc.devToolsWebContents;

    if (!devToolsWebContents || devToolsWebContents.isDestroyed()) {
      this.logger.debug(
        '[TabController] DevTools WebContents not available for debugger attachment',
      );
      return;
    }

    if (this.devToolsDebugger) {
      // Already attached
      return;
    }

    try {
      const dtDebugger = devToolsWebContents.debugger;
      if (dtDebugger.isAttached()) {
        this.logger.debug('[TabController] DevTools debugger already attached');
        return;
      }

      dtDebugger.attach('1.3');
      this.devToolsDebugger = dtDebugger;
      this.logger.debug('[TabController] DevTools debugger attached');

      // Enable Runtime and DOM domains to access the placeholder element
      await dtDebugger.sendCommand('Runtime.enable');
      await dtDebugger.sendCommand('DOM.enable');

      // Get reference to the inspected page placeholder element and device mode wrapper
      // Retry a few times since it might not be available immediately
      let attempts = 0;
      const maxAttempts = 10;
      while (
        attempts < maxAttempts &&
        (!this.devToolsPlaceholderObjectId ||
          !this.devToolsDeviceModeWrapperObjectId)
      ) {
        await this.getDevToolsPlaceholderElement();
        if (
          (!this.devToolsPlaceholderObjectId ||
            !this.devToolsDeviceModeWrapperObjectId) &&
          attempts < maxAttempts - 1
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        attempts++;
      }

      // DevTools bounds will be polled as part of the unified viewport tracking
    } catch (err) {
      this.logger.error(
        `[TabController] Failed to attach DevTools debugger: ${err}`,
      );
      this.devToolsDebugger = null;
    }
  }

  /**
   * Detach debugger from DevTools WebContents
   */
  private detachDevToolsDebugger() {
    if (!this.devToolsDebugger) {
      return;
    }

    try {
      if (this.devToolsDebugger.isAttached()) {
        this.devToolsDebugger.detach();
      }
      this.logger.debug('[TabController] DevTools debugger detached');
    } catch (err) {
      this.logger.error(
        `[TabController] Error detaching DevTools debugger: ${err}`,
      );
    } finally {
      this.devToolsDebugger = null;
      this.devToolsPlaceholderObjectId = null;
      this.devToolsDeviceModeWrapperObjectId = null;
    }
  }

  /**
   * Get reference to the inspected page placeholder element and device mode wrapper from DevTools
   */
  private async getDevToolsPlaceholderElement() {
    if (!this.devToolsDebugger || !this.devToolsDebugger.isAttached()) {
      return;
    }

    try {
      // Get the AdvancedApp instance and access both the placeholder element and device mode wrapper
      const result = await this.devToolsDebugger.sendCommand(
        'Runtime.evaluate',
        {
          expression: `
            (function() {
              try {
                const app = globalThis.Emulation?.AdvancedApp?.instance();
                if (app) {
                  const placeholder = app.inspectedPagePlaceholder?.element || null;
                  const deviceModeWrapper = app.deviceModeView || null;
                  return { placeholder, deviceModeWrapper };
                }
                return { placeholder: null, deviceModeWrapper: null };
              } catch (e) {
                return { placeholder: null, deviceModeWrapper: null };
              }
            })();
          `,
          returnByValue: false,
        },
      );

      if (result.result?.objectId) {
        // Get the properties from the returned object
        const properties = await this.devToolsDebugger.sendCommand(
          'Runtime.getProperties',
          {
            objectId: result.result.objectId,
            ownProperties: true,
          },
        );

        // Find placeholder and deviceModeWrapper properties
        for (const prop of properties.result || []) {
          if (prop.name === 'placeholder' && prop.value?.objectId) {
            this.devToolsPlaceholderObjectId = prop.value.objectId;
            this.logger.debug(
              `[TabController] DevTools placeholder element found with objectId: ${this.devToolsPlaceholderObjectId}`,
            );
          } else if (
            prop.name === 'deviceModeWrapper' &&
            prop.value?.objectId
          ) {
            this.devToolsDeviceModeWrapperObjectId = prop.value.objectId;
            this.logger.debug(
              `[TabController] DevTools device mode wrapper found with objectId: ${this.devToolsDeviceModeWrapperObjectId}`,
            );
          }
        }

        // Release the temporary result object
        await this.devToolsDebugger.sendCommand('Runtime.releaseObject', {
          objectId: result.result.objectId,
        });
      } else {
        this.logger.debug(
          '[TabController] Failed to get objectId for DevTools elements',
        );
      }
    } catch (err) {
      this.logger.error(
        `[TabController] Failed to get DevTools placeholder element: ${err}`,
      );
    }
  }

  // Search in page methods
  public startSearch(searchText: string) {
    const wc = this.webContentsView.webContents;
    if (wc.isDestroyed()) return;

    // Stop any existing search first
    if (this.currentSearchText !== null) {
      this.stopSearch();
    }

    // Start new search and immediately navigate to first result
    // We use findNext: true with forward: true to both start the search AND highlight the first match
    const requestId = wc.findInPage(searchText, {
      findNext: true,
      forward: true,
    });
    this.currentSearchRequestId = requestId;
    this.currentSearchText = searchText;

    // Update state immediately to show search is active
    this.updateState({
      search: {
        text: searchText,
        resultsCount: 0,
        activeMatchIndex: 0,
      },
    });
  }

  public updateSearchText(searchText: string) {
    const wc = this.webContentsView.webContents;
    if (wc.isDestroyed()) return;

    // Stop current search
    if (this.currentSearchText !== null) {
      wc.stopFindInPage('clearSelection');
    }

    // Start search with new text and navigate to first match
    const requestId = wc.findInPage(searchText, {
      findNext: true,
      forward: true,
    });
    this.currentSearchRequestId = requestId;
    this.currentSearchText = searchText;

    this.updateState({
      search: {
        text: searchText,
        resultsCount: 0,
        activeMatchIndex: 0,
      },
    });
  }

  public nextResult() {
    const wc = this.webContentsView.webContents;
    if (wc.isDestroyed() || this.currentSearchText === null) return;

    // Navigate to next match
    const requestId = wc.findInPage(this.currentSearchText, {
      findNext: true,
      forward: true,
    });
    this.currentSearchRequestId = requestId;
  }

  public previousResult() {
    const wc = this.webContentsView.webContents;
    if (wc.isDestroyed() || this.currentSearchText === null) return;

    // Navigate to previous match
    const requestId = wc.findInPage(this.currentSearchText, {
      findNext: true,
      forward: false,
    });
    this.currentSearchRequestId = requestId;
  }

  public stopSearch() {
    const wc = this.webContentsView.webContents;
    if (wc.isDestroyed()) return;

    wc.stopFindInPage('clearSelection');
    this.currentSearchRequestId = null;
    this.currentSearchText = null;

    this.updateState({ search: null });
  }

  private handleFoundInPage(result: Electron.Result) {
    // Ignore stale results from previous searches
    if (result.requestId !== this.currentSearchRequestId) {
      return;
    }

    // Update state with new results
    this.updateState({
      search: {
        text: this.currentSearchText!,
        resultsCount: result.matches,
        activeMatchIndex: result.activeMatchOrdinal,
      },
    });
  }
}
