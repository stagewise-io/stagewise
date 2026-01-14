import {
  type MessagePortMain,
  type NativeImage,
  WebContentsView,
  shell,
  nativeTheme,
} from 'electron';
import type { Protocol } from 'devtools-protocol';
import { getHotkeyDefinitionForEvent } from '@shared/hotkeys';
import type { BaseWindow, Input } from 'electron';
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
import type { ColorScheme } from '@shared/karton-contracts/ui';
import type { SelectedElement } from '@shared/selected-elements';
import { SelectedElementTracker } from './selected-element-tracker';
import { electronInputToDomKeyboardEvent } from '@/utils/electron-input-to-dom-keyboard-event';
import { fileURLToPath } from 'node:url';
import { getBackgroundColor } from '@/shared/theme-colors';
import {
  PageTransition,
  PageTransitionQualifier,
  makeQualifiedTransition,
} from '@shared/karton-contracts/pages-api/types';
import type { HistoryService } from '../history';
import type { FaviconService } from '../favicon';
import { canBrowserHandleUrl } from './protocol-utils';
import { ContextMenuWebContent } from './utils/context-menu-web-content';
import {
  type NavigationTarget,
  type SearchUtilsConfig,
  createSearchUtils,
} from './utils/search-utils';
import { TabErrorHandler, type SubframeError } from './tab-error-handler';
export type { SubframeError } from './tab-error-handler';
import { TabPermissionHandler } from './tab-permission-handler';
import { SessionPermissionRegistry } from './tab-permission-handler/session-registry';
import type { PermissionRequest } from '@shared/karton-contracts/ui';

export interface TabState {
  title: string;
  url: string;
  faviconUrls: string[];
  isLoading: boolean;
  isResponsive: boolean;
  isPlayingAudio: boolean;
  isMuted: boolean;
  colorScheme: ColorScheme;
  error: {
    code: number;
    message?: string;
    /** The original URL that failed to load (for reload behavior) */
    originalFailedUrl?: string;
    /** Whether an error page is currently displayed */
    isErrorPageDisplayed?: boolean;
  } | null;
  /** Subframe errors that occurred on the current page */
  subframeErrors: SubframeError[];
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
  isSearchBarActive: boolean; // Whether the search bar UI is active for this tab
  zoomPercentage: number; // Page zoom level as percentage (100 = default)
  lastFocusedAt: number; // Timestamp (Date.now()) of when this tab was last focused
  handle: string; // Human-readable handle for LLM addressing (e.g., t_1, t_2)
  consoleLogCount: number; // Total number of console logs captured since page load
  consoleErrorCount: number; // Number of error-level console logs
  permissionRequests: PermissionRequest[]; // Pending permission requests for this tab
}

/**
 * Console log levels from the CDP Runtime.consoleAPICalled event.
 * Extracted from the official devtools-protocol types.
 */
export type ConsoleLogLevel = Protocol.Runtime.ConsoleAPICalledEvent['type'];

/**
 * Represents a single console log entry captured from the page.
 */
export interface ConsoleLogEntry {
  /** Timestamp when the log was captured (Date.now()) */
  timestamp: number;
  /** The log level (log, warn, error, etc.) */
  level: ConsoleLogLevel;
  /** The stringified log message/arguments */
  message: string;
  /** The URL of the page when the log was captured */
  pageUrl: string;
  /** Stack trace if available (for errors) */
  stackTrace?: string;
}

/**
 * Options for filtering console logs.
 */
export interface GetConsoleLogsOptions {
  /** Filter logs containing this string (case-insensitive) */
  filter?: string;
  /** Maximum number of logs to return (most recent first) */
  limit?: number;
  /** Filter by log level(s) */
  levels?: ConsoleLogLevel[];
}

export interface TabControllerEventMap {
  stateUpdated: [state: Partial<TabState>];
  movePanelToForeground: [panel: 'stagewise-ui' | 'tab-content'];
  handleKeyDown: [keyDownEvent: SerializableKeyboardEvent];
  elementHovered: [element: SelectedElement | null];
  elementSelected: [element: SelectedElement];
  elementScreenshotCaptured: [
    screenshot: { elementId: string; dataUrl: string },
  ];
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
  // Static handle allocation state (shared across all instances)
  private static nextHandleNumber = 1;
  private static activeHandles = new Set<string>();
  private static retiredHandles: { handle: string; retiredAt: number }[] = [];
  private static generationCounter = 0;
  private static readonly MIN_REUSE_DISTANCE = 10;

  public readonly id: string;
  public readonly handle: string;
  private readonly parentWindow: BaseWindow;
  private webContentsView: WebContentsView;
  private logger: Logger;
  private historyService: HistoryService;
  private faviconService: FaviconService;
  private kartonServer: KartonServer<TabKartonContract>;
  private kartonTransport: ElectronServerTransport;
  private selectedElementTracker: SelectedElementTracker;
  // Context menu instance - stored to keep alive but not accessed directly
  private _contextMenuWebContent: ContextMenuWebContent;

  // Current state cache
  private currentState: TabState;

  // History tracking
  private lastVisitId: number | null = null;
  private pendingNavigation: {
    transition: PageTransition;
    referrerVisitId?: number;
  } | null = null;

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

  // Callback to create new tabs (sourceTabId is passed to enable inserting new tab next to source)
  private onCreateTab?: (
    target: NavigationTarget,
    setActive?: boolean,
    sourceTabId?: string,
  ) => void;

  // Search utilities configuration
  private searchUtilsConfig: SearchUtilsConfig;

  // Search state tracking
  // Note: _currentSearchRequestId is tracked but not currently used for validation
  private _currentSearchRequestId: number | null = null;
  private currentSearchText: string | null = null;

  // Console log capturing
  private consoleLogs: ConsoleLogEntry[] = [];
  private readonly MAX_CONSOLE_LOGS = 1000; // Ring buffer max size
  private isConsoleLogListenerSetup = false;
  private isRuntimeEnabled = false;

  // Error handling
  private errorHandler: TabErrorHandler | null = null;

  // Permission handling
  private permissionHandler: TabPermissionHandler | null = null;

  /**
   * Allocates a handle for a new tab.
   * Tries to reuse a retired handle if one is old enough (MIN_REUSE_DISTANCE generations),
   * otherwise creates a new handle with an incrementing number.
   */
  private static allocateHandle(): string {
    TabController.generationCounter++;

    // Find eligible retired handles (those with sufficient distance)
    const eligibleHandles = TabController.retiredHandles.filter(
      (h) =>
        TabController.generationCounter - h.retiredAt >=
        TabController.MIN_REUSE_DISTANCE,
    );

    if (eligibleHandles.length > 0) {
      // Sort by handle number to get the lowest one first (t_1 before t_2)
      eligibleHandles.sort((a, b) => {
        const numA = Number.parseInt(a.handle.split('_')[1], 10);
        const numB = Number.parseInt(b.handle.split('_')[1], 10);
        return numA - numB;
      });

      const toReuse = eligibleHandles[0];
      // Remove from retired pool
      TabController.retiredHandles = TabController.retiredHandles.filter(
        (h) => h.handle !== toReuse.handle,
      );
      // Add to active set
      TabController.activeHandles.add(toReuse.handle);
      return toReuse.handle;
    }

    // Create a new handle
    const handle = `t_${TabController.nextHandleNumber++}`;
    TabController.activeHandles.add(handle);
    return handle;
  }

