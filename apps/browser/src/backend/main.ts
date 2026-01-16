/**
 * This file stores the main setup for the CLI.
 */

import { app } from 'electron';
import { AuthService } from './services/auth';
import { AgentService } from './services/agent/agent';
import { UserExperienceService } from './services/experience';
import { WorkspaceService } from './services/workspace';
import { FilePickerService } from './services/file-picker';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { AppMenuService } from './services/app-menu';
import { URIHandlerService } from './services/uri-handler';
import { IdentifierService } from './services/identifier';
import { GlobalDataPathService } from './services/global-data-path';
import { Logger } from './services/logger';
import { TelemetryService } from './services/telemetry';
import { GlobalConfigService } from './services/global-config';
import { PreferencesService } from './services/preferences';
import { NotificationService } from './services/notification';
import { PagesService } from './services/pages';
import { WindowLayoutService } from './services/window-layout';
import { HistoryService } from './services/history';
import { FaviconService } from './services/favicon';
import { WebDataService } from './services/webdata';
import { DownloadsService } from './services/download-manager';
import { AutoUpdateService } from './services/auto-update';
import {
  DownloadState,
  type DownloadSpeedDataPoint,
} from '@shared/karton-contracts/pages-api/types';
import type { DownloadSummary } from '@shared/karton-contracts/ui';
import { ensureRipgrepInstalled } from '@stagewise/agent-runtime-node';
import { shell } from 'electron';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';

export type MainParameters = {
  launchOptions: {
    verbose?: boolean;
  };
};

