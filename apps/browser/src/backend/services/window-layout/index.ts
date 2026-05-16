import { BaseWindow, app, ipcMain, nativeTheme, session } from 'electron';
import path from 'node:path';
import type { SelectedElement } from '@shared/karton-contracts/ui';
import { getHotkeyDefinitionForEvent } from '@shared/hotkeys';
import { generateTabId, resetTabIdCounter } from './tab-id';
import { getBrowserSessionId } from './browser-session';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import type { TelemetryService } from '../telemetry';
import type { HistoryService } from '../history';
import type { FaviconService } from '../favicon';
import type { PagesService } from '../pages';
import type { PreferencesService } from '../preferences';
import type { PageTransition } from '@shared/karton-contracts/pages-api/types';
import { UIController } from './ui-controller';
import {
  TabController,
  type ConsoleLogEntry,
  type GetConsoleLogsOptions,
} from './tab-controller';
import { ChatStateController } from './chat-state-controller';
import {
  type ColorScheme,
  type ConfigurablePermissionType,
  PermissionSetting,
  configurablePermissionTypes,
} from '@shared/karton-contracts/ui';
import { THEME_COLORS } from '@/shared/theme-colors';
import { DisposableService } from '../disposable';
import {
  type NavigationTarget,
  type SearchUtilsConfig,
  createSearchUtils,
} from './utils/search-utils';
import { HOME_PAGE_URL } from '@shared/internal-urls';
import { MACOS_TRAFFIC_LIGHT_X, MACOS_TRAFFIC_LIGHT_Y } from '@shared/titlebar';
import { SessionPermissionRegistry } from './tab-permission-handler/session-registry';
import { z } from 'zod';
import {
  readPersistedDataSync,
  writePersistedDataSync,
} from '@/utils/persisted-data';
import { writeBlob } from '@/utils/attachment-blobs';
import { generateAttachmentFilename } from '@shared/utils/attachment-filename';
import sharp from 'sharp';

const windowStateSchema = z.object({
  width: z.number(),
  height: z.number(),
  x: z.number().optional(),
  y: z.number().optional(),
  isMaximized: z.boolean(),
  isFullScreen: z.boolean(),
});

type WindowState = z.infer<typeof windowStateSchema>;

const tabStateSchema = z.object({
  /** Ordered list of tabs that were open */
  tabs: z.array(
    z.object({
      url: z.string(),
      agentInstanceId: z.string().nullable(),
    }),
  ),
  /** Index into `tabs` of the active tab, or -1 if none */
  activeTabIndex: z.number().int().min(-1),
  /** Last active tab per agent instance */
  lastActiveTabPerAgent: z.record(z.string(), z.string()),
  /** ID of the agent instance that was last open, for restoration on restart */
  lastOpenAgentId: z.string().nullable(),
});

type PersistedTabState = z.infer<typeof tabStateSchema>;

/**
 * Anonymous URL classification for telemetry. Returns coarse booleans
 * (`isLocal`, `isHttps`) without exposing the host or path, so events can
 * be segmented (e.g. prod-domain vs local-dev devtools usage) without
 * leaking PII. Malformed URLs and non-http(s) schemes (about:, file:,
 * internal://) all resolve to `{ isLocal: false, isHttps: false }`.
 */
function classifyTabUrl(url: string): {
  isLocal: boolean;
  isHttps: boolean;
} {
  if (!url) return { isLocal: false, isHttps: false };
  try {
    const parsed = new URL(url);
    const isLocal =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const isHttps = parsed.protocol === 'https:';
    return { isLocal, isHttps };
  } catch {
    return { isLocal: false, isHttps: false };
  }
}

export class WindowLayoutService extends DisposableService {
  private readonly logger: Logger;
  private readonly historyService: HistoryService;
  private readonly faviconService: FaviconService;
  private readonly pagesService: PagesService;
  private readonly preferencesService: PreferencesService;
  private readonly telemetryService: TelemetryService | null;

  private baseWindow: BaseWindow | null = null;
  private uiController: UIController | null = null;
  private tabs: Record<string, TabController> = {};
  private activeTabId: string | null = null;
  private chatStateController: ChatStateController | null = null;

  private currentWebContentBounds: Electron.Rectangle | null = null;
  private isWebContentInteractive = false;

  // HTML5 content fullscreen tracking
  private contentFullscreenTabId: string | null = null;