  /**
   * Releases a handle back to the retired pool when a tab is destroyed.
   */
  private static releaseHandle(handle: string): void {
    TabController.activeHandles.delete(handle);
    TabController.retiredHandles.push({
      handle,
      retiredAt: TabController.generationCounter,
    });
  }

  constructor(
    id: string,
    parentWindow: BaseWindow,
    logger: Logger,
    historyService: HistoryService,
    faviconService: FaviconService,
    searchUtilsConfig: SearchUtilsConfig,
    initialUrl?: string,
    onCreateTab?: (
      target: NavigationTarget,
      setActive?: boolean,
      sourceTabId?: string,
    ) => void,
  ) {
    super();
    this.id = id;
    this.parentWindow = parentWindow;
    this.handle = TabController.allocateHandle();
    this.logger = logger;
    this.historyService = historyService;
    this.faviconService = faviconService;
    this.searchUtilsConfig = searchUtilsConfig;
    this.onCreateTab = onCreateTab;

    this.webContentsView = new WebContentsView({
      webPreferences: {
        preload: path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          'web-content-preload/index.js',
        ),
        nodeIntegrationInSubFrames: true,
        partition: 'persist:browser-content',
      },
    });
    this.webContentsView.setBorderRadius(4);
    // Set initial background color based on current system theme
    const initialBackgroundColor = getBackgroundColor(
      nativeTheme.shouldUseDarkColors,
    );
    this.webContentsView.setBackgroundColor(initialBackgroundColor);
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
    this.selectedElementTracker = new SelectedElementTracker(
      this.webContentsView.webContents,
      this.logger,
    );
    // Create search utils for this tab
    const searchUtils = createSearchUtils(this.searchUtilsConfig);

    this._contextMenuWebContent = new ContextMenuWebContent(
      this.webContentsView.webContents,
      this.parentWindow,
      {
        openInNewTab: (url: string) => {
          this.onCreateTab?.({ type: 'url', url }, true);
        },
        searchFor: (query: string, searchEngineId?: number) => {
          this.onCreateTab?.({ type: 'search', query, searchEngineId }, true);
        },
        inspectElement: (x: number, y: number) => {
          this.webContentsView.webContents.inspectElement(x, y);
        },
        searchUtils,
      },
    );

    // Track pending info collection to avoid duplicate work
    let pendingInfoCollection: NodeJS.Timeout | null = null;
    let lastHoveredElementId: string | null = null;

    this.selectedElementTracker.on('hoverChanged', (elementId) => {
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
            await this.selectedElementTracker.collectHoveredElementInfo();
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

    this.webContentsView.webContents.session.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    );

    this.currentState = {
      title: 'New tab',
      url: initialUrl || '',
      isLoading: false,
      isResponsive: true,
      isPlayingAudio: this.webContentsView.webContents.isCurrentlyAudible(),
      isMuted: this.webContentsView.webContents.audioMuted,
      colorScheme: 'system',
      error: null,
      subframeErrors: [],
      navigationHistory: {
        canGoBack: false,
        canGoForward: false,
      },
      devToolsOpen: false,
      faviconUrls: [],
      screenshot: null,
      search: null,
      isSearchBarActive: false,
      zoomPercentage: 100,
      lastFocusedAt: Date.now(),
      handle: this.handle,
      consoleLogCount: 0,
      consoleErrorCount: 0,
      permissionRequests: [],
    };

    this.setupEventListeners();
    this.startViewportTracking();
    this.startScreenshotTracking();
    this.setupScreenshotOnResize();
    this.setupConsoleLogCapture();
    this.setupErrorHandler();
    this.setupPermissionHandler();

    // Initialize zoom percentage from Electron's current zoom factor
    // This ensures we reflect any persisted zoom from previous sessions
    const initialZoom = this.getZoomPercentage();
    this.updateState({ zoomPercentage: initialZoom });

    if (initialUrl) {
      this.loadURL(initialUrl);
    }
  }

  public getViewContainer(): WebContentsView {
    return this.webContentsView;
  }

  public setBounds(bounds: Electron.Rectangle) {
    this.webContentsView.setBounds(bounds);

    // Trigger debounced screenshot capture on bounds change
    this.debouncedScreenshotCapture();
  }

  public setVisible(visible: boolean) {
    this.webContentsView.setVisible(visible);
    // Update audio state when tab becomes visible to ensure it's current
    if (visible) {
      this.updateAudioState();
    }
  }

  /**
   * Updates the background color of this tab's web-content instance.
   * This updates the WebContentsView background, which affects the entire
   * tab view including all frames and nested content.
   */
  public updateBackgroundColor(color: string) {
    if (
      this.webContentsView &&
      !this.webContentsView.webContents.isDestroyed()
    ) {
      this.webContentsView.setBackgroundColor(color);
      this.logger.debug(
        `[TabController] Updated background color for tab ${this.id} to ${color}`,
      );
    }
  }

  public loadURL(url: string, transition?: PageTransition) {
    // Default to LINK if not specified (covers programmatic navigation, external services, etc.)
    // Only use TYPED when explicitly passed from UI layer (omnibox)
    const navTransition = transition ?? PageTransition.LINK;

    // For initial page load, use START_PAGE if this is the first navigation
    const finalTransition =
      this.lastVisitId === null ? PageTransition.START_PAGE : navTransition;

    this.pendingNavigation = {
      transition: finalTransition,
      referrerVisitId: this.lastVisitId || undefined,
    };
    this.updateState({ url });
    this.webContentsView.webContents.loadURL(url);
  }

  public reload() {
    // If on error page, reload the original failed URL instead
    const reloadUrl = this.errorHandler?.getReloadUrl();
    if (reloadUrl) {
      const navHistory = this.webContentsView.webContents.navigationHistory;
      const errorPageIndex = navHistory.getActiveIndex();

      this.errorHandler?.resetErrorState();
      this.loadURL(reloadUrl, PageTransition.RELOAD);

      // Remove the error page entry from history after navigation starts.
      // We can't remove the active index, so we do it after loadURL() which
      // starts the navigation and changes the active index.
      if (errorPageIndex >= 0) {
        // Use setImmediate to ensure navigation has started and index changed
        setImmediate(() => {
          try {
            // Only remove if the index still exists and is not the current one
            const currentIndex = navHistory.getActiveIndex();
            if (
              errorPageIndex !== currentIndex &&
              errorPageIndex < navHistory.length()
            ) {
              navHistory.removeEntryAtIndex(errorPageIndex);
            }
          } catch (err) {
            this.logger.debug(
              `[TabController] Could not remove error page from history: ${err}`,
            );
          }
        });
      }
      return;
    }

    this.pendingNavigation = {
      transition: PageTransition.RELOAD,
      referrerVisitId: this.lastVisitId || undefined,
    };
    this.webContentsView.webContents.reload();
  }