export async function main({ launchOptions: { verbose } }: MainParameters) {
  // In this file you can include the rest of your app's specific main process
  // code. You can also put them in separate files and import them here.
  const logger = new Logger(verbose ?? false);

  const globalDataPathService = await GlobalDataPathService.create(logger);

  // Create database services early so they can be passed to other services
  // WebDataService must be created first as HistoryService depends on it
  // for search term extraction (keyword IDs reference the keywords table)
  const webDataService = await WebDataService.create(
    logger,
    globalDataPathService,
  );
  const historyService = await HistoryService.create(
    logger,
    globalDataPathService,
    webDataService,
  );
  const faviconService = await FaviconService.create(
    logger,
    globalDataPathService,
  );

  // Create DownloadsService to track active downloads for pause/resume/cancel
  const downloadsService = await DownloadsService.create(
    logger,
    historyService,
  );

  // Create PreferencesService early so it can be passed to WindowLayoutService
  // This loads preferences from disk; Karton sync is connected later
  const preferencesService = await PreferencesService.create(logger);

  // Create PagesService early so it can be passed to WindowLayoutService
  const pagesService = await PagesService.create(
    logger,
    historyService,
    faviconService,
    downloadsService,
    webDataService,
  );

  // Initialize search engines state
  await pagesService.syncSearchEnginesState();

  // Create WindowLayoutService with all dependencies including PreferencesService
  // This also applies the startup page preference during initialization
  const windowLayoutService = await WindowLayoutService.create(
    logger,
    globalDataPathService,
    historyService,
    faviconService,
    pagesService,
    preferencesService,
  );
  const uiKarton = windowLayoutService.uiKarton;

  // Connect PreferencesService to Karton for reactive sync
  preferencesService.connectKarton(uiKarton, pagesService);

  // Sync search engines to UI Karton state (for omnibox to access)
  const syncSearchEnginesToUiKarton = async () => {
    const engines = await webDataService.getSearchEngines();
    uiKarton.setState((draft) => {
      draft.searchEngines = engines;
    });
  };
  await syncSearchEnginesToUiKarton();

  // Set up handler to sync search engines to UI Karton when they change
  pagesService.setOnSearchEnginesChangeHandler(syncSearchEnginesToUiKarton);

  // Set up downloads UI state updates
  // This callback updates the UI karton with running + recent finished downloads
  const MAX_DOWNLOADS_TO_SHOW = 5;

  // Cache for finished downloads to avoid database queries on every progress update
  let cachedFinishedDownloads: DownloadSummary[] = [];
  let finishedDownloadsDirty = true; // Start dirty to fetch on first call
  let previousActiveCount = 0;

  // Helper to mark finished downloads cache as dirty (needs refetch)
  const invalidateFinishedDownloadsCache = () => {
    finishedDownloadsDirty = true;
  };

  const updateUIDownloadsState = async (
    activeDownloads: {
      id: number;
      filename: string;
      progress: number;
      state: DownloadState;
      isPaused: boolean;
      targetPath: string;
      startTime: Date;
      currentSpeedKBps: number;
      speedHistory: DownloadSpeedDataPoint[];
    }[],
  ) => {
    const activeCount = activeDownloads.length;
    const finishedToFetch = Math.max(0, MAX_DOWNLOADS_TO_SHOW - activeCount);
    // Get lastSeenAt from DownloadsService (cached in the service)
    const lastSeenAt = downloadsService.getDownloadsLastSeenAt();

    // Build items from active downloads
    const items: DownloadSummary[] = activeDownloads.map((d) => ({
      id: d.id,
      filename: d.filename,
      progress: d.progress,
      isActive: true,
      state: d.state,
      isPaused: d.isPaused,
      targetPath: d.targetPath,
      startTime: d.startTime,
      currentSpeedKBps: d.currentSpeedKBps,
      speedHistory: d.speedHistory,
    }));

    let hasUnseenDownloads = false;

    // Detect if active count changed (download completed or new download started)
    // If so, we need to refetch finished downloads
    if (activeCount !== previousActiveCount) {
      finishedDownloadsDirty = true;
      previousActiveCount = activeCount;
    }

    // Fetch recent finished downloads only when cache is dirty
    if (finishedToFetch > 0 && finishedDownloadsDirty) {
      try {
        // Query all finished downloads (COMPLETE, CANCELLED, INTERRUPTED) - no state filter
        const allDownloads = await historyService.queryDownloads({
          limit: MAX_DOWNLOADS_TO_SHOW * 2, // Fetch extra to filter out IN_PROGRESS
        });

        // Filter to only include finished downloads (exclude IN_PROGRESS which might be stale)
        const finishedDownloads = allDownloads.filter(
          (d) => d.state !== DownloadState.IN_PROGRESS,
        );

        cachedFinishedDownloads = finishedDownloads
          .slice(0, MAX_DOWNLOADS_TO_SHOW)
          .map((d) => {
            // Use guid (parsed as number) as id for consistency with DownloadManager
            // This matches what PagesService does in getDownloads
            const parsedGuid = Number.parseInt(d.guid, 10);
            const downloadId = Number.isNaN(parsedGuid) ? d.id : parsedGuid;

            // Calculate progress - only show 100% for complete downloads
            const progress =
              d.state === DownloadState.COMPLETE
                ? 100
                : d.totalBytes > 0
                  ? Math.round((d.receivedBytes / d.totalBytes) * 100)
                  : 0;

            return {
              id: downloadId,
              filename: d.targetPath
                ? (d.targetPath.split('/').pop() ?? 'Unknown')
                : 'Unknown',
              progress,
              isActive: false,
              state: d.state,
              targetPath: d.targetPath,
              startTime: d.startTime,
              endTime: d.endTime ?? undefined,
            };
          });

        finishedDownloadsDirty = false;
      } catch (err) {
        logger.warn('[Main] Failed to fetch recent finished downloads', err);
      }
    }

    // Add finished downloads from cache (limited to finishedToFetch)
    if (finishedToFetch > 0) {
      for (const d of cachedFinishedDownloads.slice(0, finishedToFetch)) {
        // Skip if this download is already in active list (shouldn't happen but be safe)
        if (items.some((item) => item.id === d.id)) continue;

        // Check if this download is unseen (completed after lastSeenAt)
        if (d.endTime && (!lastSeenAt || d.endTime > lastSeenAt)) {
          hasUnseenDownloads = true;
        }

        items.push(d);
      }
    }

    // Update UI karton state
    uiKarton.setState((draft) => {
      draft.downloads = {
        items,
        activeCount,
        hasUnseenDownloads,
        lastSeenAt,
      };
    });
  };

  downloadsService.setOnUIDownloadsChange(updateUIDownloadsState);

  // Helper to map active downloads to UI format (avoids code duplication)
  const mapActiveDownloadsToUIFormat = () =>
    downloadsService.getActiveDownloads().map((d) => ({
      id: d.id,
      filename: d.filename,
      progress:
        d.totalBytes > 0
          ? Math.round((d.receivedBytes / d.totalBytes) * 100)
          : 0,
      state: d.state,
      isPaused: d.isPaused,
      targetPath: d.targetPath,
      startTime: d.startTime,
      currentSpeedKBps: d.currentSpeedKBps,
      speedHistory: d.speedHistory,
    }));

  // Shared handler for marking downloads as seen (used by both UI and pages-api contracts)
  const markDownloadsSeen = async () => {
    const now = new Date();
    await downloadsService.setDownloadsLastSeenAt(now);
    // Trigger state refresh to update hasUnseenDownloads
    await updateUIDownloadsState(mapActiveDownloadsToUIFormat()).catch(
      (err) => {
        logger.warn(
          '[Main] Failed to update downloads state after marking seen',
          err,
        );
      },
    );
  };

  // Register the markSeen procedure handler for UI contract
  uiKarton.registerServerProcedureHandler(
    'downloads.markSeen',
    async (_callingClientId: string) => markDownloadsSeen(),
  );

  // Register download control procedure handlers for UI contract
  uiKarton.registerServerProcedureHandler(
    'downloads.pause',
    async (_callingClientId: string, downloadId: number) => {
      const paused = downloadsService.pauseDownload(downloadId);
      if (paused) {
        return { success: true };
      }
      return {
        success: false,
        error: 'Download not found or cannot be paused',
      };
    },
  );

  uiKarton.registerServerProcedureHandler(
    'downloads.resume',
    async (_callingClientId: string, downloadId: number) => {
      const resumed = downloadsService.resumeDownload(downloadId);
      if (resumed) {
        return { success: true };
      }
      return {
        success: false,
        error: 'Download not found or cannot be resumed',
      };
    },
  );

  uiKarton.registerServerProcedureHandler(
    'downloads.cancel',
    async (_callingClientId: string, downloadId: number) => {
      const cancelled = await downloadsService.cancelDownload(downloadId);
      if (cancelled) {
        return { success: true };
      }
      return { success: false, error: 'Download not found' };
    },
  );

  // Helper to validate that a file path is a known download (security measure)
  const isKnownDownloadPath = async (filePath: string): Promise<boolean> => {
    try {
      // Query the database to verify this path belongs to a download
      const downloads = await historyService.queryDownloads({ limit: 1000 });
      return downloads.some((d) => d.targetPath === filePath);
    } catch {
      return false;
    }
  };

  uiKarton.registerServerProcedureHandler(
    'downloads.openFile',
    async (_callingClientId: string, filePath: string) => {
      try {
        if (!filePath) {
          return { success: false, error: 'No file path provided' };
        }
        // Validate the path is a known download (security check)
        const isKnown = await isKnownDownloadPath(filePath);
        if (!isKnown) {
          logger.warn('[Main] Attempted to open unknown file path', {
            filePath,
          });
          return { success: false, error: 'File is not a known download' };
        }
        if (!existsSync(filePath)) {
          return { success: false, error: 'File not found' };
        }
        const errorMessage = await shell.openPath(filePath);
        if (errorMessage) {
          return { success: false, error: errorMessage };
        }
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  );

  uiKarton.registerServerProcedureHandler(
    'downloads.showInFolder',
    async (_callingClientId: string, filePath: string) => {
      try {
        if (!filePath) {
          return { success: false, error: 'No file path provided' };
        }
        // Validate the path is a known download (security check)
        const isKnown = await isKnownDownloadPath(filePath);
        if (!isKnown) {
          logger.warn('[Main] Attempted to show unknown file path in folder', {
            filePath,
          });
          return { success: false, error: 'File is not a known download' };
        }
        if (!existsSync(filePath)) {
          return { success: false, error: 'File not found' };
        }
        shell.showItemInFolder(filePath);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  );

  uiKarton.registerServerProcedureHandler(
    'downloads.delete',
    async (_callingClientId: string, downloadId: number) => {
      try {
        // Cancel active download if in progress
        const activeDownload = downloadsService.getActiveDownload(downloadId);
        if (activeDownload) {
          await downloadsService.cancelDownload(downloadId);
        }

        // Get download info to find file path before deleting from DB
        const download = await historyService.getDownloadByGuid(
          `${downloadId}`,
        );
        const filePath = download?.targetPath;

        // Delete from database
        const deleted = await historyService.deleteDownloadByGuid(
          `${downloadId}`,
        );

        // Delete the file from disk if it exists
        if (filePath && existsSync(filePath)) {
          try {
            unlinkSync(filePath);
          } catch (err) {
            // Log but don't fail if file deletion fails
            logger.warn('[Main] Failed to delete download file', {
              filePath,
              error: err,
            });
          }
        }

        if (deleted) {
          // Invalidate cache since we deleted a download from DB
          invalidateFinishedDownloadsCache();
          // Trigger state refresh
          await updateUIDownloadsState(mapActiveDownloadsToUIFormat());
          return { success: true };
        }
        return { success: false, error: 'Download not found' };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  );

  // Set the markDownloadsSeen handler for pages-api contract
  pagesService.setMarkDownloadsSeenHandler(markDownloadsSeen);

  // Set the getPendingEdits handler for pages-api contract
  // This allows pages routes to fetch pending file edits from the main UI state
  pagesService.setGetPendingEditsHandler(async (chatId: string) => {
    const agentChat = uiKarton.state.agentChat;
    if (!agentChat || !agentChat.chats[chatId]) {
      return { found: false, edits: [] };
    }
    const pendingEdits = agentChat.chats[chatId].pendingEdits ?? [];
    const workspacePath = uiKarton.state.workspace?.path;
    return {
      found: true,
      edits: pendingEdits.map((edit) => ({
        // Convert absolute paths to relative paths for display in pages API
        path: workspacePath
          ? path.relative(workspacePath, edit.path)
          : edit.path,
        before: edit.before,
        after: edit.after,
      })),
    };
  });

  // Subscribe to UI Karton state changes to sync pending edits to Pages API state
  // This enables real-time updates in the diff-review page
  const previousPendingEditsSnapshot: Record<string, string> = {};
  const pendingEditsSyncCallback = (state: typeof uiKarton.state) => {
    const agentChat = state.agentChat;
    if (!agentChat) return;

    const workspacePath = state.workspace?.path;

    // Check each chat for pending edits changes
    for (const [chatId, chat] of Object.entries(agentChat.chats)) {
      const pendingEdits = chat.pendingEdits ?? [];
      // Create a simple snapshot key to detect changes (stringify paths)
      const snapshotKey = pendingEdits.map((e) => e.path).join(',');
      const previousKey = previousPendingEditsSnapshot[chatId] ?? '';

      if (snapshotKey !== previousKey) {
        previousPendingEditsSnapshot[chatId] = snapshotKey;
        // Push update to Pages API state
        pagesService.updatePendingEditsState(
          chatId,
          pendingEdits.map((edit) => ({
            // Convert absolute paths to relative paths for display in pages API
            path: workspacePath
              ? path.relative(workspacePath, edit.path)
              : edit.path,
            before: edit.before,
            after: edit.after,
          })),
        );
      }
    }
  };
  uiKarton.registerStateChangeCallback(pendingEditsSyncCallback);

  // Trigger initial load of downloads state (loads recent finished downloads)
  void updateUIDownloadsState([]);

  // Set up URL handlers
  setupUrlHandlers(windowLayoutService, logger);

  const notificationService = await NotificationService.create(
    logger,
    uiKarton,
  );

  // Initialize auto-update service (only runs on macOS and Windows, skipped for dev builds)
  const _autoUpdateService = await AutoUpdateService.create(
    logger,
    notificationService,
  );

  // Ensure ripgrep is installed for improved grep/glob performance
  // If installation fails, the app will continue with Node.js fallback implementations
  const identifierService = await IdentifierService.create(
    globalDataPathService,
    logger,
  );
  const globalConfigService = await GlobalConfigService.create(
    globalDataPathService,
    logger,
    uiKarton,
  );

  const telemetryService = new TelemetryService(
    identifierService,
    preferencesService,
    logger,
  );

  ensureRipgrepInstalled({
    rgBinaryBasePath: globalDataPathService.globalDataPath,
    onLog: logger.debug,
  })
    .then((result) => {
      if (!result.success) {
        telemetryService.capture('cli-ripgrep-installation-failed', {
          error: result.error ?? 'Unknown error',
        });
        logger.warn(
          `Ripgrep installation failed: ${result.error}. Grep/glob operations will use slower Node.js implementations.`,
        );
      } else {
        telemetryService.capture('cli-ripgrep-installation-succeeded');
        if (verbose)
          logger.debug('Ripgrep is available for grep/glob operations');
      }
    })
    .catch((error) => {
      logger.warn(
        `Ripgrep installation failed: ${error}. Grep/glob operations will use slower Node.js implementations.`,
      );
    });

  logger.debug('[Main] Global services bootstrapped');

  // Start remaining services that are irrelevant to non-regular operation of the app.
  const filePickerService = await FilePickerService.create(logger, uiKarton);

  // URIHandlerService registers the app as the default protocol client for stagewise://
  // URL handling is done in main.ts via setupUrlHandlers() and handleCommandLineUrls()
  await URIHandlerService.create(logger);

  const authService = await AuthService.create(
    globalDataPathService,
    identifierService,
    uiKarton,
    notificationService,
    windowLayoutService,
    logger,
  );

  // Wire up auth callback handler from PagesService to AuthService
  pagesService.setAuthCallbackHandler(async (authCode, error) => {
    await authService.handleAuthCodeExchange(authCode, error);
  });

  const workspaceService = await WorkspaceService.create(
    logger,
    filePickerService,
    telemetryService,
    uiKarton,
    globalDataPathService,
    notificationService,
    authService,
  );

  workspaceService.registerWorkspaceChangeListener((event) => {
    switch (event.type) {
      case 'loaded': {
        const accessPath = event.selectedPath;
        const clientRuntime = new ClientRuntimeNode({
          workingDirectory: accessPath,
          rgBinaryBasePath: globalDataPathService.globalDataPath,
        });
        agentService.setClientRuntime(clientRuntime);
        void _userExperienceService.saveRecentlyOpenedWorkspace({
          path: event.selectedPath,
          name: event.name,
          openedAt: Date.now(),
        });
        break;
      }
      case 'unloaded':
        agentService.setClientRuntime(null);
        break;
    }
  });

  const _appMenuService = new AppMenuService(
    logger,
    authService,
    windowLayoutService,
  );

  const _userExperienceService = await UserExperienceService.create(
    logger,
    uiKarton,
    globalDataPathService,
  );

  // Wire up home page services - bidirectional connection between services
  _userExperienceService.setPagesService(pagesService);
  pagesService.setUserExperienceService(_userExperienceService);
  pagesService.setOpenWorkspaceHandler(async (path?: string) => {
    try {
      // Unload current workspace first if one is loaded
      if (workspaceService.isLoaded) {
        await workspaceService.unloadWorkspace();
      }
      await workspaceService.loadWorkspace(path);
    } catch (error) {
      logger.error(`[Main] Failed to open workspace: ${error}`);
    }
  });

  // Wire up certificate trust handler for error page "Continue (UNSAFE!)" button
  pagesService.setTrustCertificateAndReloadHandler(
    async (tabId: string, origin: string) => {
      windowLayoutService.trustCertificateAndReload(tabId, origin);
    },
  );

  const agentService = await AgentService.create(
    logger,
    telemetryService,
    uiKarton,
    globalConfigService,
    authService,
    windowLayoutService,
    globalDataPathService,
  );

  // No need to unregister this callback, as it will be destroyed when the main app shuts down
  authService.registerAuthStateChangeCallback((newAuthState) => {
    if (newAuthState.user) {
      logger.debug(
        '[Main] User logged in, identifying user and setting user properties...',
      );
      telemetryService.setUserProperties({
        user_id: newAuthState.user?.id,
        user_email: newAuthState.user?.email,
      });
      telemetryService.identifyUser();
    } else
      logger.debug('[Main] No user data available, not identifying user...');
  });

  // Set up accept/reject pending edits handlers for pages-api contract
  // These call AgentService methods which handle the actual diff history logic
  pagesService.setAcceptAllPendingEditsHandler(async (chatId: string) => {
    // First ensure the correct chat is active
    const currentActiveChatId = uiKarton.state.agentChat?.activeChatId;
    if (currentActiveChatId !== chatId) {
      logger.warn(
        `[Main] acceptAllPendingEdits: chat ${chatId} is not active, skipping`,
      );
      return;
    }
    agentService.acceptAllPendingEdits();
  });

  pagesService.setRejectAllPendingEditsHandler(async (chatId: string) => {
    const currentActiveChatId = uiKarton.state.agentChat?.activeChatId;
    if (currentActiveChatId !== chatId) {
      logger.warn(
        `[Main] rejectAllPendingEdits: chat ${chatId} is not active, skipping`,
      );
      return;
    }
    agentService.rejectAllPendingEdits();
  });

  pagesService.setAcceptPendingEditHandler(
    async (chatId: string, filePath: string) => {
      const currentActiveChatId = uiKarton.state.agentChat?.activeChatId;
      if (currentActiveChatId !== chatId) {
        logger.warn(
          `[Main] acceptPendingEdit: chat ${chatId} is not active, skipping`,
        );
        return;
      }
      // Convert relative path back to absolute path for the agent service
      const workspacePath = uiKarton.state.workspace?.path;
      const absolutePath = workspacePath
        ? path.resolve(workspacePath, filePath)
        : filePath;
      agentService.acceptPendingEdit(absolutePath);
    },
  );

  pagesService.setRejectPendingEditHandler(
    async (chatId: string, filePath: string) => {
      const currentActiveChatId = uiKarton.state.agentChat?.activeChatId;
      if (currentActiveChatId !== chatId) {
        logger.warn(
          `[Main] rejectPendingEdit: chat ${chatId} is not active, skipping`,
        );
        return;
      }
      // Convert relative path back to absolute path for the agent service
      const workspacePath = uiKarton.state.workspace?.path;
      const absolutePath = workspacePath
        ? path.resolve(workspacePath, filePath)
        : filePath;
      agentService.rejectPendingEdit(absolutePath);
    },
  );

  logger.debug('[Main] Normal operation services bootstrapped');

  // After all services got started, we're now ready to load the initial workspace (which is either the user given path or the cwd).
  // We only load the current workspace as default workspace if the folder contains a stagewise.json file. (We don't verify it tho)
  logger.debug('[Main] Startup complete');

  // Handle command line arguments for URLs on initial startup
  handleCommandLineUrls(process.argv, windowLayoutService, logger);

  // Set up graceful shutdown to clean up database connections
  const shutdown = () => {
    logger.debug('[Main] Shutting down services...');
    webDataService.teardown();
    historyService.teardown();
    faviconService.teardown();
    logger.debug('[Main] Services shut down');
  };

  app.on('will-quit', shutdown);
}

/**
 * Checks if a string is a valid URL that the browser can open
 */
function isOpenableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'stagewise:'
    );
  } catch {
    return false;
  }
}

/**
 * Extracts URLs from command line arguments (http, https, or stagewise://)
 */
function extractUrlsFromArgs(argv: string[]): string[] {
  const urls: string[] = [];
  for (const arg of argv) {
    // Skip non-URL arguments (flags starting with -)
    if (arg.startsWith('-')) {
      continue;
    }
    if (isOpenableUrl(arg)) {
      urls.push(arg);
    }
  }
  return urls;
}

/**
 * Opens a URL in a new browser tab (handles both http/https and stagewise:// URLs)
 */
function openIncomingUrl(
  url: string,
  windowLayoutService: WindowLayoutService,
  logger: Logger,
): void {
  logger.debug(`[Main] Opening incoming URL: ${url}`);
  void windowLayoutService.openUrlInNewTab(url);
}

/**
 * Sets up event handlers for opening URLs from OS events
 */
function setupUrlHandlers(
  windowLayoutService: WindowLayoutService,
  logger: Logger,
): void {
  // Handle 'open-url' event (macOS) - for both http/https and stagewise:// URLs
  app.on('open-url', (ev: Electron.Event, url: string) => {
    ev.preventDefault();
    logger.debug(`[Main] open-url event received: ${url}`);
    if (isOpenableUrl(url)) {
      openIncomingUrl(url, windowLayoutService, logger);
    }
  });

  // Handle 'second-instance' event (when app is already running)
  // This fires when user opens another URL while the app is running
  app.on('second-instance', (_ev: Electron.Event, argv: string[]) => {
    logger.debug(`[Main] second-instance event received with argv: ${argv}`);
    const urls = extractUrlsFromArgs(argv);
    for (const url of urls) {
      openIncomingUrl(url, windowLayoutService, logger);
    }
  });
}

/**
 * Handles URLs from command line arguments on initial startup
 */
function handleCommandLineUrls(
  argv: string[],
  windowLayoutService: WindowLayoutService,
  logger: Logger,
): void {
  // Skip the first two args (node executable and script path)
  const urls = extractUrlsFromArgs(argv.slice(2));
  if (urls.length > 0) {
    logger.debug(`[Main] Found URLs in command line arguments: ${urls}`);
    // Open the first URL immediately, others will be queued
    openIncomingUrl(urls[0], windowLayoutService, logger);
    // Open remaining URLs after a short delay to ensure the first one is processed
    for (let i = 1; i < urls.length; i++) {
      setTimeout(() => {
        openIncomingUrl(urls[i], windowLayoutService, logger);
      }, i * 100);
    }
  }
}
