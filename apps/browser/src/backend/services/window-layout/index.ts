import { BaseWindow, app, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import { getHotkeyDefinitionForEvent } from '@shared/hotkeys';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import type { GlobalDataPathService } from '../global-data-path';
import { UIController } from './ui-controller';
import { TabController } from './tab-controller';
import { ChatStateController } from './chat-state-controller';
import type { ColorScheme } from '@shared/karton-contracts/ui';
import { THEME_COLORS, getBackgroundColor } from '@/shared/theme-colors';

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
  isFullScreen: boolean;
}

export class WindowLayoutService {
  private logger: Logger;
  private globalDataPathService: GlobalDataPathService;

  private baseWindow: BaseWindow | null = null;
  private uiController: UIController | null = null;
  private tabs: Record<string, TabController> = {};
  private activeTabId: string | null = null;
  private chatStateController: ChatStateController | null = null;

  private currentWebContentBounds: Electron.Rectangle | null = null;
  private isWebContentInteractive = true;

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

  private constructor(
    logger: Logger,
    globalDataPathService: GlobalDataPathService,
  ) {
    this.logger = logger;
    this.globalDataPathService = globalDataPathService;
  }

  public static async create(
    logger: Logger,
    globalDataPathService: GlobalDataPathService,
  ): Promise<WindowLayoutService> {
    const instance = new WindowLayoutService(logger, globalDataPathService);
    await instance.initialize();
    return instance;
  }