  private saveStateTimeout: NodeJS.Timeout | null = null;
  /** Tabs deferred at startup, grouped by agentInstanceId. Populated during
   *  loadTabState(); consumed and cleared lazily by ensureAgentTabsCreated(). */
  private deferredTabConfigs = new Map<
    string | null,
    { url: string; agentInstanceId: string | null }[]
  >();
  /** Tracks the last active tab per agent instance for persistence & restore. */
  private lastActiveTabPerAgent: Record<string, string> = {};
  private lastNonMaximizedBounds: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  } | null = null;

  private initialWindowState: {
    isMaximized: boolean;
    isFullScreen: boolean;
  } = { isMaximized: false, isFullScreen: false };

  private kartonConnectListener:
    | ((event: Electron.IpcMainEvent, connectionId: string) => void)
    | null = null;

  private syncThemeColorsListener:
    | ((
        event: Electron.IpcMainEvent,
        colors: {
          isDark: boolean;
          theme: {
            background: string;
          };
        },
      ) => void)
    | null = null;

  private constructor(
    logger: Logger,
    historyService: HistoryService,
    faviconService: FaviconService,
    pagesService: PagesService,
    preferencesService: PreferencesService,
    telemetryService?: TelemetryService,
  ) {
    super();
    // Reset to 1 on every cold start — mimics Chrome's per-session tab IDs.
    resetTabIdCounter();
    this.logger = logger;
    this.historyService = historyService;
    this.faviconService = faviconService;
    this.pagesService = pagesService;
    this.preferencesService = preferencesService;
    this.telemetryService = telemetryService ?? null;
  }

  public static async create(
    logger: Logger,
    historyService: HistoryService,
    faviconService: FaviconService,
    pagesService: PagesService,
    preferencesService: PreferencesService,
    telemetryService?: TelemetryService,
  ): Promise<WindowLayoutService> {
    const instance = new WindowLayoutService(
      logger,
      historyService,
      faviconService,
      pagesService,
      preferencesService,
      telemetryService,
    );
    await instance.initialize();
    return instance;
  }

  private async initialize() {
    this.logger.debug('[WindowLayoutService] Initializing service');

    // Initialize session-level permission registry before creating any tabs
    // This must happen early so tab permission handlers can register with it
    const permissionRegistry = SessionPermissionRegistry.initialize(
      this.logger,
    );
    // Connect preferences service for checking stored permission settings
    permissionRegistry.setPreferencesService(this.preferencesService);

    // Configure session-level stealth settings for the browser content session
    // so all tabs appear as a regular Chrome browser
    this.setupBrowserSessionStealth();

    this.uiController = await UIController.create(
      this.logger,
      this.telemetryService ?? undefined,
    );
    this.uiController.setCheckFrameValidityHandler(
      this.handleCheckFrameValidity.bind(this),
    );
    this.uiController.setCheckElementExistsHandler(
      this.handleCheckElementExists.bind(this),
    );
    this.uiController.setCaptureAndStoreElementScreenshotHandler(
      this.handleCaptureAndStoreElementScreenshot.bind(this),
    );

    const savedState = this.loadWindowState();
    const defaultWidth = 1200;
    const defaultHeight = 800;

    this.lastNonMaximizedBounds = {
      width: savedState?.width || defaultWidth,
      height: savedState?.height || defaultHeight,
      x: savedState?.x,
      y: savedState?.y,
    };

    // Determine initial theme based on OS setting
    const initialTheme = nativeTheme.shouldUseDarkColors
      ? THEME_COLORS.dark
      : THEME_COLORS.light;

    this.baseWindow = new BaseWindow({
      width: this.lastNonMaximizedBounds.width,
      height: this.lastNonMaximizedBounds.height,
      x: this.lastNonMaximizedBounds.x,
      y: this.lastNonMaximizedBounds.y,
      title: __APP_NAME__,
      titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'hiddenInset',
      show: false, // Don't show until UI is ready to prevent visual glitches
      // fullscreenable: false,
      ...(process.platform === 'linux'
        ? {
            icon: path.join(
              process.resourcesPath,
              `assets/icons/${__APP_RELEASE_CHANNEL__}/icon.png`,
            ),
          }
        : {}),
      trafficLightPosition: {
        x: MACOS_TRAFFIC_LIGHT_X,
        y: MACOS_TRAFFIC_LIGHT_Y,
      },
      vibrancy: 'sidebar',
      backgroundMaterial: 'mica',
      autoHideMenuBar: true,
      backgroundColor:
        process.platform === 'linux' ? initialTheme.background : undefined,
      transparent: process.platform === 'darwin', // Only make transparent on macOS since we get graphic bugs without that
      roundedCorners: true,
      closable: true,
      hasShadow: true,
      fullscreenable: true,
      resizable: true,
      maximizable: true,
      minimizable: true,
      minWidth: 350,
      minHeight: 250,
    });
    if (process.platform === 'darwin') {
      this.baseWindow.setWindowButtonVisibility(true);
    }

    // Store initial state to apply after window is shown
    this.initialWindowState = {
      isMaximized: savedState?.isMaximized ?? false,
      isFullScreen: savedState?.isFullScreen ?? false,
    };

    this.baseWindow.contentView.addChildView(this.uiController.getView());

    this.setupKartonConnectionListener();
    this.setupUIControllerListeners();
    this.setupUIViewRecreatedListener();
    this.setupPagesServiceHandlers();

    this.handleMainWindowResize();
    this.baseWindow.on('resize', () => {
      this.handleMainWindowResize();
      this.updateLastNonMaximizedBounds();
      this.scheduleWindowStateSave();
    });
    this.baseWindow.on('move', () => {
      this.updateLastNonMaximizedBounds();
      this.scheduleWindowStateSave();
    });
    this.baseWindow.on('maximize', () => this.scheduleWindowStateSave());
    this.baseWindow.on('unmaximize', () => this.scheduleWindowStateSave());
    this.baseWindow.on('enter-full-screen', () => {
      this.scheduleWindowStateSave();
      this.uiKarton.setState((draft) => {
        draft.appInfo.isFullScreen = true;
      });
    });
    this.baseWindow.on('leave-full-screen', () => {
      this.scheduleWindowStateSave();
      this.uiKarton.setState((draft) => {
        draft.appInfo.isFullScreen = false;
      });
    });
    this.baseWindow.on('close', () => {
      this.saveWindowState();
      this.saveTabState();
    });

    // Listen for OS theme changes and update window colors accordingly
    nativeTheme.on('updated', () => {
      this.applyThemeColors();
      // Update the systemTheme in state so UI can react to OS theme changes
      this.uiKarton.setState((draft) => {
        draft.systemTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
      });
    });

    app.on('second-instance', () => {
      if (this.baseWindow) {
        if (this.baseWindow.isMinimized()) this.baseWindow.restore();
        this.baseWindow.focus();
      }
      // URL handling is done in main.ts
    });

    // Initialize browser state
    this.uiKarton.setState((draft) => {
      draft.browser = {
        tabs: {},
        activeTabId: null,
        sessionId: getBrowserSessionId(),
        history: [],
        contextSelectionMode: false,
        selectedElements: [],
        hoveredElement: null,
        viewportSize: null,
        lastActiveTabPerAgent: {},
        lastOpenAgentId: null,
      };
      draft.appInfo.isFullScreen = this.baseWindow?.isFullScreen() ?? false;
      draft.appInfo.otherVersions = { ...process.versions, modules: undefined };
      draft.systemTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    });

    // Initialize ChatStateController
    this.chatStateController = new ChatStateController(
      this.uiKarton,
      this.tabs,
    );

    // Restore persisted tabs from previous session
    await this.loadTabState();

    this.logger.debug('[WindowLayoutService] Service initialized');
  }

  public get uiKarton(): KartonService {
    this.assertNotDisposed();
    if (!this.uiController) {
      throw new Error('UIController is not initialized or has been torn down');
    }
    return this.uiController.uiKarton;
  }

  protected onTeardown() {
    this.logger.debug('[WindowLayoutService] Teardown called');

    this.saveTabState();

    // Clean up session-level permission registry
    SessionPermissionRegistry.getInstance()?.destroy();

    // We no longer register procedures directly, UIController does (and should unregister if needed)
    // But UIController doesn't have a clean unregister method that works perfectly yet.
    // Assuming UIController lifecycle is tied to this service.

    if (this.kartonConnectListener) {
      ipcMain.removeListener('karton-connect', this.kartonConnectListener);
      this.kartonConnectListener = null;
    }

    if (this.syncThemeColorsListener) {
      ipcMain.removeListener('sync-theme-colors', this.syncThemeColorsListener);
      this.syncThemeColorsListener = null;
    }

    ipcMain.removeHandler('request-turnstile-token');

    app.applicationMenu = null;

    if (this.baseWindow && !this.baseWindow.isDestroyed()) {
      this.baseWindow.contentView.removeChildView(this.uiController!.getView());
      Object.values(this.tabs).forEach((tab) => {
        this.baseWindow!.contentView.removeChildView(tab.getViewContainer());
        tab.destroy();
      });
      this.baseWindow.destroy();
    }

    this.tabs = {};
    this.uiController = null;
    this.baseWindow = null;

    this.logger.debug('[WindowLayoutService] Teardown completed');
  }

  public toggleUIDevTools() {
    this.uiController?.toggleDevTools();
  }

  /**
   * Opens a URL in a new tab, always creating a new tab regardless of existing tabs.
   * Returns the tab ID for tracking purposes (e.g., to close the tab later).
   */
  public async openUrlInNewTab(url: string): Promise<string> {
    this.logger.debug(
      `[WindowLayoutService] openUrlInNewTab called with url: ${url}`,
    );
    return await this.createTab(url, true);
  }

  /**
   * Closes a tab by its ID.
   */
  public closeTab(tabId: string): void {
    this.logger.debug(`[WindowLayoutService] closeTab called for: ${tabId}`);
    void this.handleCloseTab(tabId);
  }

  /**
   * Trusts a certificate for a specific origin in a tab and reloads the page.
   * This is called from the pages API for the "Continue (UNSAFE!)" button on error pages.
   */
  public trustCertificateAndReload(tabId: string, origin: string): void {
    this.logger.debug(
      `[WindowLayoutService] trustCertificateAndReload called for tab: ${tabId}, origin: ${origin}`,
    );
    void this.handleTrustCertificateAndReload(tabId, origin);
  }

  /**
   * Opens a URL in a new tab, or navigates the active tab if it's a new/default tab.
   * A tab is considered "new" if it's the only tab and is on the default URL (ui-main).
   */
  public async openUrl(url: string): Promise<void> {
    this.logger.debug(`[WindowLayoutService] openUrl called with url: ${url}`);

    // Check if we should reuse the active tab (if it's new/default)
    const shouldReuseActiveTab =
      this.activeTab &&
      Object.keys(this.tabs).length === 1 &&
      this.activeTab.getState().url === HOME_PAGE_URL &&
      !this.activeTab.getState().navigationHistory.canGoBack;

    if (shouldReuseActiveTab) {
      this.logger.debug(
        `[WindowLayoutService] Reusing active tab for url: ${url}`,
      );
      await this.handleGoto(url);
    } else {
      this.logger.debug(
        `[WindowLayoutService] Creating new tab for url: ${url}`,
      );
      await this.handleCreateTab(url);
    }
  }

  /**
   * Configures the shared browser content session to appear as a regular
   * Chrome browser, preventing anti-bot/anti-spam detection.
   * Sets a dynamic user agent and intercepts Sec-CH-UA headers.
   */
  private setupBrowserSessionStealth() {
    const browserSession = session.fromPartition('persist:browser-content');
    const chromeVersion = process.versions.chrome;
    const chromeMajor = chromeVersion.split('.')[0];

    // Build a platform-appropriate user agent string
    let platformUA: string;
    switch (process.platform) {
      case 'darwin':
        platformUA =
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)';
        break;
      case 'win32':
        platformUA =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';
        break;
      default:
        platformUA =
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)';
        break;
    }
    const userAgent = `${platformUA} Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
    browserSession.setUserAgent(userAgent);

    this.logger.debug(
      `[WindowLayoutService] Set session user agent: ${userAgent}`,
    );

    // Build the Sec-CH-UA brand list (matches real Chrome format + Stagewise)
    const secChUaPlatform =
      process.platform === 'darwin'
        ? 'macOS'
        : process.platform === 'win32'
          ? 'Windows'
          : 'Linux';
    const secChUa = `"Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}", "Not-A.Brand";v="99"`;

    // Full version list for high-entropy client hint header
    const secChUaFullVersionList = `"Chromium";v="${chromeMajor}.0.0.0", "Google Chrome";v="${chromeMajor}.0.0.0", "Not-A.Brand";v="99.0.0.0"`;

    // Intercept outgoing requests to fix client hint headers.
    // Any Sec-CH-UA-* header that Chromium sends may contain "Electron" as a
    // brand — we replace them all with Chrome-matching values.
    browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const { requestHeaders } = details;

      // Helper: set header regardless of casing Chromium used
      const setHeader = (name: string, value: string) => {
        const lower = name.toLowerCase();
        for (const key of Object.keys(requestHeaders)) {
          if (key.toLowerCase() === lower) {
            delete requestHeaders[key];
          }
        }
        requestHeaders[name] = value;
      };

      // Replace all client-hint UA headers that could mention "Electron"
      for (const key of Object.keys(requestHeaders)) {
        const lower = key.toLowerCase();
        if (lower === 'sec-ch-ua') {
          setHeader('Sec-CH-UA', secChUa);
        } else if (lower === 'sec-ch-ua-mobile') {
          setHeader('Sec-CH-UA-Mobile', '?0');
        } else if (lower === 'sec-ch-ua-platform') {
          setHeader('Sec-CH-UA-Platform', `"${secChUaPlatform}"`);
        } else if (lower === 'sec-ch-ua-full-version-list') {
          setHeader('Sec-CH-UA-Full-Version-List', secChUaFullVersionList);
        } else if (lower === 'sec-ch-ua-arch') {
          setHeader('Sec-CH-UA-Arch', '"x86"');
        } else if (lower === 'sec-ch-ua-bitness') {
          setHeader('Sec-CH-UA-Bitness', '"64"');
        } else if (lower === 'sec-ch-ua-model') {
          setHeader('Sec-CH-UA-Model', '""');
        } else if (lower === 'sec-ch-ua-platform-version') {
          setHeader('Sec-CH-UA-Platform-Version', '""');
        }
      }

      callback({ requestHeaders });
    });

    this.logger.debug(
      '[WindowLayoutService] Configured browser session stealth headers',
    );
  }

  private setupKartonConnectionListener() {
    this.kartonConnectListener = (event, connectionId) => {
      // 'ui-main' is the Karton client ID for the main UI renderer (different from the tab URL)
      if (connectionId === 'ui-main') {
        this.uiKarton.setTransportPort(event.ports[0]);
      } else if (connectionId === 'tab') {
        this.logger.debug(
          `[WindowLayoutService] Received karton connection request for tab connection from webContentsId: ${event.sender.id}`,
        );
        // Trigger the right tab controller to store the connection in it's internal map.
        const tab = Object.values(this.tabs).find(
          (tab) => tab.webContentsId === event.sender.id,
        );
        if (tab) {
          this.logger.debug(
            `[WindowLayoutService] Adding karton connection to tab ${tab.id}...`,
          );
          tab.addKartonConnection(event.ports[0]);
        } else {
          const tabIds = Object.keys(this.tabs);
          const tabWebContentIds = Object.values(this.tabs).map(
            (t) => t.webContentsId,
          );
          this.logger.warn(
            `[WindowLayoutService] No tab found for webContentsId: ${event.sender.id}. Available tabs: ${tabIds.join(', ')}. Tab webContentsIds: ${tabWebContentIds.join(', ')}`,
          );
        }
      } else if (connectionId === 'pages-api') {
        this.logger.debug(
          `[WindowLayoutService] Received karton connection request for pages-api...`,
        );
        this.pagesService.acceptPort(event.ports[0]);
      }
    };
    ipcMain.on('karton-connect', this.kartonConnectListener);
    this.logger.debug(
      '[WindowLayoutService] Listening for karton connection requests',
    );

    // Setup theme color sync listener for dev mode HMR
    this.syncThemeColorsListener = (_event, colors) => {
      this.applyDynamicThemeColors(colors);
    };
    ipcMain.on('sync-theme-colors', this.syncThemeColorsListener);
    this.logger.debug(
      '[WindowLayoutService] Listening for theme color sync requests',
    );

    // Turnstile proxy: let console pages loaded inside webContents request
    // a Turnstile token from the renderer UI where the challenge succeeds.
    const CONSOLE_ORIGINS = new Set([
      new URL(
        process.env.STAGEWISE_CONSOLE_URL || 'https://console.stagewise.io',
      ).origin,
    ]);
    ipcMain.handle(
      'request-turnstile-token',
      async (event): Promise<string | null> => {
        try {
          const senderUrl = event.sender.getURL();
          const senderOrigin = new URL(senderUrl).origin;
          if (!CONSOLE_ORIGINS.has(senderOrigin)) {
            this.logger.warn(
              `[WindowLayoutService] Rejected turnstile proxy from origin: ${senderOrigin}`,
            );
            return null;
          }
        } catch {
          return null;
        }

        const uiWebContents = this.uiController?.getView()?.webContents;
        if (!uiWebContents || uiWebContents.isDestroyed()) {
          this.logger.warn(
            '[WindowLayoutService] UI webContents unavailable for turnstile proxy',
          );
          return null;
        }

        try {
          const token: string | null = await uiWebContents.executeJavaScript(
            'window.__solveTurnstile ? window.__solveTurnstile() : Promise.resolve(null)',
          );
          return token;
        } catch (err) {
          this.logger.error(
            `[WindowLayoutService] Turnstile proxy solve failed: ${err}`,
          );
          return null;
        }
      },
    );
    this.logger.debug(
      '[WindowLayoutService] Listening for turnstile proxy requests',
    );
  }

  private setupUIControllerListeners() {
    if (!this.uiController) return;

    this.uiController.on('uiReady', this.handleUIReady);
    this.uiController.on('createTab', this.handleCreateTab);
    this.uiController.on('closeTab', this.handleCloseTab);
    this.uiController.on('switchTab', this.handleSwitchTab);
    this.uiController.on('reorderTabs', this.handleReorderTabs);
    this.uiController.on('layoutUpdate', this.handleLayoutUpdate);
    this.uiController.on(
      'movePanelToForeground',
      this.handleMovePanelToForeground,
    );
    this.uiController.on(
      'togglePanelKeyboardFocus',
      this.handleTogglePanelKeyboardFocus,
    );
    this.uiController.on('stop', this.handleStop);
    this.uiController.on('reload', this.handleReload);
    this.uiController.on(
      'trustCertificateAndReload',
      this.handleTrustCertificateAndReload,
    );
    this.uiController.on('goto', this.handleGoto);
    this.uiController.on('goBack', this.handleGoBack);
    this.uiController.on('goForward', this.handleGoForward);
    // DevTools events are handled by DevToolAPIService
    this.uiController.on('setAudioMuted', this.handleSetAudioMuted);
    this.uiController.on('toggleAudioMuted', this.handleToggleAudioMuted);
    this.uiController.on('setColorScheme', this.handleSetColorScheme);
    this.uiController.on('cycleColorScheme', this.handleCycleColorScheme);
    this.uiController.on('setZoomPercentage', this.handleSetZoomPercentage);
    this.uiController.on('setTabAgentInstance', this.handleSetTabAgentInstance);
    this.uiController.on('setLastOpenAgentId', this.handleSetLastOpenAgentId);
    this.uiController.on(
      'setContextSelectionMode',
      this.handleSetContextSelectionMode,
    );
    this.uiController.on(
      'selectHoveredElement',
      this.handleSelectHoveredElement,
    );
    this.uiController.on('removeElement', this.handleRemoveElement);
    this.uiController.on('clearElements', this.handleClearElements);
    this.uiController.on('restoreElements', this.handleRestoreElements);
    this.uiController.on(
      'setContextSelectionMouseCoordinates',
      this.handleSetContextSelectionMouseCoordinates,
    );
    this.uiController.on(
      'clearContextSelectionMouseCoordinates',
      this.handleClearContextSelectionMouseCoordinates,
    );
    this.uiController.on(
      'passthroughWheelEvent',
      this.handlePassthroughWheelEvent,
    );
    this.uiController.on('scrollToElement', this.handleScrollToElement);
    this.uiController.on('startSearchInPage', this.handleStartSearchInPage);
    this.uiController.on(
      'updateSearchInPageText',
      this.handleUpdateSearchInPageText,
    );
    this.uiController.on('nextSearchResult', this.handleNextSearchResult);
    this.uiController.on(
      'previousSearchResult',
      this.handlePreviousSearchResult,
    );
    this.uiController.on('stopSearchInPage', this.handleStopSearchInPage);
    this.uiController.on('activateSearchBar', this.handleActivateSearchBar);
    this.uiController.on('deactivateSearchBar', this.handleDeactivateSearchBar);

    // Permission handling
    this.uiController.on('acceptPermission', this.handleAcceptPermission);
    this.uiController.on('rejectPermission', this.handleRejectPermission);
    this.uiController.on(
      'selectPermissionDevice',
      this.handleSelectPermissionDevice,
    );
    this.uiController.on(
      'respondToBluetoothPairing',
      this.handleRespondToBluetoothPairing,
    );
    // "Always" permission responses - saves to preferences
    this.uiController.on(
      'alwaysAllowPermission',
      this.handleAlwaysAllowPermission,
    );
    this.uiController.on(
      'alwaysBlockPermission',
      this.handleAlwaysBlockPermission,
    );

    // Authentication handling
    this.uiController.on(
      'submitAuthCredentials',
      this.handleSubmitAuthCredentials,
    );
    this.uiController.on('cancelAuth', this.handleCancelAuth);
  }

  /**
   * Handles UI renderer crash recovery by swapping the old (crashed)
   * WebContentsView with a fresh one in the BaseWindow hierarchy,
   * preserving correct z-order.
   */
  private setupUIViewRecreatedListener() {
    if (!this.uiController) return;

    this.uiController.on('viewRecreated', (oldView, newView) => {
      if (!this.baseWindow || this.baseWindow.isDestroyed()) return;

      this.logger.info(
        '[WindowLayoutService] Swapping crashed UI view with fresh instance',
      );

      // Remove the old crashed view from the hierarchy
      try {
        this.baseWindow.contentView.removeChildView(oldView);
      } catch {
        // Old view may already be in a bad state — ignore removal errors
      }

      // Add the new view and restore proper z-order.
      // addChildView places it on top; updateZOrder will fix layering.
      this.baseWindow.contentView.addChildView(newView);

      // Ensure new view fills the full window content area
      const bounds = this.baseWindow.getContentBounds();
      newView.setBounds({
        x: 0,
        y: 0,
        width: bounds.width,
        height: bounds.height,
      });

      // Restore correct z-layering (UI on top of tabs or vice versa)
      this.updateZOrder();
    });
  }

  private setupPagesServiceHandlers() {
    this.pagesService.setOpenTabHandler(
      async (url: string, setActive?: boolean) => {
        await this.handleCreateTab(url, setActive);
      },
    );
  }

  private get activeTab(): TabController | undefined {
    if (!this.activeTabId) return undefined;
    return this.tabs[this.activeTabId];
  }

  /**
   * Get a tab by ID, or the active tab if no ID is provided.
   * Used by services like DevToolAPIService to access tabs.
   *
   * @param tabId - Optional tab ID. If not provided, returns the active tab.
   * @returns The TabController instance or undefined if not found
   */
  public getTab(tabId?: string): TabController | undefined {
    if (tabId) {
      return this.tabs[tabId];
    }
    return this.activeTab;
  }

  private handleCreateTab = async (
    url?: string,
    setActive?: boolean,
    agentInstanceId?: string | null,
    sourceTabId?: string,
  ) => {
    // If no URL is provided, check user's new tab page preference
    let targetUrl = url;

    if (!targetUrl) {
      const preferences = this.preferencesService.get();
      if (preferences.general.newTabPage.type === 'custom') {
        const customUrl = preferences.general.newTabPage.customUrl;
        if (customUrl) {
          // Use the custom URL directly
          targetUrl = customUrl;
        } else {
          // Custom type but no URL configured - fall back to home
          targetUrl = HOME_PAGE_URL;
        }
      } else {
        // Type is 'home' - use the start page
        targetUrl = HOME_PAGE_URL;
      }
    }

    // For internal pages, check if a non-active tab with the same URL already
    // exists AND is visible to the requesting agent (global or matching).
    // If the active tab already has this URL, we still create a new tab.
    if (targetUrl?.startsWith('stagewise://')) {
      const existingTab = Object.entries(this.tabs).find(([id, tab]) => {
        if (id === this.activeTabId) return false;
        if (tab.getState().url !== targetUrl) return false;
        const tabAgent = tab.getState().agentInstanceId;
        return tabAgent === null || tabAgent === (agentInstanceId ?? null);
      });

      if (existingTab) {
        const [existingTabId] = existingTab;
        await this.handleSwitchTab(existingTabId);
        return;
      }
    }

    await this.createTab(
      targetUrl,
      setActive ?? true,
      sourceTabId,
      agentInstanceId,
    );
    this.saveTabState();
  };

  private async createTab(
    url: string | undefined,
    setActive: boolean,
    sourceTabId?: string,
    agentInstanceId?: string | null,
  ): Promise<string> {
    const id = generateTabId();

    // Create search utilities config that reads from current Karton state and preferences
    const searchUtilsConfig: SearchUtilsConfig = {
      getSearchEngines: () => this.uiKarton.state.searchEngines,
      getDefaultEngineId: () =>
        this.preferencesService.get().search.defaultEngineId,
    };

    // Create search utils instance for resolving navigation targets
    const searchUtils = createSearchUtils(searchUtilsConfig);
    const tab = new TabController(
      id,
      this.baseWindow!,
      this.logger,
      this.historyService,
      this.faviconService,
      searchUtilsConfig,
      url,
      (target: NavigationTarget, setActive?: boolean) => {
        // Resolve the navigation target to a URL
        const resolvedUrl = searchUtils.resolveNavigationTarget(target);
        // Inherit the parent tab's current agent scope (handles re-pinning).
        const parentAgentId = this.tabs[id]?.getState().agentInstanceId ?? null;
        void this.handleCreateTab(resolvedUrl, setActive, parentAgentId, id);
      },
      this.telemetryService ?? undefined,
    );

    // Subscribe to state updates
    tab.on('stateUpdated', (updates) => {
      this.uiKarton.setState((draft) => {
        const tabState = draft.browser.tabs[id];
        if (tabState) {
          Object.assign(tabState, updates);
        }
      });
    });

    tab.on('movePanelToForeground', (panel) => {
      this.handleMovePanelToForeground(panel);
    });

    tab.on('handleKeyDown', (keyDownEvent) => {
      if (id !== this.activeTabId) return;
      const def = getHotkeyDefinitionForEvent(keyDownEvent as KeyboardEvent);
      if (def) this.uiController?.forwardKeyDownEvent(keyDownEvent);
    });

    tab.on('tabFocused', (id) => {
      // FIX: webContents may auto-focus multiple times during page load
      // (wc.on('focus') fires on visibility, DOM load, script execution, etc.).
      // When isWebContentInteractive is false, the UI should have focus priority.
      // Reclaim it immediately to prevent the tab from stealing keyboard input.
      //
      // Originally scoped to Win32, but macOS exhibits the same behavior:
      // during CMD+T new-tab creation the tab's webContents grabs native OS
      // focus while still loading (url='', isLoading=true), which moves focus
      // away from the renderer's BrowserWindow. The omnibox INPUT remains
      // document.activeElement but document.hasFocus() returns false —
      // typing goes nowhere. UIController.focus() calls webContents.focus()
      // on the UI view; it does NOT change z-order, so it is safe on all
      // platforms (see Invariant #2 in focus-handling.md).
      if (!this.isWebContentInteractive && id === this.activeTabId) {
        this.uiController?.focus();
      }
      this.uiController?.forwardFocusEvent(id);
    });

    tab.on('elementHovered', (element) => {
      // Only update if this is the active tab
      if (this.activeTabId === id) {
        this.uiKarton.setState((draft) => {
          draft.browser.hoveredElement = element;
        });
      }
    });

    tab.on('elementSelected', (element) => {
      // Add element to the currently active message ID
      this.chatStateController?.addElement(element);
    });

    tab.on('viewportSizeChanged', (size) => {
      // Only update if this is the active tab
      if (this.activeTabId === id) {
        this.uiKarton.setState((draft) => {
          draft.browser.viewportSize = size;
        });
      }
    });

    tab.on('contentFullscreenChanged', (isFullscreen: boolean) => {
      this.handleContentFullscreenChanged(id, isFullscreen);
    });

    tab.on('devtoolsOpened', (tabId: string) => {
      const { isLocal, isHttps } = classifyTabUrl(
        tab.getViewContainer().webContents.getURL(),
      );
      this.telemetryService?.capture('devtools-opened', {
        tab_id: tabId,
        is_local: isLocal,
        is_https: isHttps,
      });
    });

    tab.on('devtoolsClosed', (tabId: string) => {
      const { isLocal, isHttps } = classifyTabUrl(
        tab.getViewContainer().webContents.getURL(),
      );
      this.telemetryService?.capture('devtools-closed', {
        tab_id: tabId,
        is_local: isLocal,
        is_https: isHttps,
      });
    });

    // Listen for webContents destroyed event to handle external tab closure
    // (e.g., crash, system closing the webContents)
    const webContents = tab.getViewContainer().webContents;
    webContents.on('destroyed', () => {
      // Skip cleanup if window is being destroyed (all tabs will be cleaned up together)
      if (!this.baseWindow || this.baseWindow.isDestroyed()) {
        return;
      }

      this.logger.debug(
        `[WindowLayoutService] WebContents destroyed for tab ${id}, cleaning up`,
      );
      // Only clean up if tab still exists (not already handled by handleCloseTab)
      if (this.tabs[id]) {
        void this.handleCloseTab(id);
      }
    });

    // Insert after source tab when opened from another tab, otherwise append to end
    const shouldInsertAfterSource = !!sourceTabId && !!this.tabs[sourceTabId];

    if (shouldInsertAfterSource) {
      // Insert new tab right after the source tab by reconstructing the tabs object
      const newTabs: Record<string, TabController> = {};
      for (const [existingId, existingTab] of Object.entries(this.tabs)) {
        newTabs[existingId] = existingTab;
        if (existingId === sourceTabId) {
          // Insert new tab right after source
          newTabs[id] = tab;
        }
      }
      this.tabs = newTabs;
    } else {
      // Append to end (default behavior for UI-created tabs)
      this.tabs[id] = tab;
    }

    // Update ChatStateController tabs reference
    this.chatStateController?.updateTabsReference(this.tabs);

    // Initialize state in Karton with proper ordering
    this.uiKarton.setState((draft) => {
      const newTabState = {
        id,
        ...tab.getState(),
      };

      if (shouldInsertAfterSource && sourceTabId) {
        // Reconstruct tabs object to maintain order
        const newBrowserTabs: typeof draft.browser.tabs = {};
        for (const [existingId, existingState] of Object.entries(
          draft.browser.tabs,
        )) {
          newBrowserTabs[existingId] = existingState;
          if (existingId === sourceTabId) {
            // Insert new tab right after source
            newBrowserTabs[id] = newTabState;
          }
        }
        draft.browser.tabs = newBrowserTabs;
      } else {
        // Append to end (default behavior)
        draft.browser.tabs[id] = newTabState;
      }
    });

    // Initially hide
    tab.setVisible(false);
    this.baseWindow!.contentView.addChildView(tab.getViewContainer());

    this.telemetryService?.capture('tab-created', {
      tab_count_after: Object.keys(this.tabs).length,
    });

    // Reinforce z-order after adding new tab view to ensure UI webcontent stays on top
    // (or tab content if isWebContentInteractive is true)
    this.updateZOrder();

    // Assign to agent instance (null = globally visible)
    tab.setAgentInstance(agentInstanceId ?? null);

    // Only activate new tab if requested AND source tab is active (or no source tab)
    // This prevents background tabs from stealing focus when they open links
    if (setActive && (!sourceTabId || sourceTabId === this.activeTabId))
      await this.handleSwitchTab(id);

    return id;
  }

  private handleCloseTab = async (tabId: string) => {
    const tab = this.tabs[tabId];
    if (tab) {
      // Get tab order before deletion to determine next/previous tab
      const tabIdsBeforeDeletion = Object.keys(this.tabs);
      const currentIndex = tabIdsBeforeDeletion.indexOf(tabId);
      const isActiveTab = this.activeTabId === tabId;
      const closedAgentInstanceId = tab.getState().agentInstanceId;

      // Check if webContents is already destroyed (e.g., crash, external closure)
      const webContents = tab.getViewContainer().webContents;
      const isAlreadyDestroyed = webContents.isDestroyed();

      // Only try to remove from view if not already destroyed
      if (!isAlreadyDestroyed) {
        this.baseWindow!.contentView.removeChildView(tab.getViewContainer());
      }
      tab.destroy();
      delete this.tabs[tabId];

      // Update ChatStateController tabs reference
      this.chatStateController?.updateTabsReference(this.tabs);

      this.telemetryService?.capture('tab-destroyed', {
        tab_count_after: Object.keys(this.tabs).length,
      });

      // Compute next tab BEFORE any Karton state update.
      // Prefer tabs visible to the closed tab's agent (global + same-agent)
      // so we don't switch to a tab the UI will hide, leaving empty content.
      let nextTabId: string | undefined;
      let nextTabAgentInstanceId: string | undefined;
      if (isActiveTab) {
        const remainingTabIds = Object.keys(this.tabs);
        // Filter to tabs visible from the closed tab's agent perspective
        const visibleRemaining = remainingTabIds.filter((id) => {
          const agentId = this.tabs[id]?.getState().agentInstanceId;
          return agentId === null || agentId === closedAgentInstanceId;
        });
        if (visibleRemaining.length > 0) {
          // Pick the next visible tab in positional order (prefer same index,
          // fall back to last in filtered list)
          const nextVisible =
            visibleRemaining.find(
              (id) => remainingTabIds.indexOf(id) >= currentIndex,
            ) ?? visibleRemaining[visibleRemaining.length - 1];
          nextTabId = nextVisible;
        } else if (remainingTabIds.length > 0) {
          // No visible tabs left — fall back to any remaining tab
          if (currentIndex < remainingTabIds.length) {
            nextTabId = remainingTabIds[currentIndex];
          } else if (currentIndex > 0) {
            nextTabId = remainingTabIds[currentIndex - 1];
          }
        }
        if (nextTabId) {
          nextTabAgentInstanceId =
            this.tabs[nextTabId]?.getState().agentInstanceId ?? undefined;
        }
      }

      // Do internal tab switch (bounds, visibility, z-order) but skip its
      // setState — we combine deletion + active-tab update below atomically.
      if (isActiveTab) {
        if (nextTabId) {
          await this.handleSwitchTab(nextTabId, true);
          this.activeTabId = nextTabId;
          if (nextTabAgentInstanceId) {
            this.lastActiveTabPerAgent[nextTabAgentInstanceId] = nextTabId;
          }
        } else {
          this.activeTabId = null;
        }
      }

      // Single atomic Karton state update: delete closed tab + set new active
      const newTab = nextTabId ? this.tabs[nextTabId] : undefined;
      this.uiKarton.setState((draft) => {
        delete draft.browser.tabs[tabId];
        if (isActiveTab) {
          draft.browser.activeTabId = nextTabId ?? null;
          if (newTab) {
            draft.browser.viewportSize = newTab.getViewportSize();
            if (nextTabAgentInstanceId) {
              draft.browser.lastActiveTabPerAgent[nextTabAgentInstanceId] =
                nextTabId!;
            }
          }
        }
      });

      // Clean up stale lastActiveTabPerAgent entries for the closed tab
      for (const [aid, tid] of Object.entries(this.lastActiveTabPerAgent)) {
        if (tid === tabId) delete this.lastActiveTabPerAgent[aid];
      }

      this.saveTabState();
    }
  };

  private handleSwitchTab = async (tabId: string, skipSetState = false) => {
    if (!this.tabs[tabId]) return;
    if (this.activeTabId === tabId) return;

    const previousTabId = this.activeTabId;

    // If previous tab was in content fullscreen, exit it
    if (previousTabId && this.contentFullscreenTabId === previousTabId) {
      await this.tabs[previousTabId]?.exitContentFullscreen();
      // The contentFullscreenChanged handler will clean up state
    }

    this.activeTabId = tabId;
    const newTab = this.tabs[tabId]!;

    // Show new tab BEFORE hiding old tab to prevent flicker.
    // Both tabs briefly overlap, but z-order update below resolves it.
    if (newTab.getState().isContentFullscreen) {
      const windowBounds = this.baseWindow!.getContentBounds();
      newTab.setBorderRadiusForFullscreen(0);
      newTab.setBounds({
        x: 0,
        y: 0,
        width: windowBounds.width,
        height: windowBounds.height,
      });
      newTab.setVisible(true);
      this.isWebContentInteractive = true;
      this.contentFullscreenTabId = tabId;
    } else if (this.currentWebContentBounds) {
      newTab.setBounds(this.currentWebContentBounds);
      newTab.setVisible(true);
      this.isWebContentInteractive = false;
    } else {
      // If no bounds set yet, keep invisible until layout update
      newTab.setVisible(false);
      this.isWebContentInteractive = false;
    }

    // Hide previous tab after new tab is visible
    if (previousTabId && this.tabs[previousTabId]) {
      this.tabs[previousTabId]!.setVisible(false);
      this.tabs[previousTabId]!.setBorderRadiusForFullscreen(0);
    }

    this.updateZOrder();

    const agentInstanceId = newTab.getState().agentInstanceId;
    if (agentInstanceId) {
      this.lastActiveTabPerAgent[agentInstanceId] = tabId;
    }

    if (!skipSetState) {
      this.uiKarton.setState((draft) => {
        draft.browser.activeTabId = tabId;
        draft.browser.viewportSize = newTab.getViewportSize();
        if (agentInstanceId) {
          draft.browser.lastActiveTabPerAgent[agentInstanceId] = tabId;
        }
      });

      this.saveTabState();
    }
  };

  private handleReorderTabs = async (tabIds: string[]) => {
    // Validate that all provided tab IDs exist
    const validTabIds = tabIds.filter((id) => this.tabs[id]);
    if (validTabIds.length !== tabIds.length) {
      this.logger.warn(
        '[WindowLayoutService] Some tab IDs in reorder request are invalid',
      );
    }

    // Reorder internal tabs record
    const newTabs: Record<string, TabController> = {};
    for (const id of validTabIds) {
      newTabs[id] = this.tabs[id]!;
    }
    this.tabs = newTabs;

    // Update ChatStateController tabs reference
    this.chatStateController?.updateTabsReference(this.tabs);

    // Update Karton state with new tab order
    this.uiKarton.setState((draft) => {
      const newBrowserTabs: typeof draft.browser.tabs = {};
      for (const id of validTabIds) {
        newBrowserTabs[id] = draft.browser.tabs[id]!;
      }
      draft.browser.tabs = newBrowserTabs;
    });
  };

  private handleUIReady = async () => {
    this.logger.debug('[WindowLayoutService] UI is ready, showing window');

    // Force a bounds update to ensure any tabs waiting for bounds get shown
    // This handles the race condition where tabs are created before UI is ready
    if (this.currentWebContentBounds && this.activeTab) {
      this.activeTab.setVisible(true);
      this.activeTab.setBounds(this.currentWebContentBounds);
    }

    // Now that everything is ready, show the window
    if (this.baseWindow && !this.baseWindow.isDestroyed()) {
      this.baseWindow.show();

      // Apply initial window state after showing
      if (this.initialWindowState.isMaximized) {
        this.baseWindow.maximize();
      }
      if (this.initialWindowState.isFullScreen) {
        this.baseWindow.setFullScreen(true);
      }

      this.logger.debug('[WindowLayoutService] Window shown');
    }
  };

  private handleLayoutUpdate = async (
    bounds: { x: number; y: number; width: number; height: number } | null,
  ) => {
    this.currentWebContentBounds = bounds;

    // Don't apply bounds if active tab is in content fullscreen
    if (this.activeTabId && this.contentFullscreenTabId === this.activeTabId) {
      this.logger.debug(
        '[WindowLayoutService] Ignoring layout update during content fullscreen',
      );
      return;
    }

    if (bounds && this.activeTab) {
      this.activeTab.setVisible(true);
      this.activeTab.setBounds(bounds);
    } else if (!bounds && this.activeTab) {
      this.activeTab.setVisible(false);
    }
  };

  private handleMovePanelToForeground = async (
    panel: 'stagewise-ui' | 'tab-content',
  ) => {
    // Ignore tab-content requests before the UI has sent its first layout update
    // (i.e. bounds are not yet set). This prevents the initial webcontents focus
    // event from pushing webcontents on top at startup, which would hide popups.
    if (panel === 'tab-content' && this.currentWebContentBounds === null)
      return;
    // FIX 1: Short-circuit when z-order already matches — prevents the continuous
    // updateZOrder() calls from WebContentsBoundsSyncer (mousemove) from
    // destroying native HWND keyboard focus via the Win32 removeChildView/addChildView dance.
    const newValue = panel === 'tab-content';
    if (this.isWebContentInteractive === newValue) {
      return;
    }
    this.isWebContentInteractive = newValue;
    this.updateZOrder();
  };

  /**
   * Handles HTML5 fullscreen state changes from tab content.
   * Manages bounds override, z-order, and border-radius during fullscreen.
   *
   * Note: During fullscreen, handleLayoutUpdate() still updates currentWebContentBounds
   * to track the UI's current layout (but doesn't apply to the tab). On exit, we use
   * currentWebContentBounds to restore the tab to the current UI layout, not the layout
   * from when fullscreen started.
   */
  private handleContentFullscreenChanged = (
    tabId: string,
    isFullscreen: boolean,
  ) => {
    const tab = this.tabs[tabId];
    if (!tab || !this.baseWindow || this.baseWindow.isDestroyed()) return;

    if (isFullscreen) {
      this.logger.debug(
        `[WindowLayoutService] Tab ${tabId} entering content fullscreen`,
      );

      // Only one tab can be in content fullscreen at a time
      if (
        this.contentFullscreenTabId &&
        this.contentFullscreenTabId !== tabId
      ) {
        // Exit fullscreen on the other tab
        this.tabs[this.contentFullscreenTabId]?.exitContentFullscreen();
      }

      this.contentFullscreenTabId = tabId;

      // Get full window content bounds
      const windowBounds = this.baseWindow.getContentBounds();
      const fullBounds = {
        x: 0,
        y: 0,
        width: windowBounds.width,
        height: windowBounds.height,
      };

      // Apply fullscreen styling
      tab.setBorderRadiusForFullscreen(0);
      tab.setBounds(fullBounds);

      // Ensure tab is on top (in front of UI)
      this.isWebContentInteractive = true;
      this.updateZOrder();
    } else {
      this.logger.debug(
        `[WindowLayoutService] Tab ${tabId} leaving content fullscreen`,
      );

      // Only restore if this is the tab that was in fullscreen
      if (this.contentFullscreenTabId === tabId) {
        this.contentFullscreenTabId = null;

        // Restore border radius
        tab.setBorderRadiusForFullscreen(0);

        // Restore to current UI bounds (not the bounds from when fullscreen started,
        // since the UI may have changed during fullscreen, e.g., sidebar toggle)
        if (this.currentWebContentBounds && this.activeTabId === tabId) {
          tab.setBounds(this.currentWebContentBounds);
        }

        // Keep isWebContentInteractive = true (don't change z-order)
        // The mouse is likely still over the webcontents area, and changing z-order
        // would require the user to move mouse away and back to trigger mouseEnter.
        // Normal mouse leave/enter behavior will handle z-order switching.
        this.updateZOrder();
      }
    }

    // Update Karton state for UI
    this.uiKarton.setState((draft) => {
      if (draft.browser.tabs[tabId]) {
        draft.browser.tabs[tabId].isContentFullscreen = isFullscreen;
      }
    });
  };

  private handleTogglePanelKeyboardFocus = async (
    panel: 'stagewise-ui' | 'tab-content',
  ) => {
    if (panel === 'stagewise-ui') {
      // FIX 3 (Win32): On Windows, the tab's Win32 child window intercepts keyboard
      // events when it is topmost. We must put the UI on top BEFORE calling focus().
      // See focus-handling.md Invariant #3 and Bug 9.5.
      // On macOS/Linux, keyboard focus is independent of z-order (Invariant #2) —
      // changing z-order here would desynchronize the WebContentsBoundsSyncer's
      // lastInteractive cache, leaving web content non-interactive (Bug 9.10).
      if (process.platform === 'win32' && this.isWebContentInteractive) {
        this.isWebContentInteractive = false;
        this.updateZOrder();
      }
      this.uiController?.focus();
    } else {
      // FIX (Win32): Symmetric with the stagewise-ui path above.
      // The tab must be topmost to receive keyboard events on Win32.
      // Also required so the tabFocused auto-focus guard (which reclaims UI
      // focus when isWebContentInteractive === false) doesn't interfere with
      // intentional tab focus requests.
      if (process.platform === 'win32' && !this.isWebContentInteractive) {
        this.isWebContentInteractive = true;
        this.updateZOrder();
      }
      this.activeTab?.focus();
    }
  };

  private updateZOrder() {
    // Guard against calls during/after teardown when window is destroyed
    if (
      !this.baseWindow ||
      this.baseWindow.isDestroyed() ||
      !this.uiController
    ) {
      return;
    }

    if (process.platform !== 'win32') {
      // On non-windows platforms, re-adding works fine and keep performance good
      if (this.isWebContentInteractive && this.activeTab) {
        this.baseWindow!.contentView.addChildView(
          this.activeTab.getViewContainer(),
        );
      } else {
        this.baseWindow!.contentView.addChildView(this.uiController!.getView());
      }
    } else {
      const uiFocusedBeforeZOrder =
        this.uiController?.getView().webContents.isFocused() ?? false;
      const tabFocusedBeforeZOrder =
        this.activeTab?.getViewContainer().webContents.isFocused() ?? false;
      // On windows, we ne explicit re-adding to prevent bugy in hitbox testing
      if (this.isWebContentInteractive && this.activeTab) {
        this.baseWindow!.contentView.removeChildView(
          this.uiController!.getView(),
        );
        this.baseWindow!.contentView.removeChildView(
          this.activeTab.getViewContainer(),
        );

        this.baseWindow!.contentView.addChildView(this.uiController!.getView());
        this.baseWindow!.contentView.addChildView(
          this.activeTab.getViewContainer(),
        );
      } else {
        this.baseWindow!.contentView.removeChildView(
          this.uiController!.getView(),
        );

        if (this.activeTab) {
          this.baseWindow!.contentView.removeChildView(
            this.activeTab.getViewContainer(),
          );

          this.baseWindow!.contentView.addChildView(
            this.activeTab.getViewContainer(),
          );
        }
        this.baseWindow!.contentView.addChildView(this.uiController!.getView());
      }
      // FIX 2: Restore native focus after the Win32 remove/add dance.
      // The removeChildView/addChildView cycle destroys ALL native HWND keyboard
      // focus — even for the view that keeps its z-position. If ANY view had focus
      // before, we must give focus to the TOPMOST view (the one that can actually
      // receive keyboard events on Win32, since the topmost child HWND intercepts
      // all keyboard input). This prevents the "dead zone" where neither view has
      // focus and all hotkeys stop working (see focus-handling.md Bug 9.10).
      if (uiFocusedBeforeZOrder || tabFocusedBeforeZOrder) {
        if (!this.isWebContentInteractive) {
          this.uiController!.getView().webContents.focus();
        } else if (this.activeTab) {
          this.activeTab.getViewContainer().webContents.focus();
        }
      }
    }
  }

  private handleStop = async (tabId?: string) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.stop();
  };

  private handleReload = async (tabId?: string) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.reload();
  };

  private handleTrustCertificateAndReload = async (
    tabId: string,
    origin: string,
  ) => {
    const tab = this.tabs[tabId];
    if (tab) {
      tab.trustCertificateAndReload(origin);
    }
  };

  private handleGoto = async (
    url: string,
    tabId?: string,
    transition?: PageTransition,
  ) => {
    this.logger.debug(
      `[WindowLayoutService] handleGoto called with url: ${url}, tabId: ${tabId}, activeTabId: ${this.activeTabId}, transition: ${transition}`,
    );
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    if (tab) {
      tab.loadURL(url, transition);
    } else {
      this.logger.error(
        `[WindowLayoutService] handleGoto: No tab found for tabId: ${tabId} or activeTabId: ${this.activeTabId}`,
      );
    }
  };

  private handleGoBack = async (tabId?: string) => {
    this.logger.debug(
      `[WindowLayoutService] handleGoBack called with tabId: ${tabId}`,
    );
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.goBack();
  };

  private handleGoForward = async (tabId?: string) => {
    this.logger.debug(
      `[WindowLayoutService] handleGoForward called with tabId: ${tabId}`,
    );
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.goForward();
  };

  // DevTools handlers are now in DevToolAPIService

  private handleSetAudioMuted = async (muted: boolean, tabId?: string) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.setAudioMuted(muted);
  };

  private handleToggleAudioMuted = async (tabId?: string) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.toggleAudioMuted();
  };

  private handleSetColorScheme = async (
    scheme: ColorScheme,
    tabId?: string,
  ) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    await tab?.setColorScheme(scheme);
  };

  private handleCycleColorScheme = async (tabId?: string) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    await tab?.cycleColorScheme();
  };

  private handleSetZoomPercentage = async (
    percentage: number,
    tabId?: string,
  ) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.setZoomPercentage(percentage);
  };

  private handleSetTabAgentInstance = async (
    tabId: string,
    agentInstanceId: string | null,
  ) => {
    const tab = this.tabs[tabId];
    if (!tab) {
      this.logger.warn(
        `[WindowLayoutService] setTabAgentInstance: tab ${tabId} not found`,
      );
      return;
    }
    // Capture old agent before reassignment so we can clean up the stale
    // last-active-tab entry. The current code only cleaned up on unpin,
    // which left dangling pointers when re-pinning tab A→B.
    const oldAgentId = tab.getState().agentInstanceId;
    tab.setAgentInstance(agentInstanceId);

    // Remove old agent's last-active-tab entry if it points to this tab.
    if (oldAgentId && this.lastActiveTabPerAgent[oldAgentId] === tabId) {
      delete this.lastActiveTabPerAgent[oldAgentId];
    }

    // When pinning to a new agent, record this tab as that agent's
    // last-active tab so the agent has a valid entry immediately.
    if (agentInstanceId) {
      this.lastActiveTabPerAgent[agentInstanceId] = tabId;
    }

    this.saveTabState();
  };

  /** Lazily create persisted tabs for an agent when it is first selected.
   *  Consumes from the snapshot stored at startup — never re-reads persisted
   *  state, so tabs re-assigned after startup won't be duplicated. */
  private async ensureAgentTabsCreated(agentInstanceId: string | null) {
    const configs = this.deferredTabConfigs.get(agentInstanceId);
    if (!configs || configs.length === 0) return;
    this.deferredTabConfigs.delete(agentInstanceId);

    this.logger.debug(
      `[WindowLayoutService] Lazily creating ${configs.length} tabs for agent ${agentInstanceId}`,
    );

    for (const cfg of configs) {
      await this.createTab(cfg.url, false, undefined, cfg.agentInstanceId);
    }
  }

  private handleSetLastOpenAgentId = async (agentInstanceId: string | null) => {
    // Lazily create tabs when switching to a not-yet-activated agent.
    await this.ensureAgentTabsCreated(agentInstanceId);

    this.uiKarton.setState((draft) => {
      draft.browser.lastOpenAgentId = agentInstanceId;
    });
    this.saveTabState();
  };

  private handleSetContextSelectionMode = async (active: boolean) => {
    const isAlreadyActive = this.uiKarton.state.browser.contextSelectionMode;

    if (active && isAlreadyActive) {
      // Turn off for the currently active message ID
      this.uiKarton.setState((draft) => {
        draft.browser.contextSelectionMode = false;
      });

      // Brief delay to ensure UI updates
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Update tab first (triggers viewport update when activating), then UI state.
    // This prevents a race condition where selector-canvas renders with
    // contextSelectionActive=true but viewportSize=null.
    if (this.activeTab) {
      try {
        await this.activeTab.setContextSelectionMode(active);
      } catch (err) {
        this.logger.error(
          `[WindowLayoutService] Failed to set context selection mode: ${err}`,
        );
      }
    }
    this.uiKarton.setState((draft) => {
      draft.browser.contextSelectionMode = active;
    });
  };

  private handleSelectHoveredElement = () => {
    // Element will be added via 'elementSelected' event with active message ID
    this.activeTab?.selectHoveredElement();
  };

  private handleSetContextSelectionMouseCoordinates = async (
    x: number,
    y: number,
  ) => {
    this.activeTab?.setContextSelectionMouseCoordinates(x, y);
  };

  private handleClearContextSelectionMouseCoordinates = async () => {
    await this.activeTab?.clearContextSelectionMouseCoordinates();
  };

  private handlePassthroughWheelEvent = async (event: {
    type: 'wheel';
    x: number;
    y: number;
    deltaX: number;
    deltaY: number;
  }) => {
    this.activeTab?.passthroughWheelEvent(event);
  };

  private handleScrollToElement = async (
    tabId: string,
    backendNodeId: number,
    frameId: string,
  ) => {
    const tab = this.tabs[tabId];
    if (tab) {
      await tab.scrollToElement(backendNodeId, frameId);
    }
  };

  private handleCheckFrameValidity = async (
    tabId: string,
    frameId: string,
    expectedFrameLocation: string,
  ): Promise<boolean> => {
    const tab = this.tabs[tabId];
    if (tab) {
      return await tab.checkFrameValidity(frameId, expectedFrameLocation);
    }
    return false;
  };

  private handleCheckElementExists = async (
    tabId: string,
    backendNodeId: number,
    frameId: string,
  ): Promise<boolean> => {
    const tab = this.tabs[tabId];
    if (tab) {
      return await tab.checkElementExists(backendNodeId, frameId);
    }
    return false;
  };

  /**
   * Captures an element screenshot, converts it to WebP, and stores it
   * as an agent attachment blob.
   */
  private handleCaptureAndStoreElementScreenshot = async (
    agentId: string,
    tabId: string,
    boundingRect: {
      top: number;
      left: number;
      width: number;
      height: number;
    },
    isMainFrame: boolean,
    frameId: string | undefined,
    screenshotFileName: string,
  ): Promise<string | null> => {
    const tab = this.tabs[tabId];
    if (!tab) {
      this.logger.warn(
        `[WindowLayout] captureAndStoreElementScreenshot: tab ${tabId} not found`,
      );
      return null;
    }

    try {
      // Capture the element screenshot (returns a JPEG data URL)
      const dataUrl = await tab.captureElementScreenshot(
        boundingRect,
        20,
        isMainFrame,
        frameId,
      );
      if (!dataUrl) {
        this.logger.debug(
          '[WindowLayout] captureAndStoreElementScreenshot: capture returned null',
        );
        return null;
      }

      // Extract the base64 data from the data URL
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const jpegBuffer = Buffer.from(base64Data, 'base64');

      // Convert JPEG to WebP using sharp
      const webpBuffer = await sharp(jpegBuffer)
        .webp({ quality: 80 })
        .toBuffer();

      // Store as an agent attachment blob
      const blobKey = generateAttachmentFilename(screenshotFileName);
      await writeBlob(agentId, blobKey, webpBuffer);

      this.logger.debug(
        `[WindowLayout] Stored element screenshot: ${blobKey} (${Math.round(webpBuffer.length / 1024)}KB WebP)`,
      );

      return blobKey;
    } catch (err) {
      this.logger.warn(
        `[WindowLayout] captureAndStoreElementScreenshot error: ${err}`,
      );
      return null;
    }
  };

  private handleRemoveElement = (elementId: string) => {
    this.chatStateController?.removeElement(elementId);
  };

  private handleClearElements = () => {
    this.chatStateController?.clearElements();
  };

  private handleRestoreElements = (elements: SelectedElement[]) => {
    this.chatStateController?.restoreElements(elements);
  };

  private handleStartSearchInPage = (searchText: string, tabId?: string) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.startSearch(searchText);
  };

  private handleUpdateSearchInPageText = (
    searchText: string,
    tabId?: string,
  ) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.updateSearchText(searchText);
  };

  private handleNextSearchResult = (tabId?: string) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.nextResult();
  };

  private handlePreviousSearchResult = (tabId?: string) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.previousResult();
  };

  private handleStopSearchInPage = (tabId?: string) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.stopSearch();
  };

  private handleActivateSearchBar = () => {
    if (!this.activeTabId) return;
    this.uiKarton.setState((draft) => {
      const tab = draft.browser.tabs[this.activeTabId!];
      if (tab) {
        tab.isSearchBarActive = true;
      }
    });
  };

  private handleDeactivateSearchBar = () => {
    if (!this.activeTabId) return;
    this.uiKarton.setState((draft) => {
      const tab = draft.browser.tabs[this.activeTabId!];
      if (tab) {
        tab.isSearchBarActive = false;
      }
    });
    // Also stop any active search
    this.activeTab?.stopSearch();
    // Restore web content z-order — CMD+F sets isWebContentInteractive = false
    // via togglePanelKeyboardFocus('stagewise-ui'), and nothing restores it on
    // search bar close. Without this, the syncer's lastInteractive cache stays
    // stale and the short-circuit prevents movePanelToForeground('tab-content')
    // from ever firing until the user moves the mouse out and back.
    this.handleMovePanelToForeground('tab-content');
  };

  // Permission Handling
  // These handlers find the tab that has the permission request and delegate to it

  private handleAcceptPermission = (requestId: string) => {
    for (const tab of Object.values(this.tabs)) {
      const state = tab.getState();
      if (state.permissionRequests.some((r) => r.id === requestId)) {
        tab.acceptPermission(requestId);
        return;
      }
    }
    this.logger.warn(
      `[WindowLayoutService] No tab found for permission request: ${requestId}`,
    );
  };

  private handleRejectPermission = (requestId: string) => {
    for (const tab of Object.values(this.tabs)) {
      const state = tab.getState();
      if (state.permissionRequests.some((r) => r.id === requestId)) {
        tab.rejectPermission(requestId);
        return;
      }
    }
    this.logger.warn(
      `[WindowLayoutService] No tab found for permission request: ${requestId}`,
    );
  };

  private handleSelectPermissionDevice = (
    requestId: string,
    deviceId: string,
  ) => {
    for (const tab of Object.values(this.tabs)) {
      const state = tab.getState();
      if (state.permissionRequests.some((r) => r.id === requestId)) {
        tab.selectPermissionDevice(requestId, deviceId);
        return;
      }
    }
    this.logger.warn(
      `[WindowLayoutService] No tab found for permission request: ${requestId}`,
    );
  };

  private handleRespondToBluetoothPairing = (
    requestId: string,
    confirmed: boolean,
    pin?: string,
  ) => {
    for (const tab of Object.values(this.tabs)) {
      const state = tab.getState();
      if (state.permissionRequests.some((r) => r.id === requestId)) {
        tab.respondToBluetoothPairing(requestId, confirmed, pin);
        return;
      }
    }
    this.logger.warn(
      `[WindowLayoutService] No tab found for Bluetooth pairing request: ${requestId}`,
    );
  };

  /**
   * Handle "Always Allow" - saves preference and accepts the permission
   */
  private handleAlwaysAllowPermission = async (requestId: string) => {
    for (const tab of Object.values(this.tabs)) {
      const state = tab.getState();
      const request = state.permissionRequests.find((r) => r.id === requestId);
      if (request) {
        // Check if this permission type is configurable
        const permissionType = request.type as ConfigurablePermissionType;
        if (
          configurablePermissionTypes.includes(
            permissionType as (typeof configurablePermissionTypes)[number],
          )
        ) {
          // Save the "Always Allow" preference
          await this.preferencesService.setPermissionException(
            request.origin,
            permissionType,
            PermissionSetting.Allow,
          );
          this.logger.debug(
            `[WindowLayoutService] Saved "Always Allow" for ${permissionType} on ${request.origin}`,
          );
        }
        // Accept the current request
        tab.acceptPermission(requestId);
        return;
      }
    }
    this.logger.warn(
      `[WindowLayoutService] No tab found for permission request: ${requestId}`,
    );
  };

  /**
   * Handle "Always Block" - saves preference and rejects the permission
   */
  private handleAlwaysBlockPermission = async (requestId: string) => {
    for (const tab of Object.values(this.tabs)) {
      const state = tab.getState();
      const request = state.permissionRequests.find((r) => r.id === requestId);
      if (request) {
        // Check if this permission type is configurable
        const permissionType = request.type as ConfigurablePermissionType;
        if (
          configurablePermissionTypes.includes(
            permissionType as (typeof configurablePermissionTypes)[number],
          )
        ) {
          // Save the "Always Block" preference
          await this.preferencesService.setPermissionException(
            request.origin,
            permissionType,
            PermissionSetting.Block,
          );
          this.logger.debug(
            `[WindowLayoutService] Saved "Always Block" for ${permissionType} on ${request.origin}`,
          );
        }
        // Reject the current request
        tab.rejectPermission(requestId);
        return;
      }
    }
    this.logger.warn(
      `[WindowLayoutService] No tab found for permission request: ${requestId}`,
    );
  };

  // Authentication Handling

  private handleSubmitAuthCredentials = (
    requestId: string,
    username: string,
    password: string,
  ) => {
    for (const tab of Object.values(this.tabs)) {
      const state = tab.getState();
      if (state.authenticationRequest?.id === requestId) {
        tab.submitAuthCredentials(requestId, username, password);
        return;
      }
    }
    this.logger.warn(
      `[WindowLayoutService] No tab found for auth request: ${requestId}`,
    );
  };

  private handleCancelAuth = (requestId: string) => {
    for (const tab of Object.values(this.tabs)) {
      const state = tab.getState();
      if (state.authenticationRequest?.id === requestId) {
        tab.cancelAuth(requestId);
        return;
      }
    }
    this.logger.warn(
      `[WindowLayoutService] No tab found for auth request: ${requestId}`,
    );
  };

  // Window State Management
  private loadWindowState(): WindowState | null {
    const state = readPersistedDataSync(
      'window-state',
      windowStateSchema,
      null as unknown as WindowState,
    );
    return state ?? null;
  }

  private scheduleWindowStateSave() {
    if (this.saveStateTimeout) return;
    this.saveStateTimeout = setTimeout(() => {
      this.saveWindowState();
    }, 10000);
  }

  private saveWindowState() {
    if (this.saveStateTimeout) {
      clearTimeout(this.saveStateTimeout);
      this.saveStateTimeout = null;
    }

    if (!this.baseWindow || this.baseWindow.isDestroyed()) return;

    try {
      const isMaximized = this.baseWindow.isMaximized();
      const isFullScreen = this.baseWindow.isFullScreen();
      const currentBounds = this.baseWindow.getBounds();
      const savedBounds = this.lastNonMaximizedBounds || currentBounds;

      const state: WindowState = {
        width: savedBounds.width,
        height: savedBounds.height,
        x: savedBounds.x,
        y: savedBounds.y,
        isMaximized,
        isFullScreen,
      };

      writePersistedDataSync('window-state', windowStateSchema, state);
    } catch (error) {
      this.logger.error(
        '[WindowLayoutService] Failed to save window state',
        error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Tab State Persistence
  // -------------------------------------------------------------------------

  /** Persist open tabs and agent-tab associations so they survive restart. */
  private saveTabState() {
    try {
      // Sort global-first to match the UI display order
      const sortedIds = [...Object.keys(this.tabs)].sort((a, b) => {
        const aGlobal = this.tabs[a]!.getState().agentInstanceId === null;
        const bGlobal = this.tabs[b]!.getState().agentInstanceId === null;
        if (aGlobal && !bGlobal) return -1;
        if (!aGlobal && bGlobal) return 1;
        return 0;
      });
      const activeIndex = this.activeTabId
        ? sortedIds.indexOf(this.activeTabId)
        : -1;
      const state: PersistedTabState = {
        tabs: sortedIds.map((id) => {
          const tabState = this.tabs[id]!.getState();
          return {
            url: tabState.url,
            agentInstanceId: tabState.agentInstanceId,
          };
        }),
        activeTabIndex: activeIndex,
        lastActiveTabPerAgent: this.lastActiveTabPerAgent,
        lastOpenAgentId: this.uiKarton.state.browser.lastOpenAgentId ?? null,
      };
      writePersistedDataSync('tab-state', tabStateSchema, state);
    } catch (error) {
      this.logger.error(
        '[WindowLayoutService] Failed to save tab state',
        error,
      );
    }
  }

  /** Restore tabs and agent associations from persisted state.
   *  Only global tabs and tabs belonging to the last-open agent are eagerly
   *  created. Other agent tabs are stored in deferredTabConfigs and created
   *  lazily when that agent is selected. */
  private async loadTabState() {
    const state = readPersistedDataSync(
      'tab-state',
      tabStateSchema,
      null as unknown as PersistedTabState,
    );
    if (!state || state.tabs.length === 0) return;

    const lastOpenAgentId = state.lastOpenAgentId;

    this.logger.debug(
      `[WindowLayoutService] Restoring tabs (lastOpenAgentId=${lastOpenAgentId})`,
    );

    // Restore the last-active-tab-per-agent map first
    this.lastActiveTabPerAgent = state.lastActiveTabPerAgent || {};
    // Push to Karton state so the UI can use it
    this.uiKarton.setState((draft) => {
      draft.browser.lastActiveTabPerAgent = { ...this.lastActiveTabPerAgent };
      draft.browser.lastOpenAgentId = lastOpenAgentId ?? null;
    });

    // Partition into eager (global + last-open agent) and deferred (the rest).
    const visibleTabs: typeof state.tabs = [];
    for (const t of state.tabs) {
      if (!t.agentInstanceId || t.agentInstanceId === lastOpenAgentId) {
        visibleTabs.push(t);
      } else {
        const group = this.deferredTabConfigs.get(t.agentInstanceId);
        if (group) group.push(t);
        else this.deferredTabConfigs.set(t.agentInstanceId, [t]);
      }
    }

    const deferredCount = state.tabs.length - visibleTabs.length;
    this.logger.debug(
      `[WindowLayoutService] Eagerly creating ${visibleTabs.length} tabs, deferring ${deferredCount}`,
    );

    for (const savedTab of visibleTabs) {
      await this.createTab(
        savedTab.url,
        false,
        undefined,
        savedTab.agentInstanceId,
      );
    }

    // Activate the tab at the saved index (only if it was among the visible tabs)
    if (state.activeTabIndex >= 0 && state.activeTabIndex < state.tabs.length) {
      const targetTab = state.tabs[state.activeTabIndex]!;
      if (
        !targetTab.agentInstanceId ||
        targetTab.agentInstanceId === lastOpenAgentId
      ) {
        const tabIds = Object.keys(this.tabs);
        const targetId = tabIds[visibleTabs.indexOf(targetTab)];
        if (targetId) await this.handleSwitchTab(targetId);
      }
    }
  }

  private updateLastNonMaximizedBounds() {
    if (
      this.baseWindow &&
      !this.baseWindow.isMaximized() &&
      !this.baseWindow.isFullScreen() &&
      !this.baseWindow.isDestroyed()
    ) {
      this.lastNonMaximizedBounds = this.baseWindow.getBounds();
    }
  }

  private handleMainWindowResize() {
    if (!this.baseWindow || !this.uiController) return;
    const bounds = this.baseWindow.getContentBounds();
    this.uiController.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
    });

    // If a tab is in content fullscreen, update its bounds to match new window size
    if (this.contentFullscreenTabId && this.tabs[this.contentFullscreenTabId]) {
      this.tabs[this.contentFullscreenTabId].setBounds({
        x: 0,
        y: 0,
        width: bounds.width,
        height: bounds.height,
      });
    }
  }

  private applyThemeColors() {
    if (!this.baseWindow || this.baseWindow.isDestroyed()) return;

    const isDark = nativeTheme.shouldUseDarkColors;
    const theme = isDark ? THEME_COLORS.dark : THEME_COLORS.light;

    if (process.platform === 'linux') {
      this.baseWindow.setBackgroundColor(theme.background);
    }

    // Note: Tab webcontents backgrounds stay white regardless of theme
    // This matches real browser behavior where pages without explicit
    // background display on a white canvas

    this.logger.debug(
      `[WindowLayoutService] Applied ${isDark ? 'dark' : 'light'} theme colors to window`,
    );
  }

  /**
   * Apply theme colors received from the renderer via IPC.
   * Used during dev mode HMR to keep window background in sync with CSS palette changes.
   */
  private applyDynamicThemeColors(colors: {
    isDark: boolean;
    theme: {
      background: string;
    };
  }) {
    if (!this.baseWindow || this.baseWindow.isDestroyed()) return;

    // Only apply if the theme mode matches current system preference
    const currentIsDark = nativeTheme.shouldUseDarkColors;
    if (colors.isDark !== currentIsDark) {
      this.logger.debug(
        `[WindowLayoutService] Ignoring theme sync (received ${colors.isDark ? 'dark' : 'light'}, current is ${currentIsDark ? 'dark' : 'light'})`,
      );
      return;
    }

    if (process.platform === 'linux') {
      this.baseWindow.setBackgroundColor(colors.theme.background);
    }

    this.logger.debug(
      `[WindowLayoutService] Applied dynamic ${colors.isDark ? 'dark' : 'light'} theme colors: bg=${colors.theme.background}`,
    );
  }

  // =========================================================================
  // Agent Browser Tools
  // =========================================================================

  /**
   * Resolves a tab ID to a TabController instance.
   *
   * @param tabId - The tab ID (e.g., "1", "2", …)
   * @returns The TabController instance or null if not found
   */
  private resolveTabById(tabId: string): TabController | null {
    return this.tabs[tabId] ?? null;
  }

  public async sendCDP(
    tabId: string,
    method: string,
    params: any,
  ): Promise<any> {
    const tab = this.resolveTabById(tabId);
    if (!tab)
      throw new Error(
        `Tab not found: "${tabId}". Check browser-information for available tabs.`,
      );

    return await tab.sendCDP(method, params);
  }

  /**
   * Subscribes to a CDP event on the specified tab.
   * Returns an unsubscribe function to remove the listener.
   */
  public subscribeCDPEvent(
    tabId: string,
    event: string,
    callback: (params: unknown) => void,
  ): () => void {
    const tab = this.resolveTabById(tabId);
    if (!tab)
      throw new Error(
        `Tab not found: "${tabId}". Check browser-information for available tabs.`,
      );

    return tab.subscribeCDPEvent(event, callback);
  }

  /**
   * Executes a JavaScript expression in the console of the specified tab.
   *
   * @param expression - The JavaScript expression to execute
   * @param tabId - The tab ID to execute the script on
   * @returns An object with success status and either the result or an error message
   */
  public async executeConsoleScript(
    expression: string,
    tabId: string,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const tab = this.resolveTabById(tabId);

    if (!tab) {
      return {
        success: false,
        error: `Tab not found: "${tabId}". Check browser-information for available tabs.`,
      };
    }

    return await tab.executeConsoleScript(expression);
  }

  /**
   * Gets console logs from the specified tab with optional filtering.
   *
   * @param tabId - The tab ID to get logs from
   * @param options - Optional filter and limit options
   * @returns An object with success status and either the logs or an error message
   */
  public getConsoleLogs(
    tabId: string,
    options?: GetConsoleLogsOptions,
  ): {
    success: boolean;
    logs?: ConsoleLogEntry[];
    totalCount?: number;
    error?: string;
  } {
    const tab = this.resolveTabById(tabId);

    if (!tab) {
      return {
        success: false,
        error: `Tab not found: "${tabId}". Check browser-information for available tabs.`,
      };
    }

    const logs = tab.getConsoleLogs(options);
    const totalCount = tab.getConsoleLogCount();

    return {
      success: true,
      logs,
      totalCount,
    };
  }

  /**
   * Clears console logs for the specified tab.
   *
   * @param tabId - The tab ID to clear logs for
   * @returns An object with success status or an error message
   */
  public clearConsoleLogs(tabId: string): {
    success: boolean;
    error?: string;
  } {
    const tab = this.resolveTabById(tabId);

    if (!tab) {
      return {
        success: false,
        error: `Tab not found: "${tabId}". Check browser-information for available tabs.`,
      };
    }

    tab.clearConsoleLogs();
    return { success: true };
  }
}