  public stop() {
    this.webContentsView.webContents.stop();
  }

  /**
   * Trust a certificate for a specific origin and reload the page.
   * This adds the origin to a per-tab whitelist that allows certificate errors
   * from that origin. The whitelist is cleared when the tab is closed.
   *
   * @param origin The origin to trust (e.g., "https://example.com")
   */
  public trustCertificateAndReload(origin: string): void {
    if (!this.errorHandler) {
      this.logger.warn(
        '[TabController] Cannot trust certificate: error handler not initialized',
      );
      return;
    }

    // Get the original failed URL before trusting
    const reloadUrl = this.errorHandler.getReloadUrl();
    if (!reloadUrl) {
      this.logger.warn(
        '[TabController] Cannot trust certificate: no original URL to reload',
      );
      return;
    }

    this.errorHandler.trustCertificateOrigin(origin);
    this.logger.info(
      `[TabController] Trusted certificate for origin: ${origin}`,
    );

    // Reset error state before navigation
    this.errorHandler.resetErrorState();

    // Use location.replace() to navigate without adding to history.
    // This replaces the error page in history with the target URL.
    const escapedUrl = reloadUrl.replace(/'/g, "\\'");
    this.webContentsView.webContents.executeJavaScript(
      `location.replace('${escapedUrl}')`,
    );
  }

  public goBack() {
    const navHistory = this.webContentsView.webContents.navigationHistory;

    // Check if error handler wants to modify navigation offset (to skip error pages)
    const offset = this.errorHandler?.getNavigationOffset('back');
    if (
      offset !== null &&
      offset !== undefined &&
      navHistory.canGoToOffset(offset)
    ) {
      this.errorHandler?.resetErrorState();
      this.pendingNavigation = {
        transition: makeQualifiedTransition(
          PageTransition.LINK,
          PageTransitionQualifier.FORWARD_BACK,
        ),
        referrerVisitId: this.lastVisitId || undefined,
      };
      navHistory.goToOffset(offset);
      return;
    }

    // Standard back navigation
    if (navHistory.canGoBack()) {
      this.pendingNavigation = {
        transition: makeQualifiedTransition(
          PageTransition.LINK,
          PageTransitionQualifier.FORWARD_BACK,
        ),
        referrerVisitId: this.lastVisitId || undefined,
      };
      navHistory.goBack();
    }
  }

  public goForward() {
    const navHistory = this.webContentsView.webContents.navigationHistory;

    // Check if error handler wants to modify navigation offset (to skip error pages)
    const offset = this.errorHandler?.getNavigationOffset('forward');
    if (
      offset !== null &&
      offset !== undefined &&
      navHistory.canGoToOffset(offset)
    ) {
      this.errorHandler?.resetErrorState();
      this.pendingNavigation = {
        transition: makeQualifiedTransition(
          PageTransition.LINK,
          PageTransitionQualifier.FORWARD_BACK,
        ),
        referrerVisitId: this.lastVisitId || undefined,
      };
      navHistory.goToOffset(offset);
      return;
    }

    // Standard forward navigation
    if (navHistory.canGoForward()) {
      this.pendingNavigation = {
        transition: makeQualifiedTransition(
          PageTransition.LINK,
          PageTransitionQualifier.FORWARD_BACK,
        ),
        referrerVisitId: this.lastVisitId || undefined,
      };
      navHistory.goForward();
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

  public setZoomPercentage(percentage: number) {
    if (this.webContentsView.webContents.isDestroyed()) {
      return;
    }

    // Convert percentage to zoom factor (100% = 1.0, 200% = 2.0, etc.)
    const factor = percentage / 100;

    // Note: Chromium uses same-origin zoom policy, meaning zoom level
    // persists per domain. Our zoom change will be applied and persisted.
    this.webContentsView.webContents.setZoomFactor(factor);

    // Verify the zoom was set - read it back immediately
    const actualFactor = this.webContentsView.webContents.getZoomFactor();
    const actualPercentage = Math.round(actualFactor * 100);

    // Update state with the actual zoom percentage
    this.updateState({ zoomPercentage: actualPercentage });
  }

  public getZoomPercentage(): number {
    // Get current zoom factor and convert to percentage
    const factor = this.webContentsView.webContents.getZoomFactor();
    return Math.round(factor * 100);
  }

  public async setColorScheme(scheme: ColorScheme) {
    const wc = this.webContentsView.webContents;

    // Debugger already attached by SelectedElementTracker
    if (!wc.debugger.isAttached()) {
      this.logger.error('Debugger not attached for color scheme');
      return;
    }

    try {
      const features: { name: string; value: string }[] = [];

      if (scheme !== 'system') {
        features.push({
          name: 'prefers-color-scheme',
          value: scheme,
        });
      }

      await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
        media: '',
        features: features.length > 0 ? features : undefined,
      });

      this.updateState({ colorScheme: scheme });

      // Update webcontents background color based on the selected scheme
      let backgroundColor: string;
      if (scheme === 'system') {
        // In system mode, use the current system theme
        backgroundColor = getBackgroundColor(nativeTheme.shouldUseDarkColors);
      } else if (scheme === 'dark') {
        // Forced dark mode
        backgroundColor = getBackgroundColor(true);
      } else {
        // Forced light mode
        backgroundColor = getBackgroundColor(false);
      }
      this.updateBackgroundColor(backgroundColor);
    } catch (err) {
      this.logger.error(`Failed to set color scheme: ${err}`);
    }
  }

  public async cycleColorScheme() {
    const schemes: ColorScheme[] = ['system', 'dark', 'light'];
    const currentIndex = schemes.indexOf(this.currentState.colorScheme);
    const nextScheme = schemes[(currentIndex + 1) % schemes.length];
    await this.setColorScheme(nextScheme);
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

    this.selectedElementTracker.setContextSelection(active);
  }

  public async selectHoveredElement() {
    const info = await this.selectedElementTracker.collectHoveredElementInfo();
    if (info) {
      info.tabId = this.id;
      this.emit('elementSelected', info);

      // Capture screenshot of the element (async, non-blocking)
      this.captureElementScreenshot(
        info.boundingClientRect,
        50,
        info.isMainFrame ?? true,
        info.frameId,
      )
        .then((screenshot) => {
          if (screenshot && info.stagewiseId) {
            this.emit('elementScreenshotCaptured', {
              elementId: info.stagewiseId,
              dataUrl: screenshot,
            });
          }
        })
        .catch((err) => {
          this.logger.debug(
            `[TabController] Failed to capture element screenshot: ${err}`,
          );
        });
    }
  }

  // Maximum file size for images (5MB - Claude API limit)
  private readonly MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

  /**
   * Compresses a NativeImage to stay under the target size using JPEG with progressive quality reduction.
   * If quality reduction alone isn't enough, it will resize the image and retry.
   *
   * @param image - The NativeImage to compress
   * @param maxSizeBytes - Maximum file size in bytes (default: 5MB)
   * @returns Data URL of the compressed JPEG image
   */
  private compressImageToTargetSize(
    image: NativeImage,
    maxSizeBytes: number = this.MAX_IMAGE_SIZE_BYTES,
  ): string {
    // Try different quality levels, starting high and decreasing
    const qualities = [85, 70, 50, 30];

    for (const quality of qualities) {
      const buffer = image.toJPEG(quality);
      if (buffer.length <= maxSizeBytes)
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }

    // If still too large at lowest quality, resize to 50% and retry
    const size = image.getSize();
    if (size.width <= 100 || size.height <= 100) {
      // Image is already very small, return it at lowest quality
      const buffer = image.toJPEG(30);
      return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }

    const scaledImage = image.resize({
      width: Math.floor(size.width * 0.5),
      height: Math.floor(size.height * 0.5),
    });

    return this.compressImageToTargetSize(scaledImage, maxSizeBytes);
  }

  /**
   * Capture a screenshot of a specific element region with padding.
   * Supports both main frame and iframe elements.
   * Temporarily hides stagewise overlay elements during capture via Karton state.
   *
   * @param boundingRect - The element's bounding rect in viewport coordinates (iframe-local for iframe elements)
   * @param padding - Padding in pixels around the element (default 50)
   * @param isMainFrame - Whether the element is in the main frame (default true)
   * @param frameId - The frame ID if the element is in an iframe
   * @returns Data URL of the screenshot, or null if capture fails
   */
  public async captureElementScreenshot(
    boundingRect: { top: number; left: number; width: number; height: number },
    padding = 50,
    isMainFrame = true,
    frameId?: string,
  ): Promise<string | null> {
    const wc = this.webContentsView.webContents;

    // Don't capture if webContents is unavailable or showing internal pages
    if (
      wc.isDestroyed() ||
      wc.isLoading() ||
      this.currentState.error !== null ||
      this.currentState.url.startsWith('stagewise://internal/')
    ) {
      return null;
    }

    try {
      // Get viewport info to clip to visible area
      const viewportLayout = this.currentViewportLayout;
      const viewportSize = this.currentViewportSize;

      if (!viewportSize) {
        this.logger.debug(
          '[TabController] No viewport size available for element screenshot',
        );
        return null;
      }

      // Calculate capture rect with padding, accounting for scroll position
      const scale = viewportLayout?.scale ?? 1;

      // For iframe elements, transform coordinates to main frame
      let effectiveBoundingRect = boundingRect;
      if (!isMainFrame && frameId) {
        const iframeOffset =
          await this.selectedElementTracker.getIframeOffsetInMainFrame(frameId);
        if (iframeOffset) {
          effectiveBoundingRect = {
            top: boundingRect.top + iframeOffset.top,
            left: boundingRect.left + iframeOffset.left,
            width: boundingRect.width,
            height: boundingRect.height,
          };
          this.logger.debug(
            `[TabController] Transformed iframe element coords: offset=(${iframeOffset.top}, ${iframeOffset.left})`,
          );
        }
      }

      // Element position relative to viewport (now in main frame coords)
      let x = Math.floor(effectiveBoundingRect.left - padding);
      let y = Math.floor(effectiveBoundingRect.top - padding);
      let width = Math.ceil(effectiveBoundingRect.width + padding * 2);
      let height = Math.ceil(effectiveBoundingRect.height + padding * 2);

      // Clip to viewport bounds (can't capture outside visible area)
      if (x < 0) {
        width += x;
        x = 0;
      }
      if (y < 0) {
        height += y;
        y = 0;
      }

      // Limit to viewport dimensions
      const maxWidth = viewportSize.width;
      const maxHeight = viewportSize.height;

      if (x + width > maxWidth) {
        width = maxWidth - x;
      }
      if (y + height > maxHeight) {
        height = maxHeight - y;
      }

      // Skip if resulting rect is too small or invalid
      if (width < 10 || height < 10) {
        this.logger.debug(
          '[TabController] Element screenshot rect too small, skipping',
        );
        return null;
      }

      // Cap max dimensions to avoid huge screenshots
      // 2048px covers most MacBook/monitor effective resolutions while keeping file size reasonable
      const MAX_DIMENSION = 2048;
      if (width > MAX_DIMENSION) {
        width = MAX_DIMENSION;
      }
      if (height > MAX_DIMENSION) {
        height = MAX_DIMENSION;
      }

      // Hide overlays via Karton state before capture
      this.kartonServer.setState((draft) => {
        draft.overlaysHidden = true;
      });

      // Wait for React to update the DOM (2 frames to be safe)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Capture the specific region
      const image = await wc.capturePage({
        x: Math.round(x * scale),
        y: Math.round(y * scale),
        width: Math.round(width * scale),
        height: Math.round(height * scale),
      });

      // Restore overlays via Karton state after capture
      this.kartonServer.setState((draft) => {
        draft.overlaysHidden = false;
      });

      // Compress to JPEG and ensure size is under 5MB (Claude API limit)
      const dataUrl = this.compressImageToTargetSize(image);

      this.logger.debug(
        `[TabController] Captured element screenshot: ${width}x${height}, size: ${Math.round(dataUrl.length / 1024)}KB`,
      );

      return dataUrl;
    } catch (err) {
      // Ensure overlays are restored even on error
      try {
        this.kartonServer.setState((draft) => {
          draft.overlaysHidden = false;
        });
      } catch {
        // Ignore errors during cleanup
      }

      this.logger.debug(
        `[TabController] Error capturing element screenshot: ${err}`,
      );
      return null;
    }
  }

  public async updateContextSelection(selectedElements: SelectedElement[]) {
    await this.selectedElementTracker.updateHighlights(
      selectedElements,
      this.id,
    );
  }

  public async scrollToElement(
    backendNodeId: number,
    frameId: string,
  ): Promise<boolean> {
    return await this.selectedElementTracker.scrollToElement(
      backendNodeId,
      frameId,
    );
  }

  public async checkFrameValidity(
    frameId: string,
    expectedFrameLocation: string,
  ): Promise<boolean> {
    return await this.selectedElementTracker.checkFrameValidity(
      frameId,
      expectedFrameLocation,
    );
  }

  public async checkElementExists(
    backendNodeId: number,
    frameId: string,
  ): Promise<boolean> {
    return await this.selectedElementTracker.checkElementExists(
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
    this.selectedElementTracker.updateMousePosition(adjustedX, adjustedY);

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
    await this.selectedElementTracker.clearMousePosition();
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
      async (
        _callingClientId: string,
        panel: 'stagewise-ui' | 'tab-content',
      ) => {
        this.emit('movePanelToForeground', panel);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'handleKeyDown',
      async (_callingClientId: string, key) => {
        this.emit('handleKeyDown', key);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'handleWheelZoom',
      async (_callingClientId: string, wheelEvent) => {
        // Handle wheel zoom: deltaY > 0 means scroll down (zoom out), deltaY < 0 means scroll up (zoom in)
        const currentZoom = this.getZoomPercentage();
        let newZoom = currentZoom;

        if (wheelEvent.deltaY < 0) {
          // Scroll up - zoom in
          newZoom = Math.min(500, currentZoom + 10);
        } else if (wheelEvent.deltaY > 0) {
          // Scroll down - zoom out
          newZoom = Math.max(50, currentZoom - 10);
        }

        if (newZoom !== currentZoom) {
          this.setZoomPercentage(newZoom);
        }
      },
    );
  }

  /**
   * Call this to make the tab store the currently hovered element as a selected element.
   * This will toggle the hovered elment to be reported as one of the stored elements.
   */
  // public selectHoveredElement() {
  //   this.selectedElementTracker.selectHoveredElement();
  // }

  // public removeSelectedElement(id: string) {
  //   this.selectedElementTracker.removeSelectedElement(id);
  // }

  public destroy() {
    // Release the handle back to the pool for future reuse
    TabController.releaseHandle(this.handle);

    this.stopViewportTracking();
    this.stopScreenshotTracking();

    // Clear any pending screenshot on resize
    if (this.screenshotOnResizeTimeout) {
      clearTimeout(this.screenshotOnResizeTimeout);
      this.screenshotOnResizeTimeout = null;
    }

    // Clear any pending console log count update
    if (this.consoleLogCountUpdateTimeout) {
      clearTimeout(this.consoleLogCountUpdateTimeout);
      this.consoleLogCountUpdateTimeout = null;
    }

    // Clean up error handler
    if (this.errorHandler) {
      this.errorHandler.destroy();
      this.errorHandler = null;
    }

    // Clean up permission handler
    if (this.permissionHandler) {
      const registry = SessionPermissionRegistry.getInstance();
      if (registry) {
        registry.unregisterHandler(this.webContentsView.webContents.id);
      }
      this.permissionHandler.destroy();
      this.permissionHandler = null;
    }

    // Only detach debugger if webContents is still alive
    if (!this.webContentsView.webContents.isDestroyed()) {
      this.detachDevToolsDebugger();

      // Explicitly destroy the webContents to stop all processes
      // In Electron, WebContents must be explicitly destroyed
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

    // Intercept navigation to unsupported protocols and open externally
    wc.on('will-navigate', (event, url) => {
      if (!canBrowserHandleUrl(url)) {
        event.preventDefault();
        this.logger.debug(
          `[TabController] Intercepted navigation to external protocol: ${url}`,
        );
        shell.openExternal(url);
      }
    });

    wc.on('did-navigate', async (_event, url) => {
      this.stopSearch(); // Clear search on navigation

      // Don't update URL in UI if navigating to an error page - keep showing the failed URL
      const isErrorPage = url.includes('/error/page-load-failed');
      const displayUrl = isErrorPage
        ? (this.errorHandler?.getErrorState().originalFailedUrl ?? url)
        : url;

      this.updateState({
        url: displayUrl,
        navigationHistory: {
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
        },
      });

      // Log to history (skip error pages)
      if (!isErrorPage) {
        await this.logNavigationToHistory(url);
      }
    });

    wc.on('did-navigate-in-page', async (_event, url) => {
      this.stopSearch(); // Clear search on in-page navigation

      // Don't update URL in UI if on an error page - keep showing the failed URL
      const isErrorPage = url.includes('/error/page-load-failed');
      const displayUrl = isErrorPage
        ? (this.errorHandler?.getErrorState().originalFailedUrl ?? url)
        : url;

      this.updateState({
        url: displayUrl,
        navigationHistory: {
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
        },
      });

      // Log to history (in-page navigations like hash changes, pushState) - skip error pages
      if (!isErrorPage) {
        await this.logNavigationToHistory(url);
      }
    });

    wc.on('did-start-loading', () => {
      this.updateState({
        isLoading: true,
        error: null,
      });
      // NOTE: We no longer clear console logs on navigation.
      // The ring buffer (MAX_CONSOLE_LOGS) handles overflow automatically.
      // Logs persist across navigations so the agent can see the full history.
      // Reset Runtime enabled flag - will be re-enabled on did-stop-loading
      this.isRuntimeEnabled = false;
    });

    wc.on('did-stop-loading', () => {
      this.updateState({
        isLoading: false,
        error: null,
      });
      // Update audio state when page finishes loading
      this.updateAudioState();
      // Update zoom percentage when page finishes loading
      const currentZoom = this.getZoomPercentage();
      this.updateState({ zoomPercentage: currentZoom });
      // Capture screenshot when page finishes loading
      this.captureScreenshot().catch((err) => {
        this.logger.debug(
          `[TabController] Failed to capture screenshot on page load: ${err}`,
        );
      });
      // Re-enable CDP domains for console log capture after navigation
      this.enableCdpDomainsForConsole();
    });

    // Note: Error handling UI is managed by TabErrorHandler (setupErrorHandler)
    // This handler only clears pending navigation to prevent failed loads from being logged
    wc.on('did-fail-load', (_event, errorCode) => {
      // Ignore abort errors (user stopped navigation)
      if (errorCode !== -3) {
        // Clear pending navigation on failure - don't log failed navigations to history
        this.pendingNavigation = null;
      }
    });

    wc.on('focus', () => {
      this.updateState({ lastFocusedAt: Date.now() });
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
      // Store favicon in database for history view
      if (faviconUrls.length > 0 && this.currentState.url) {
        this.faviconService
          .storeFavicons(this.currentState.url, faviconUrls)
          .catch((err) => {
            this.logger.debug(
              `[TabController] Failed to store favicon: ${err}`,
            );
          });
      }
    });

    wc.on('audio-state-changed', () => {
      // Use isCurrentlyAudible() for reliable state checking
      this.updateAudioState();
    });

    wc.on('zoom-changed', (_event, _zoomDirection) => {
      // Update zoom state when user changes zoom (e.g., via mouse wheel)
      const currentZoom = this.getZoomPercentage();
      this.updateState({ zoomPercentage: currentZoom });
    });

    wc.on('found-in-page', (_event, result) => {
      this.handleFoundInPage(result);
    });

    wc.setWindowOpenHandler((details) => {
      // Check if the browser can handle this URL's protocol
      if (!canBrowserHandleUrl(details.url)) {
        // Open in external application (mailto:, tel:, vscode:, etc.)
        this.logger.debug(
          `[TabController] Opening URL with external handler: ${details.url}`,
        );
        shell.openExternal(details.url);
        return { action: 'deny' };
      }

      if (this.onCreateTab) {
        // Check disposition to determine if tab should be opened in background
        // disposition can be: 'default', 'foreground-tab', 'background-tab', 'new-window', etc.
        const setActive = details.disposition !== 'background-tab';
        // Pass this tab's ID as source so new tab can be inserted next to it
        this.onCreateTab({ type: 'url', url: details.url }, setActive, this.id);
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

    // Don't capture if webContents is destroyed, loading, showing an error, or internal page
    if (
      wc.isDestroyed() ||
      wc.isLoading() ||
      this.currentState.error !== null ||
      this.currentState.url.startsWith('stagewise://internal/')
    ) {
      return;
    }

    try {
      // Capture the page as a NativeImage
      const image = await wc.capturePage();
      // Compress to JPEG and ensure size is under 5MB (Claude API limit)
      const dataUrl = this.compressImageToTargetSize(image);
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

    // Check if debugger is already attached (SelectedElementTracker keeps it attached)
    // If not attached, we can't proceed - SelectedElementTracker should have attached it
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
      const hasChanged =
        !this.currentViewportSize ||
        this.currentViewportSize.width !== viewportSize.width ||
        this.currentViewportSize.height !== viewportSize.height ||
        this.currentViewportSize.top !== viewportSize.top ||
        this.currentViewportSize.left !== viewportSize.left ||
        this.currentViewportSize.scale !== viewportSize.scale ||
        this.currentViewportSize.fitScale !== viewportSize.fitScale ||
        this.currentViewportSize.appliedDeviceScaleFactor !==
          viewportSize.appliedDeviceScaleFactor;
      if (hasChanged) {
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

    this.currentSearchText = searchText;

    // Start new search - use findNext: true to initiate search and highlight first result
    const requestId = wc.findInPage(searchText, { findNext: true });
    this._currentSearchRequestId = requestId;

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

    this.currentSearchText = searchText;

    // Update search text - use findNext: true to initiate new search
    const requestId = wc.findInPage(searchText, { findNext: true });
    this._currentSearchRequestId = requestId;

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

    // Navigate to next match - use findNext: false for navigation
    wc.findInPage(this.currentSearchText, {
      findNext: false,
      forward: true,
    });
  }

  public previousResult() {
    const wc = this.webContentsView.webContents;
    if (wc.isDestroyed() || this.currentSearchText === null) return;

    // Navigate to previous match - use findNext: false for navigation
    wc.findInPage(this.currentSearchText, {
      findNext: false,
      forward: false,
    });
  }

  public stopSearch() {
    const wc = this.webContentsView.webContents;
    if (wc.isDestroyed()) return;

    wc.stopFindInPage('clearSelection');
    this._currentSearchRequestId = null;
    this.currentSearchText = null;

    this.updateState({ search: null });
  }

  private handleFoundInPage(result: Electron.Result) {
    // Ignore results if we don't have an active search
    if (!this.currentSearchText) {
      return;
    }

    // Update state with results - accept all events for current search text
    // Don't check requestId since we might get results from rapid typing
    this.updateState({
      search: {
        text: this.currentSearchText,
        resultsCount: result.matches,
        activeMatchIndex: result.activeMatchOrdinal,
      },
    });
  }

  /**
   * Executes a JavaScript expression in the console of this tab.
   * Uses the Chrome DevTools Protocol (CDP) Runtime.evaluate command.
   *
   * @param expression - The JavaScript expression to execute
   * @param options - Optional configuration
   * @param options.returnByValue - If true, returns the result serialized as JSON (default: true)
   * @returns An object with success status and either the result or an error message
   */
  public async executeConsoleScript(
    expression: string,
    options?: { returnByValue?: boolean },
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const wc = this.webContentsView.webContents;

    if (wc.isDestroyed()) {
      return { success: false, error: 'Tab is destroyed' };
    }

    if (!wc.debugger.isAttached()) {
      return { success: false, error: 'Debugger not attached' };
    }

    try {
      const evalResult = await wc.debugger.sendCommand('Runtime.evaluate', {
        expression,
        returnByValue: options?.returnByValue ?? true,
        awaitPromise: true,
        userGesture: true,
        replMode: true,
      });

      // Check for exceptions
      if (evalResult.exceptionDetails) {
        const errorText =
          evalResult.exceptionDetails.exception?.description ||
          evalResult.exceptionDetails.text ||
          'Script execution error';
        return { success: false, error: errorText };
      }

      return { success: true, result: evalResult.result?.value };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // =========================================================================
  // Error Handling
  // =========================================================================

  /**
   * Sets up the TabErrorHandler for handling page load errors and certificate errors.
   * The handler manages error page navigation, URL display, and navigation interception.
   */
  private setupErrorHandler() {
    this.errorHandler = new TabErrorHandler(
      this.id,
      this.webContentsView.webContents,
      this.logger,
      {
        onErrorStateUpdate: (errorState) => {
          if (errorState.errorCode !== null) {
            this.updateState({
              error: {
                code: errorState.errorCode,
                message: errorState.errorMessage ?? undefined,
                originalFailedUrl: errorState.originalFailedUrl ?? undefined,
                isErrorPageDisplayed: errorState.isErrorPageDisplayed,
              },
            });
          } else {
            this.updateState({ error: null });
          }
        },
        onSubframeErrorsUpdate: (errors) => {
          this.updateState({ subframeErrors: errors });
        },
        onDisplayUrlUpdate: (url) => {
          // Update the URL shown in UI to the failed URL, not the error page URL
          this.updateState({ url });
        },
        onLoadingStateUpdate: (isLoading) => {
          this.updateState({ isLoading });
        },
      },
    );
  }

  // =========================================================================
  // Permission Handling
  // =========================================================================

  /**
   * Sets up the TabPermissionHandler for handling permission requests.
   * The handler manages media, geolocation, Bluetooth, and other device permissions.
   */
  private setupPermissionHandler() {
    this.permissionHandler = new TabPermissionHandler(
      this.id,
      this.webContentsView.webContents,
      this.logger,
      {
        onPermissionRequestsUpdate: (requests) => {
          this.updateState({ permissionRequests: requests });
        },
      },
    );

    // Register with session registry for session-level handler routing
    const registry = SessionPermissionRegistry.getInstance();
    if (registry) {
      registry.registerHandler(this.permissionHandler);
    }
  }

  /**
   * Accept a permission request.
   */
  public acceptPermission(requestId: string): void {
    this.permissionHandler?.acceptRequest(requestId);
  }

  /**
   * Reject a permission request.
   */
  public rejectPermission(requestId: string): void {
    this.permissionHandler?.rejectRequest(requestId);
  }

  /**
   * Select a device for a device-selection permission request.
   */
  public selectPermissionDevice(requestId: string, deviceId: string): void {
    this.permissionHandler?.selectDevice(requestId, deviceId);
  }

  /**
   * Respond to a Bluetooth pairing request.
   */
  public respondToBluetoothPairing(
    requestId: string,
    confirmed: boolean,
    pin?: string,
  ): void {
    this.permissionHandler?.respondToPairing(requestId, confirmed, pin);
  }

  // =========================================================================
  // Console Log Capture
  // =========================================================================

  /**
   * Sets up console log capturing using CDP events.
   * This replicates Chrome DevTools behavior by listening to:
   * - Runtime.consoleAPICalled: for console.log(), console.error(), etc.
   * - Runtime.exceptionThrown: for uncaught exceptions
   * - Log.entryAdded: for browser-level logs
   * - Console.messageAdded: deprecated but catches some edge cases
   *
   * The debugger is already attached by SelectedElementTracker on construction.
   */
  private setupConsoleLogCapture() {
    const wc = this.webContentsView.webContents;

    // Listen for CDP debugger messages
    if (!this.isConsoleLogListenerSetup) {
      wc.debugger.on('message', (_event, method, params) => {
        if (method === 'Runtime.consoleAPICalled')
          this.handleConsoleAPICalled(params);
        else if (method === 'Runtime.exceptionThrown')
          this.handleExceptionThrown(params);
        else if (method === 'Log.entryAdded') this.handleLogEntry(params);
        else if (method === 'Console.messageAdded')
          this.handleConsoleMessage(params);
      });
      this.isConsoleLogListenerSetup = true;
    }

    // Enable CDP domains immediately (like DevTools does)
    this.enableCdpDomainsForConsole();
  }

  /**
   * Enables CDP domains for console log capture.
   * This is called immediately after debugger attach (like DevTools does).
   * No delays or loading checks - we want to capture everything from the start.
   */
  private async enableCdpDomainsForConsole() {
    const wc = this.webContentsView.webContents;

    if (wc.isDestroyed()) return;
    if (this.isRuntimeEnabled) return;

    // Wait briefly for debugger to be attached by SelectedElementTracker
    // (it attaches in its constructor, so this should be very quick)
    if (!wc.debugger.isAttached()) {
      // Retry once after a short delay
      setTimeout(() => this.enableCdpDomainsForConsole(), 50);
      return;
    }

    try {
      // Enable Runtime domain - captures console.log/error/etc. and exceptions
      await wc.debugger.sendCommand('Runtime.enable');

      // Enable Log domain - captures browser-level logs
      try {
        await wc.debugger.sendCommand('Log.enable');
      } catch {
        // May already be enabled
      }

      // Enable Console domain - deprecated but catches some edge cases
      try {
        await wc.debugger.sendCommand('Console.enable');
      } catch {
        // May already be enabled or not available
      }

      this.isRuntimeEnabled = true;
      this.logger.debug(
        `[TabController] CDP domains enabled for console capture on tab ${this.id}`,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('already enabled')) {
        // Already enabled, that's fine
        this.isRuntimeEnabled = true;
      } else {
        this.logger.debug(
          `[TabController] Failed to enable CDP domains: ${err}`,
        );
      }
    }
  }

  /**
   * Adds a console log entry to the ring buffer with deduplication.
   * Multiple CDP events (Runtime.consoleAPICalled, Console.messageAdded) can fire
   * for the same console message, so we deduplicate within a short time window.
   *
   * @param entry - The log entry to add
   * @returns true if the entry was added, false if it was a duplicate
   */
  private addConsoleLogEntry(entry: ConsoleLogEntry): boolean {
    // Check for duplicates in recent logs (same message and level within 50ms)
    const isDuplicate = this.consoleLogs.slice(-30).some((log) => {
      // Check if levels are equivalent ('log' and 'info' are functionally identical)
      const levelsMatch =
        log.level === entry.level ||
        (log.level === 'log' && entry.level === 'info') ||
        (log.level === 'info' && entry.level === 'log');
      if (!levelsMatch) return false;

      // Must be within 50ms time window
      if (Math.abs(log.timestamp - entry.timestamp) > 50) return false;

      // Check if messages match (first 200 chars)
      const existingMsg = log.message.trim().substring(0, 200);
      const newMsg = entry.message.trim().substring(0, 200);
      return existingMsg === newMsg;
    });

    if (isDuplicate) return false;

    // Add to ring buffer (remove oldest if at capacity)
    if (this.consoleLogs.length >= this.MAX_CONSOLE_LOGS)
      this.consoleLogs.shift();

    this.consoleLogs.push(entry);

    // Update state with new counts (debounced)
    this.scheduleConsoleLogCountUpdate();

    return true;
  }

  /**
   * Handles CDP Console.messageAdded events (deprecated but might catch different errors).
   */
  private handleConsoleMessage(params: {
    message: {
      source: string;
      level: 'log' | 'warning' | 'error' | 'debug' | 'info';
      text: string;
      url?: string;
      line?: number;
      column?: number;
    };
  }) {
    try {
      const msg = params.message;
      if (!msg) return;

      // Map Console.message level to ConsoleLogLevel
      let level: ConsoleLogLevel;
      switch (msg.level) {
        case 'error':
          level = 'error';
          break;
        case 'warning':
          level = 'warning';
          break;
        case 'info':
          level = 'info';
          break;
        case 'debug':
          level = 'debug';
          break;
        default:
          level = 'log';
      }

      const logEntry: ConsoleLogEntry = {
        timestamp: Date.now(),
        level,
        message: msg.text,
        pageUrl: msg.url || this.currentState.url,
        stackTrace: msg.line
          ? `  at ${msg.url}:${msg.line}:${msg.column || 0}`
          : undefined,
      };

      // Add with deduplication
      this.addConsoleLogEntry(logEntry);
    } catch (err) {
      this.logger.debug(
        `[TabController] Error parsing console message: ${err}`,
      );
    }
  }

  /**
   * Handles CDP Log.entryAdded events and stores them as logs.
   * These include errors that appear in the console but aren't from console.* calls.
   */
  private handleLogEntry(params: {
    entry: {
      source: string;
      level: 'verbose' | 'info' | 'warning' | 'error';
      text: string;
      timestamp: number;
      url?: string;
      lineNumber?: number;
      stackTrace?: {
        callFrames: Array<{
          functionName: string;
          scriptId: string;
          url: string;
          lineNumber: number;
          columnNumber: number;
        }>;
      };
    };
  }) {
    try {
      const entry = params.entry;
      if (!entry) return;

      // Map Log.entry level to ConsoleLogLevel
      let level: ConsoleLogLevel;
      switch (entry.level) {
        case 'error':
          level = 'error';
          break;
        case 'warning':
          level = 'warning';
          break;
        case 'info':
          level = 'info';
          break;
        case 'verbose':
          level = 'debug';
          break;
        default:
          level = 'log';
      }

      // Format stack trace if available
      let stackTrace: string | undefined;
      if (entry.stackTrace?.callFrames.length) {
        stackTrace = entry.stackTrace.callFrames
          .map(
            (frame) =>
              `  at ${frame.functionName || '(anonymous)'} (${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1})`,
          )
          .join('\n');
      }

      const logEntry: ConsoleLogEntry = {
        timestamp: entry.timestamp || Date.now(),
        level,
        message: entry.text,
        pageUrl: entry.url || this.currentState.url,
        stackTrace,
      };

      // Add with deduplication
      this.addConsoleLogEntry(logEntry);
    } catch (err) {
      this.logger.debug(`[TabController] Error parsing log entry: ${err}`);
    }
  }

  /**
   * Handles CDP Runtime.exceptionThrown events and stores them as error logs.
   * These are uncaught exceptions that bubble up to the console.
   */
  private handleExceptionThrown(params: {
    timestamp: number;
    exceptionDetails: {
      exceptionId: number;
      text: string;
      lineNumber: number;
      columnNumber: number;
      scriptId?: string;
      url?: string;
      stackTrace?: {
        callFrames: Array<{
          functionName: string;
          scriptId: string;
          url: string;
          lineNumber: number;
          columnNumber: number;
        }>;
      };
      exception?: {
        type: string;
        subtype?: string;
        className?: string;
        description?: string;
        value?: unknown;
      };
      executionContextId: number;
    };
  }) {
    try {
      const details = params.exceptionDetails;

      // Build message from exception details
      let message = details.text || 'Uncaught exception';
      if (details.exception?.description) {
        message = details.exception.description;
      } else if (details.exception?.value !== undefined) {
        message = `${details.text}: ${JSON.stringify(details.exception.value)}`;
      }

      // Format stack trace if available
      let stackTrace: string | undefined;
      if (details.stackTrace?.callFrames.length) {
        stackTrace = details.stackTrace.callFrames
          .map(
            (frame) =>
              `  at ${frame.functionName || '(anonymous)'} (${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1})`,
          )
          .join('\n');
      }

      const logEntry: ConsoleLogEntry = {
        timestamp: params.timestamp || Date.now(),
        level: 'error',
        message,
        pageUrl: this.currentState.url,
        stackTrace,
      };

      // Add with deduplication
      this.addConsoleLogEntry(logEntry);
    } catch (err) {
      this.logger.debug(`[TabController] Error parsing exception: ${err}`);
    }
  }

  /**
   * Handles CDP Runtime.consoleAPICalled events and stores them in the ring buffer.
   */
  private handleConsoleAPICalled(params: {
    type: ConsoleLogLevel;
    args: Array<{
      type: string;
      value?: unknown;
      description?: string;
      preview?: {
        description?: string;
        properties?: Array<{ name: string; value?: string }>;
      };
    }>;
    executionContextId: number;
    timestamp: number;
    stackTrace?: {
      callFrames: Array<{
        functionName: string;
        url: string;
        lineNumber: number;
        columnNumber: number;
      }>;
    };
  }) {
    try {
      // Convert args to a readable string
      const messageParts: string[] = [];
      for (const arg of params.args) {
        if (arg.value !== undefined) {
          // Primitive values
          if (typeof arg.value === 'string') messageParts.push(arg.value);
          else messageParts.push(JSON.stringify(arg.value));
        } else if (arg.description) {
          // Objects, functions, etc.
          messageParts.push(arg.description);
        } else if (arg.preview?.description) {
          // Preview for complex objects
          messageParts.push(arg.preview.description);
        } else if (arg.type) {
          // Fallback to type
          messageParts.push(`[${arg.type}]`);
        }
      }

      const message = messageParts.join(' ');

      // Format stack trace if available
      let stackTrace: string | undefined;
      if (params.stackTrace?.callFrames.length) {
        stackTrace = params.stackTrace.callFrames
          .map(
            (frame) =>
              `  at ${frame.functionName || '(anonymous)'} (${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1})`,
          )
          .join('\n');
      }

      const logEntry: ConsoleLogEntry = {
        timestamp: params.timestamp || Date.now(),
        level: params.type,
        message,
        pageUrl: this.currentState.url,
        stackTrace,
      };

      // Add with deduplication
      this.addConsoleLogEntry(logEntry);
    } catch (err) {
      // Don't let console log parsing errors break anything
      this.logger.debug(`[TabController] Error parsing console log: ${err}`);
    }
  }

  // Debounce timer for console log count updates
  private consoleLogCountUpdateTimeout: NodeJS.Timeout | null = null;
  private readonly CONSOLE_LOG_COUNT_UPDATE_DEBOUNCE_MS = 100;

  /**
   * Schedules a debounced update of console log counts in state.
   * This prevents excessive state updates when logs come in rapidly.
   */
  private scheduleConsoleLogCountUpdate() {
    if (this.consoleLogCountUpdateTimeout) {
      return; // Already scheduled
    }

    this.consoleLogCountUpdateTimeout = setTimeout(() => {
      this.consoleLogCountUpdateTimeout = null;
      const errorCount = this.consoleLogs.filter(
        (log) => log.level === 'error',
      ).length;
      this.updateState({
        consoleLogCount: this.consoleLogs.length,
        consoleErrorCount: errorCount,
      });
    }, this.CONSOLE_LOG_COUNT_UPDATE_DEBOUNCE_MS);
  }

  /**
   * Clears all stored console logs.
   * Called on page navigation to start fresh.
   */
  public clearConsoleLogs() {
    this.consoleLogs = [];

    // Clear any pending count update
    if (this.consoleLogCountUpdateTimeout) {
      clearTimeout(this.consoleLogCountUpdateTimeout);
      this.consoleLogCountUpdateTimeout = null;
    }

    // Reset counts in state
    this.updateState({
      consoleLogCount: 0,
      consoleErrorCount: 0,
    });

    this.logger.debug(
      `[TabController] Cleared console logs for tab ${this.id}`,
    );
  }

  /**
   * Gets console logs with optional filtering and limiting.
   *
   * @param options - Filter and limit options
   * @returns Array of console log entries (most recent first)
   */
  public getConsoleLogs(options?: GetConsoleLogsOptions): ConsoleLogEntry[] {
    let logs = [...this.consoleLogs];

    // Filter by level if specified
    if (options?.levels && options.levels.length > 0) {
      const levelSet = new Set(options.levels);
      logs = logs.filter((log) => levelSet.has(log.level));
    }

    // Filter by search string if specified (case-insensitive)
    if (options?.filter) {
      const filterLower = options.filter.toLowerCase();
      logs = logs.filter(
        (log) =>
          log.message.toLowerCase().includes(filterLower) ||
          (log.stackTrace?.toLowerCase().includes(filterLower) ?? false),
      );
    }

    // Reverse to get most recent first
    logs.reverse();

    // Apply limit if specified
    if (options?.limit && options.limit > 0) {
      logs = logs.slice(0, options.limit);
    }

    return logs;
  }

  /**
   * Gets the total count of stored console logs (before filtering).
   */
  public getConsoleLogCount(): number {
    return this.consoleLogs.length;
  }

  /*
   * Logs a navigation to history service.
   * Uses pendingNavigation if set, otherwise defaults to LINK transition.
   * Skips logging for internal stagewise:// URLs.
   */
  private async logNavigationToHistory(url: string): Promise<void> {
    // Skip internal URLs
    if (url.startsWith('stagewise://')) {
      this.pendingNavigation = null;
      return;
    }

    // Determine transition type - use pendingNavigation if set, otherwise default to LINK
    const transition =
      this.pendingNavigation?.transition ?? PageTransition.LINK;
    const referrerVisitId = this.pendingNavigation?.referrerVisitId;

    try {
      const title = this.currentState.title || '';
      const { visitId } = await this.historyService.addVisit({
        url,
        title,
        transition,
        referrerVisitId,
        isLocal: true,
      });
      this.lastVisitId = visitId;
    } catch (err) {
      this.logger.error(
        `[TabController] Failed to log navigation to history: ${err}`,
      );
    } finally {
      // Clear pending navigation after logging (or if skipped)
      this.pendingNavigation = null;
    }
  }
}