  private async initialize() {
    this.logger.debug('[WindowLayoutService] Initializing service');
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
      title: 'stagewise',
      titleBarStyle: 'hidden',
      show: false, // Don't show until UI is ready to prevent visual glitches
      // fullscreenable: false,
      ...(process.platform !== 'darwin'
        ? {
            titleBarOverlay: {
              color: initialTheme.titleBarOverlay.color,
              symbolColor: initialTheme.titleBarOverlay.symbolColor,
              height: 40,
            },
          }
        : {}),
      trafficLightPosition: { x: 14, y: 16 },
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
        selectedElements: [],
        hoveredElement: null,
        viewportSize: null,
        isSearchBarActive: false,
      };
      draft.appInfo.isFullScreen = this.baseWindow?.isFullScreen() ?? false;
    });

    // Initialize ChatStateController
    this.chatStateController = new ChatStateController(
      this.uiKarton,
      this.tabs,
    );

    // Create initial tab
    this.createTab('ui-main', true);

    this.logger.debug('[WindowLayoutService] Service initialized');
  }

  public get uiKarton(): KartonService {
    if (!this.uiController) {
      throw new Error('UIController is not initialized or has been torn down');
    }
    return this.uiController.uiKarton;
  }

  public teardown() {
    this.logger.debug('[WindowLayoutService] Teardown called');

    // We no longer register procedures directly, UIController does (and should unregister if needed)
    // But UIController doesn't have a clean unregister method that works perfectly yet.
    // Assuming UIController lifecycle is tied to this service.

    if (this.kartonConnectListener) {
      ipcMain.removeListener('karton-connect', this.kartonConnectListener);
      this.kartonConnectListener = null;
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
   * Opens a URL in a new tab, or navigates the active tab if it's a new/default tab.
   * A tab is considered "new" if it's the only tab and is on the default URL (ui-main).
   */
  public async openUrl(url: string): Promise<void> {
    this.logger.debug(`[WindowLayoutService] openUrl called with url: ${url}`);

    // Check if we should reuse the active tab (if it's new/default)
    const shouldReuseActiveTab =
      this.activeTab &&
      Object.keys(this.tabs).length === 1 &&
      this.activeTab.getState().url === 'ui-main' &&
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
      if (connectionId === 'ui-main') {
        this.uiKarton.setTransportPort(event.ports[0]);
      } else if (connectionId === 'tab') {
        this.logger.debug(
          `[WindowLayoutService] Received karton connection request for tab connection...`,
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
        }
      }
    };
    ipcMain.on('karton-connect', this.kartonConnectListener);
    this.logger.debug(
      '[WindowLayoutService] Listening for karton connection requests',
    );
  }

  private setupUIControllerListeners() {
    if (!this.uiController) return;

    this.uiController.on('uiReady', this.handleUIReady);
    this.uiController.on('createTab', this.handleCreateTab);
    this.uiController.on('closeTab', this.handleCloseTab);
    this.uiController.on('switchTab', this.handleSwitchTab);
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
  }

  private get activeTab(): TabController | undefined {
    if (!this.activeTabId) return undefined;
    return this.tabs[this.activeTabId];
  }

  private handleCreateTab = async (url?: string, setActive?: boolean) => {
    await this.createTab(url, setActive ?? true);
  };

  private async createTab(url: string | undefined, setActive: boolean) {
    const id = randomUUID();
    const tab = new TabController(
      id,
      this.logger,
      url,
      (newUrl: string, setActive?: boolean) => {
        void this.handleCreateTab(newUrl, setActive);
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

    this.tabs[id] = tab;

    // Update ChatStateController tabs reference
    this.chatStateController?.updateTabsReference(this.tabs);

    // Initialize state in Karton
    this.uiKarton.setState((draft) => {
      draft.browser.tabs[id] = {
        id,
        ...tab.getState(),
      };
    });

    // Initially hide
    tab.setVisible(false);
    this.baseWindow!.contentView.addChildView(tab.getViewContainer());

    // Reinforce z-order after adding new tab view to ensure UI webcontent stays on top
    // (or tab content if isWebContentInteractive is true)
    this.updateZOrder();

    if (setActive) await this.handleSwitchTab(id);
  }

  private handleCloseTab = async (tabId: string) => {
    const tab = this.tabs[tabId];
    if (tab) {
      // Get tab order before deletion to determine next/previous tab
      const tabIdsBeforeDeletion = Object.keys(this.tabs);
      const currentIndex = tabIdsBeforeDeletion.indexOf(tabId);
      const isActiveTab = this.activeTabId === tabId;

      this.baseWindow!.contentView.removeChildView(tab.getViewContainer());
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
          await this.createTab('ui-main', true);
        }
      }
    }
  };

  private handleSwitchTab = async (tabId: string) => {
    if (!this.tabs[tabId]) return;

    // Hide current
    if (this.activeTabId && this.tabs[this.activeTabId]) {
      this.tabs[this.activeTabId]!.setVisible(false);
    }

    this.activeTabId = tabId;
    const newTab = this.tabs[tabId]!;

    if (this.currentWebContentBounds) {
      newTab.setBounds(this.currentWebContentBounds);
      newTab.setVisible(true);
      this.updateZOrder();
    } else {
      // If no bounds set yet, keep invisible until layout update
      newTab.setVisible(false);
    }

    // Clear viewport size - it will be updated by the new tab's tracking
    this.uiKarton.setState((draft) => {
      draft.browser.activeTabId = tabId;
      draft.browser.viewportSize = null;
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

  private handleTogglePanelKeyboardFocus = async (
    panel: 'stagewise-ui' | 'tab-content',
  ) => {
    if (panel === 'stagewise-ui') this.uiController?.focus();
    else this.activeTab?.focus();
  };

  private updateZOrder() {
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

  private handleGoto = async (url: string, tabId?: string) => {
    this.logger.debug(
      `[WindowLayoutService] handleGoto called with url: ${url}, tabId: ${tabId}, activeTabId: ${this.activeTabId}`,
    );
    const tab = tabId ? this.tabs[tabId] : this.activeTab;
    if (tab) {
      tab.loadURL(url);
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

  private handleSetContextSelectionMode = async (active: boolean) => {
    this.uiKarton.setState((draft) => {
      draft.browser.contextSelectionMode = active;
    });
    this.activeTab?.setContextSelectionMode(active).catch((err) => {
      this.logger.error(
        `[WindowLayoutService] Failed to set context selection mode: ${err}`,
      );
    });
  };

  private handleSelectHoveredElement = () => {
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

  private handleRemoveElement = (elementId: string) => {
    this.chatStateController?.removeElement(elementId);
  };

  private handleClearElements = () => {
    this.chatStateController?.clearElements();
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
    this.uiKarton.setState((draft) => {
      draft.browser.isSearchBarActive = true;
    });
  };

  private handleDeactivateSearchBar = () => {
    this.uiKarton.setState((draft) => {
      draft.browser.isSearchBarActive = false;
    });
    // Also stop any active search
    this.activeTab?.stopSearch();
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
  }

  private applyThemeColors() {
    if (!this.baseWindow || this.baseWindow.isDestroyed()) return;

    const isDark = nativeTheme.shouldUseDarkColors;
    const theme = isDark ? THEME_COLORS.dark : THEME_COLORS.light;
    const backgroundColor = getBackgroundColor(isDark);

    this.baseWindow.setBackgroundColor(theme.background);

    // titleBarOverlay is only used on non-macOS platforms
    if (process.platform !== 'darwin') {
      this.baseWindow.setTitleBarOverlay({
        color: theme.titleBarOverlay.color,
        symbolColor: theme.titleBarOverlay.symbolColor,
      });
    }

    // Update all tab webcontents backgrounds to match the window background
    // Only update tabs that are in 'system' mode (forced light/dark tabs keep their background)
    Object.values(this.tabs).forEach((tab) => {
      const tabState = tab.getState();
      if (tabState.colorScheme === 'system') {
        tab.updateBackgroundColor(backgroundColor);
      }
    });

    this.logger.debug(
      `[WindowLayoutService] Applied ${isDark ? 'dark' : 'light'} theme colors to window and all tab webcontents`,
    );
  }
}
