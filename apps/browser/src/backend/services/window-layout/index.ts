import { BaseWindow, app, ipcMain } from 'electron';
import path from 'node:path';
import { getHotkeyDefinitionForEvent } from '@shared/hotkeys';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import type { GlobalDataPathService } from '../global-data-path';
import { UIController } from './ui-controller';
import { TabController } from './tab-controller';

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

  private currentWebContentBounds: Electron.Rectangle | null = null;
  private isWebContentInteractive = true;

  private saveStateTimeout: NodeJS.Timeout | null = null;
  private lastNonMaximizedBounds: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  } | null = null;

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

    this.baseWindow = new BaseWindow({
      width: this.lastNonMaximizedBounds.width,
      height: this.lastNonMaximizedBounds.height,
      x: this.lastNonMaximizedBounds.x,
      y: this.lastNonMaximizedBounds.y,
      title: 'stagewise',
      titleBarStyle: 'hiddenInset',
      // fullscreenable: false,
      ...(process.platform !== 'darwin'
        ? {
            titleBarOverlay: {
              color: '#e4e4e4',
              symbolColor: '#3f3f46',
              height: 64,
            },
          }
        : {}),
      trafficLightPosition: { x: 14, y: 16 },
      backgroundMaterial: 'mica',
      backgroundColor: '#e4e4e4',
      transparent: true,
      roundedCorners: true,
      closable: true,
      frame: false,
    });
    this.baseWindow.setWindowButtonVisibility(true);

    if (savedState?.isMaximized) {
      this.baseWindow.maximize();
    }

    if (savedState?.isFullScreen) {
      this.baseWindow.setFullScreen(true);
    }

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
    });
    this.baseWindow.on('leave-full-screen', () =>
      this.scheduleWindowStateSave(),
    );
    this.baseWindow.on('close', () => {
      this.saveWindowState();
    });

    app.on('second-instance', () => {
      if (this.baseWindow) {
        if (this.baseWindow.isMinimized()) this.baseWindow.restore();
        this.baseWindow.focus();
      }
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
      };
    });

    // Create initial tab
    this.createTab('https://google.com', true);

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
  }

  private get activeTab(): TabController | undefined {
    if (!this.activeTabId) return undefined;
    return this.tabs[this.activeTabId];
  }

  private handleCreateTab = async (url?: string) => {
    await this.createTab(url, true);
  };

  private async createTab(url: string | undefined, setActive: boolean) {
    const id = randomUUID();
    const tab = new TabController(id, this.logger, url);

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

    tab.on('elementHovered', (element) => {
      // Only update if this is the active tab
      if (this.activeTabId === id) {
        this.uiKarton.setState((draft) => {
          draft.browser.hoveredElement = element;
        });
      }
    });

    tab.on('elementSelected', (element) => {
      this.uiKarton.setState((draft) => {
        // Add if not exists
        if (
          !draft.browser.selectedElements.some(
            (e) => e.stagewiseId === element.stagewiseId,
          )
        ) {
          draft.browser.selectedElements.push(element);
        }
      });
      this.broadcastSelectionUpdate();
    });

    this.tabs[id] = tab;

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

    this.uiKarton.setState((draft) => {
      draft.browser.activeTabId = tabId;
    });
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
    // re-adding views moves them to the top
    if (this.isWebContentInteractive && this.activeTab) {
      // If interactive, web content is on top
      // Ensure UI is added first (bottom), then web content
      // But we can't easily reorder without removing/adding
      // Actually, if we just add child view again, it moves to end.
      this.baseWindow!.contentView.addChildView(
        this.activeTab.getViewContainer(),
      );
    } else {
      // UI on top
      this.baseWindow!.contentView.addChildView(this.uiController!.getView());
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

  private handleSetContextSelectionMode = async (active: boolean) => {
    this.uiKarton.setState((draft) => {
      draft.browser.contextSelectionMode = active;
    });
    this.activeTab?.setContextSelectionMode(active);
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
    this.uiKarton.setState((draft) => {
      draft.browser.selectedElements = draft.browser.selectedElements.filter(
        (e) => e.stagewiseId !== elementId,
      );
    });
    this.broadcastSelectionUpdate();
  };

  private handleClearElements = () => {
    this.uiKarton.setState((draft) => {
      draft.browser.selectedElements = [];
    });
    this.broadcastSelectionUpdate();
  };

  private broadcastSelectionUpdate() {
    const state = this.uiKarton.state;
    const selectedElements = state.browser.selectedElements;
    Object.values(this.tabs).forEach((tab) => {
      tab.updateContextSelection(selectedElements);
    });
  }

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
}
