import { BaseWindow, app, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import { getHotkeyDefinitionForEvent } from '@shared/hotkeys';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import type { GlobalDataPathService } from '../global-data-path';
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
import { SessionPermissionRegistry } from './tab-permission-handler/session-registry';

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
  isFullScreen: boolean;
}

export class WindowLayoutService extends DisposableService {
  private readonly logger: Logger;
  private readonly globalDataPathService: GlobalDataPathService;
  private readonly historyService: HistoryService;
  private readonly faviconService: FaviconService;
  private readonly pagesService: PagesService;
  private readonly preferencesService: PreferencesService;

  private baseWindow: BaseWindow | null = null;
  private uiController: UIController | null = null;
  private tabs: Record<string, TabController> = {};
  private activeTabId: string | null = null;
  private chatStateController: ChatStateController | null = null;

  private currentWebContentBounds: Electron.Rectangle | null = null;
  private isWebContentInteractive = true;

  // HTML5 content fullscreen tracking
  private contentFullscreenTabId: string | null = null;

  private saveStateTimeout: NodeJS.Timeout | null = null;
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
            titleBarOverlay: { color: string; symbolColor: string };
          };
        },
      ) => void)
    | null = null;

  private constructor(
    logger: Logger,
    globalDataPathService: GlobalDataPathService,
    historyService: HistoryService,
    faviconService: FaviconService,
    pagesService: PagesService,
    preferencesService: PreferencesService,
  ) {
    super();
    this.logger = logger;
    this.globalDataPathService = globalDataPathService;
    this.historyService = historyService;
    this.faviconService = faviconService;
    this.pagesService = pagesService;
    this.preferencesService = preferencesService;
  }

  public static async create(
    logger: Logger,
    globalDataPathService: GlobalDataPathService,
    historyService: HistoryService,
    faviconService: FaviconService,
    pagesService: PagesService,
    preferencesService: PreferencesService,
  ): Promise<WindowLayoutService> {
    const instance = new WindowLayoutService(
      logger,
      globalDataPathService,
      historyService,
      faviconService,
      pagesService,
      preferencesService,
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

    this.uiController = new UIController(this.logger);
    this.uiController.setCheckFrameValidityHandler(
      this.handleCheckFrameValidity.bind(this),
    );
    this.uiController.setCheckElementExistsHandler(
      this.handleCheckElementExists.bind(this),
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
      titleBarStyle: 'hidden',
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
      ...(process.platform !== 'darwin'
        ? {
            titleBarOverlay: {
              color: initialTheme.titleBarOverlay.color,
              symbolColor: initialTheme.titleBarOverlay.symbolColor,
              height: 40,
            },
          }
        : {}),
      trafficLightPosition: { x: 15, y: 15 },
      backgroundMaterial: 'mica',
      backgroundColor: initialTheme.background,
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
    });

    // Listen for OS theme changes and update window colors accordingly
    nativeTheme.on('updated', () => {
      this.applyThemeColors();
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
        history: [],
        contextSelectionMode: false,
        activeSelectionMessageId: null,
        selectedElementsByMessageId: {},
        hoveredElement: null,
        viewportSize: null,
        pendingElementScreenshotsByMessageId: {},
      };
      draft.appInfo.isFullScreen = this.baseWindow?.isFullScreen() ?? false;
      draft.appInfo.otherVersions = { ...process.versions, modules: undefined };
    });

    // Initialize ChatStateController
    this.chatStateController = new ChatStateController(
      this.uiKarton,
      this.tabs,
    );

    // Determine initial tab URL based on startup page preference
    const preferences = this.preferencesService.get();
    const startupPage = preferences.general.startupPage;
    const initialUrl =
      startupPage.type === 'custom' && startupPage.customUrl
        ? startupPage.customUrl
        : HOME_PAGE_URL;

    // Create initial tab with the appropriate URL
    this.createTab(initialUrl, true);

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
    this.uiController.on('toggleDevTools', this.handleToggleDevTools);
    this.uiController.on('openDevTools', this.handleOpenDevTools);
    this.uiController.on('closeDevTools', this.handleCloseDevTools);
    this.uiController.on('setAudioMuted', this.handleSetAudioMuted);
    this.uiController.on('toggleAudioMuted', this.handleToggleAudioMuted);
    this.uiController.on('setColorScheme', this.handleSetColorScheme);
    this.uiController.on('cycleColorScheme', this.handleCycleColorScheme);
    this.uiController.on('setZoomPercentage', this.handleSetZoomPercentage);
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
    this.uiController.on(
      'clearPendingScreenshots',
      this.handleClearPendingScreenshots,
    );
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

  private handleCreateTab = async (
    url?: string,
    setActive?: boolean,
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

    // For internal pages, check if a non-active tab with the same URL already exists
    // If the active tab already has this URL, we still create a new tab (user explicitly wants another)
    if (targetUrl?.startsWith('stagewise://')) {
      const existingTab = Object.entries(this.tabs).find(
        ([id, tab]) =>
          id !== this.activeTabId && tab.getState().url === targetUrl,
      );

      if (existingTab) {
        const [existingTabId] = existingTab;
        await this.handleSwitchTab(existingTabId);
        return;
      }
    }

    await this.createTab(targetUrl, setActive ?? true, sourceTabId);
  };

  private async createTab(
    url: string | undefined,
    setActive: boolean,
    sourceTabId?: string,
  ): Promise<string> {
    const id = randomUUID();

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
        void this.handleCreateTab(resolvedUrl, setActive, id);
      },
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
      const def = getHotkeyDefinitionForEvent(keyDownEvent as KeyboardEvent);
      if (def) this.uiController?.forwardKeyDownEvent(keyDownEvent);
    });

    tab.on('tabFocused', (id) => {
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
      const messageId =
        this.uiKarton.state.browser.activeSelectionMessageId ?? 'main';
      this.chatStateController?.addElement(element, messageId);
    });

    tab.on('elementScreenshotCaptured', (screenshot) => {
      // Add screenshot to pending list for UI to pick up, scoped by active message ID
      const messageId =
        this.uiKarton.state.browser.activeSelectionMessageId ?? 'main';
      this.uiKarton.setState((draft) => {
        if (!draft.browser.pendingElementScreenshotsByMessageId[messageId])
          draft.browser.pendingElementScreenshotsByMessageId[messageId] = [];

        draft.browser.pendingElementScreenshotsByMessageId[messageId].push({
          id: randomUUID(),
          elementId: screenshot.elementId,
          dataUrl: screenshot.dataUrl,
        });
      });
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

    // Reinforce z-order after adding new tab view to ensure UI webcontent stays on top
    // (or tab content if isWebContentInteractive is true)
    this.updateZOrder();

    // Only activate new tab if requested AND source tab is active (or no source tab)
    // This prevents background tabs from stealing focus when they open links
    const shouldActivate =
      setActive && (!sourceTabId || sourceTabId === this.activeTabId);
    if (shouldActivate) await this.handleSwitchTab(id);

    return id;
  }

  private handleCloseTab = async (tabId: string) => {
    const tab = this.tabs[tabId];
    if (tab) {
      // Get tab order before deletion to determine next/previous tab
      const tabIdsBeforeDeletion = Object.keys(this.tabs);
      const currentIndex = tabIdsBeforeDeletion.indexOf(tabId);
      const isActiveTab = this.activeTabId === tabId;

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

      // Clean up Karton state
      this.uiKarton.setState((draft) => {
        delete draft.browser.tabs[tabId];
      });

      if (isActiveTab) {
        // Get remaining tabs after deletion
        const remainingTabIds = Object.keys(this.tabs);

        // Try next tab first
        let nextTabId: string | undefined;
        if (currentIndex < remainingTabIds.length) {
          // Next tab is at the same index (since we removed current)
          nextTabId = remainingTabIds[currentIndex];
        } else if (currentIndex > 0) {
          // If no next tab, try previous tab
          nextTabId = remainingTabIds[currentIndex - 1];
        }

        if (nextTabId) {
          await this.handleSwitchTab(nextTabId);
        } else {
          // If no other tabs exist, create a new one
          const preferences = this.preferencesService.get();
          const newTabPage = preferences.general.newTabPage;
          const initialUrl =
            newTabPage.type === 'custom' && newTabPage.customUrl
              ? newTabPage.customUrl
              : HOME_PAGE_URL;
          await this.createTab(initialUrl, true);
        }
      }
    }
  };

  private handleSwitchTab = async (tabId: string) => {
    if (!this.tabs[tabId]) return;

    const previousTabId = this.activeTabId;

    // If previous tab was in content fullscreen, exit it
    if (previousTabId && this.contentFullscreenTabId === previousTabId) {
      await this.tabs[previousTabId]?.exitContentFullscreen();
      // The contentFullscreenChanged handler will clean up state
    }

    // Hide current tab and restore border radius (in case it was in fullscreen)
    if (previousTabId && this.tabs[previousTabId]) {
      this.tabs[previousTabId]!.setVisible(false);
      this.tabs[previousTabId]!.setBorderRadiusForFullscreen(4);
    }

    this.activeTabId = tabId;
    const newTab = this.tabs[tabId]!;

    // Check if new tab is in content fullscreen
    if (newTab.getState().isContentFullscreen) {
      // Apply fullscreen bounds
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
    }

    this.updateZOrder();

    // Set viewport size to the new tab's current viewport size
    // Don't set to null and wait for event - the event only fires on size CHANGE
    this.uiKarton.setState((draft) => {
      draft.browser.activeTabId = tabId;
      draft.browser.viewportSize = newTab.getViewportSize();
    });
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
    this.isWebContentInteractive = panel === 'tab-content';
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
        tab.setBorderRadiusForFullscreen(4);

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
    if (panel === 'stagewise-ui') this.uiController?.focus();
    else this.activeTab?.focus();
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

  private handleToggleDevTools = async (tabId?: string) => {
    this.logger.debug(
      `[WindowLayoutService] handleToggleDevTools called with tabId: ${tabId}`,
    );
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.toggleDevTools();
  };

  private handleOpenDevTools = async (tabId?: string) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.openDevTools();
  };

  private handleCloseDevTools = async (tabId?: string) => {
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    tab?.closeDevTools();
  };

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

  private handleSetContextSelectionMode = async (
    active: boolean,
    messageId?: string,
  ) => {
    const finalMessageId = messageId ?? 'main';
    const currentMessageId =
      this.uiKarton.state.browser.activeSelectionMessageId;
    const isAlreadyActive = this.uiKarton.state.browser.contextSelectionMode;

    // If activating for a different message ID while another is active, deactivate first
    if (
      active &&
      isAlreadyActive &&
      currentMessageId &&
      currentMessageId !== finalMessageId
    ) {
      // Turn off for the currently active message ID
      this.uiKarton.setState((draft) => {
        draft.browser.contextSelectionMode = false;
        draft.browser.activeSelectionMessageId = null;
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
      // Track which message ID is currently selecting (null when inactive)
      draft.browser.activeSelectionMessageId = active ? finalMessageId : null;
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

  private handleRemoveElement = (elementId: string, messageId: string) => {
    this.chatStateController?.removeElement(elementId, messageId);
  };

  private handleClearElements = (messageId: string) => {
    this.chatStateController?.clearElements(messageId);
  };

  private handleClearPendingScreenshots = (messageId: string) => {
    this.uiKarton.setState((draft) => {
      draft.browser.pendingElementScreenshotsByMessageId[messageId] = [];
    });
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

  // Window State Management (same as before)
  private get windowStatePath(): string {
    return path.join(
      this.globalDataPathService.globalDataPath,
      'window-state.json',
    );
  }

  private loadWindowState(): WindowState | null {
    try {
      const statePath = this.windowStatePath;
      if (fs.existsSync(statePath)) {
        const data = fs.readFileSync(statePath, 'utf-8');
        return JSON.parse(data) as WindowState;
      }
    } catch (error) {
      this.logger.error(
        '[WindowLayoutService] Failed to load window state',
        error,
      );
    }
    return null;
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

      fs.writeFileSync(this.windowStatePath, JSON.stringify(state));
    } catch (error) {
      this.logger.error(
        '[WindowLayoutService] Failed to save window state',
        error,
      );
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

    this.baseWindow.setBackgroundColor(theme.background);

    // titleBarOverlay is only used on non-macOS platforms
    if (process.platform !== 'darwin') {
      this.baseWindow.setTitleBarOverlay({
        color: theme.titleBarOverlay.color,
        symbolColor: theme.titleBarOverlay.symbolColor,
      });
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
      titleBarOverlay: { color: string; symbolColor: string };
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

    this.baseWindow.setBackgroundColor(colors.theme.background);

    // titleBarOverlay is only used on non-macOS platforms
    if (process.platform !== 'darwin') {
      this.baseWindow.setTitleBarOverlay({
        color: colors.theme.titleBarOverlay.color,
        symbolColor: colors.theme.titleBarOverlay.symbolColor,
      });
    }

    this.logger.debug(
      `[WindowLayoutService] Applied dynamic ${colors.isDark ? 'dark' : 'light'} theme colors: bg=${colors.theme.background}`,
    );
  }

  // =========================================================================
  // Agent Browser Tools
  // =========================================================================

  /**
   * Resolves a tab handle (e.g., "t_1") or UUID to a TabController instance.
   * Handles can be used by the agent for easier addressing.
   *
   * @param tabHandleOrId - Either a handle like "t_1" or a UUID
   * @returns The TabController instance or null if not found
   */
  private resolveTabByHandleOrId(tabHandleOrId: string): TabController | null {
    // First, try direct ID lookup (for UUIDs)
    if (this.tabs[tabHandleOrId]) return this.tabs[tabHandleOrId];

    // Then, try to find by handle
    for (const tab of Object.values(this.tabs))
      if (tab.handle === tabHandleOrId) return tab;

    return null;
  }

  /**
   * Executes a JavaScript expression in the console of the specified tab.
   *
   * @param expression - The JavaScript expression to execute
   * @param tabHandleOrId - Tab handle (e.g., "t_1") or UUID to execute the script on
   * @returns An object with success status and either the result or an error message
   */
  public async executeConsoleScript(
    expression: string,
    tabHandleOrId: string,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const tab = this.resolveTabByHandleOrId(tabHandleOrId);

    if (!tab) {
      return {
        success: false,
        error: `Tab not found: "${tabHandleOrId}". Check browser-information for available tabs.`,
      };
    }

    return await tab.executeConsoleScript(expression);
  }

  /**
   * Gets console logs from the specified tab with optional filtering.
   *
   * @param tabHandleOrId - Tab handle (e.g., "t_1") or UUID to get logs from
   * @param options - Optional filter and limit options
   * @returns An object with success status and either the logs or an error message
   */
  public getConsoleLogs(
    tabHandleOrId: string,
    options?: GetConsoleLogsOptions,
  ): {
    success: boolean;
    logs?: ConsoleLogEntry[];
    totalCount?: number;
    error?: string;
  } {
    const tab = this.resolveTabByHandleOrId(tabHandleOrId);

    if (!tab) {
      return {
        success: false,
        error: `Tab not found: "${tabHandleOrId}". Check browser-information for available tabs.`,
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
   * @param tabHandleOrId - Tab handle (e.g., "t_1") or UUID to clear logs for
   * @returns An object with success status or an error message
   */
  public clearConsoleLogs(tabHandleOrId: string): {
    success: boolean;
    error?: string;
  } {
    const tab = this.resolveTabByHandleOrId(tabHandleOrId);

    if (!tab) {
      return {
        success: false,
        error: `Tab not found: "${tabHandleOrId}". Check browser-information for available tabs.`,
      };
    }

    tab.clearConsoleLogs();
    return { success: true };
  }
}
