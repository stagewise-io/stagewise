import { BaseWindow, app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { KartonService } from '../karton';
import type { Logger } from '../logger';
import type { GlobalDataPathService } from '../global-data-path';
import { UIController } from './ui-controller';
import { TabController, type TabState } from './tab-controller';

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
  private kartonService: KartonService;
  private globalDataPathService: GlobalDataPathService;

  private baseWindow: BaseWindow | null = null;
  private uiController: UIController | null = null;
  private tabs: Map<string, TabController> = new Map();
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

  constructor(
    logger: Logger,
    kartonService: KartonService,
    globalDataPathService: GlobalDataPathService,
  ) {
    this.logger = logger;
    this.kartonService = kartonService;
    this.globalDataPathService = globalDataPathService;

    this.logger.debug('[WindowLayoutService] Initializing service');

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
      trafficLightPosition: { x: 14, y: 14 },
      backgroundMaterial: 'mica',
      backgroundColor: '#ff4f4f5',
      transparent: true,
      roundedCorners: true,
      closable: true,
      frame: false,
    });

    if (savedState?.isMaximized) {
      this.baseWindow.maximize();
    }

    if (savedState?.isFullScreen) {
      this.baseWindow.setFullScreen(true);
    }

    this.uiController = new UIController(this.logger, this.kartonService);
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
    this.baseWindow.on('enter-full-screen', () =>
      this.scheduleWindowStateSave(),
    );
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
    this.kartonService.setState((draft) => {
      draft.browser = {
        tabs: {},
        activeTabId: null,
        history: [],
        contextSelectionMode: false,
      };
    });

    // Create initial tab
    this.createTab('https://google.com', true);

    this.logger.debug('[WindowLayoutService] Service initialized');
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
      this.tabs.forEach((tab) => {
        this.baseWindow!.contentView.removeChildView(tab.getViewContainer());
        tab.destroy();
      });
      this.baseWindow.destroy();
    }

    this.tabs.clear();
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
        this.kartonService.setTransportPort(event.ports[0]);
      }
    };
    ipcMain.on('karton-connect', this.kartonConnectListener);
    this.logger.debug(
      '[WindowLayoutService] Listening for karton connection requests',
    );
  }

  private setupUIControllerListeners() {
    if (!this.uiController) return;

    this.uiController.on('create-tab', this.handleCreateTab);
    this.uiController.on('close-tab', this.handleCloseTab);
    this.uiController.on('switch-tab', this.handleSwitchTab);
    this.uiController.on('layout-update', this.handleLayoutUpdate);
    this.uiController.on(
      'interactivity-change',
      this.handleInteractivityChange,
    );
    this.uiController.on('stop', this.handleStop);
    this.uiController.on('reload', this.handleReload);
    this.uiController.on('goto', this.handleGoto);
    this.uiController.on('go-back', this.handleGoBack);
    this.uiController.on('go-forward', this.handleGoForward);
    this.uiController.on('toggle-dev-tools', this.handleToggleDevTools);
    this.uiController.on('open-dev-tools', this.handleOpenDevTools);
    this.uiController.on('close-dev-tools', this.handleCloseDevTools);
    this.uiController.on(
      'set-context-selection-mode',
      this.handleSetContextSelectionMode,
    );
  }

  private get activeTab(): TabController | undefined {
    if (!this.activeTabId) return undefined;
    return this.tabs.get(this.activeTabId);
  }

  private handleCreateTab = async (url?: string) => {
    await this.createTab(url, true);
  };

  private async createTab(url: string | undefined, setActive: boolean) {
    const id = randomUUID();
    const tab = new TabController(id, this.logger, url);

    // Subscribe to state updates
    tab.on('state-updated', (updates: Partial<TabState>) => {
      this.kartonService.setState((draft) => {
        const tabState = draft.browser.tabs[id];
        if (tabState) {
          Object.assign(tabState, updates);
        }
      });
    });

    this.tabs.set(id, tab);

    // Initialize state in Karton
    this.kartonService.setState((draft) => {
      draft.browser.tabs[id] = {
        id,
        ...tab.getState(),
      };
    });

    // Initially hide
    tab.setVisible(false);
    this.baseWindow!.contentView.addChildView(tab.getViewContainer());

    if (setActive) {
      await this.handleSwitchTab(id);
    }
  }

  private handleCloseTab = async (tabId: string) => {
    const tab = this.tabs.get(tabId);
    if (tab) {
      this.baseWindow!.contentView.removeChildView(tab.getViewContainer());
      tab.destroy();
      this.tabs.delete(tabId);

      // Clean up Karton state
      this.kartonService.setState((draft) => {
        delete draft.browser.tabs[tabId];
      });

      if (this.activeTabId === tabId) {
        // Switch to another tab if available
        const firstTab = this.tabs.keys().next().value;
        if (firstTab) {
          await this.handleSwitchTab(firstTab);
        } else {
          this.activeTabId = null;
          this.kartonService.setState((draft) => {
            draft.browser.activeTabId = null;
          });
        }
      }
    }
  };

  private handleSwitchTab = async (tabId: string) => {
    if (!this.tabs.has(tabId)) return;

    // Hide current
    if (this.activeTabId && this.tabs.has(this.activeTabId)) {
      this.tabs.get(this.activeTabId)!.setVisible(false);
    }

    this.activeTabId = tabId;
    const newTab = this.tabs.get(tabId)!;

    if (this.currentWebContentBounds) {
      newTab.setBounds(this.currentWebContentBounds);
      newTab.setVisible(true);
    } else {
      // If no bounds set yet, keep invisible until layout update
      newTab.setVisible(false);
    }

    this.updateZOrder();

    this.kartonService.setState((draft) => {
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

  private handleInteractivityChange = async (interactive: boolean) => {
    this.isWebContentInteractive = interactive;
    this.updateZOrder();
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
    const tab = tabId ? this.tabs.get(tabId) : this.activeTab;
    tab?.stop();
  };

  private handleReload = async (tabId?: string) => {
    const tab = tabId ? this.tabs.get(tabId) : this.activeTab;
    tab?.reload();
  };

  private handleGoto = async (url: string, tabId?: string) => {
    this.logger.debug(
      `[WindowLayoutService] handleGoto called with url: ${url}, tabId: ${tabId}, activeTabId: ${this.activeTabId}`,
    );
    const tab = tabId ? this.tabs.get(tabId) : this.activeTab;
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
    const tab = tabId ? this.tabs.get(tabId) : this.activeTab;
    tab?.goBack();
  };

  private handleGoForward = async (tabId?: string) => {
    this.logger.debug(
      `[WindowLayoutService] handleGoForward called with tabId: ${tabId}`,
    );
    const tab = tabId ? this.tabs.get(tabId) : this.activeTab;
    tab?.goForward();
  };

  private handleToggleDevTools = async (tabId?: string) => {
    this.logger.debug(
      `[WindowLayoutService] handleToggleDevTools called with tabId: ${tabId}`,
    );
    const tab = tabId ? this.tabs.get(tabId) : this.activeTab;
    tab?.toggleDevTools();
  };

  private handleOpenDevTools = async (tabId?: string) => {
    const tab = tabId ? this.tabs.get(tabId) : this.activeTab;
    tab?.openDevTools();
  };

  private handleCloseDevTools = async (tabId?: string) => {
    const tab = tabId ? this.tabs.get(tabId) : this.activeTab;
    tab?.closeDevTools();
  };

  private handleSetContextSelectionMode = async (active: boolean) => {
    this.kartonService.setState((draft) => {
      draft.browser.contextSelectionMode = active;
    });
    this.activeTab?.setContextSelectionMode(active);
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
}
