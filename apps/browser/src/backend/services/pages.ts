import { net, session, shell } from 'electron';
import type { Logger } from './logger';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, unlinkSync } from 'node:fs';
import {
  createKartonServer,
  type KartonServer,
  ElectronServerTransport,
  type MessagePortMain,
} from '@stagewise/karton/server';
import {
  type PagesApiContract,
  defaultState,
} from '@shared/karton-contracts/pages-api';
import type { FileDiffResult } from '@shared/karton-contracts/pages-api/types';
import type {
  UserPreferences,
  Patch,
} from '@shared/karton-contracts/ui/shared-types';
import type { HistoryService } from './history';
import type { FaviconService } from './favicon';
import type { DownloadsService } from './download-manager';
import type { WebDataService } from './webdata';
import type {
  HistoryFilter,
  HistoryResult,
  FaviconBitmapResult,
  ClearBrowsingDataOptions,
  ClearBrowsingDataResult,
  DownloadsFilter,
  DownloadResult,
  ActiveDownloadInfo,
  DownloadControlResult,
  PendingEditsResult,
  AddSearchEngineInput,
} from '@shared/karton-contracts/pages-api/types';
import { DisposableService } from './disposable';

declare const PAGES_VITE_DEV_SERVER_URL: string;
declare const PAGES_VITE_NAME: string;

/**
 * Service responsible for registering the custom protocol handler for the pages renderer.
 * This service registers the "stagewise" protocol handler on the default browsing session
 * used by tabs, enabling client-side routing and asset serving.
 *
 * Also exposes the PagesApi Karton contract for communication with the pages renderer.
 */
export class PagesService extends DisposableService {
  private readonly logger: Logger;
  private readonly historyService: HistoryService;
  private readonly faviconService: FaviconService;
  private readonly downloadsService?: DownloadsService;
  private readonly webDataService?: WebDataService;
  private kartonServer: KartonServer<PagesApiContract>;
  private transport: ElectronServerTransport;
  private currentPort?: MessagePortMain;
  private portCloseListeners = new Map<MessagePortMain, () => void>();
  private openTabHandler?: (url: string, setActive?: boolean) => Promise<void>;
  private markDownloadsSeenHandler?: () => Promise<void>;
  private onSearchEnginesChangeHandler?: () => Promise<void>;
  private getPendingEditsHandler?: (
    chatId: string,
  ) => Promise<PendingEditsResult>;
  private acceptAllPendingEditsHandler?: (chatId: string) => Promise<void>;
  private rejectAllPendingEditsHandler?: (chatId: string) => Promise<void>;
  private acceptPendingEditHandler?: (
    chatId: string,
    path: string,
  ) => Promise<void>;
  private rejectPendingEditHandler?: (
    chatId: string,
    path: string,
  ) => Promise<void>;
  private getPreferencesHandler?: () => UserPreferences;
  private updatePreferencesHandler?: (patches: Patch[]) => Promise<void>;

  private constructor(
    logger: Logger,
    historyService: HistoryService,
    faviconService: FaviconService,
    downloadsService?: DownloadsService,
    webDataService?: WebDataService,
  ) {
    super();
    this.logger = logger;
    this.historyService = historyService;
    this.faviconService = faviconService;
    this.downloadsService = downloadsService;
    this.webDataService = webDataService;

    this.transport = new ElectronServerTransport();

    this.kartonServer = createKartonServer<PagesApiContract>({
      initialState: defaultState,
      transport: this.transport,
    });
    this.kartonServer.setState((draft) => {
      draft.appInfo.otherVersions = { ...process.versions, modules: undefined };
    });

    // Set up callback to push active downloads state changes
    if (this.downloadsService) {
      this.downloadsService.setOnActiveDownloadsChange(
        (activeDownloads: Record<number, ActiveDownloadInfo>) => {
          this.kartonServer.setState((draft) => {
            draft.activeDownloads = activeDownloads;
          });
          this.logger.debug('[PagesService] Active downloads state updated', {
            count: Object.keys(activeDownloads).length,
          });
        },
      );
    }

    this.logger.debug(
      '[PagesService] Karton server initialized with MessagePort transport',
    );
  }

  public static async create(
    logger: Logger,
    historyService: HistoryService,
    faviconService: FaviconService,
    downloadsService?: DownloadsService,
    webDataService?: WebDataService,
  ): Promise<PagesService> {
    const instance = new PagesService(
      logger,
      historyService,
      faviconService,
      downloadsService,
      webDataService,
    );
    await instance.initialize();
    logger.debug('[PagesService] Created service');
    return instance;
  }

  private async initialize(): Promise<void> {
    // Register procedure handlers
    this.registerProcedureHandlers();

    // Get the default browsing session used by tabs (same partition as tab-controller)
    const ses = session.fromPartition('persist:browser-content');

    ses.protocol.handle('stagewise', (request) => {
      // Normalize the URL - ensure it has an origin (hostname)
      // "stagewise://" needs an origin to be valid, default to "internal"
      let normalizedRequestUrl = request.url;
      if (
        normalizedRequestUrl === 'stagewise://' ||
        normalizedRequestUrl.endsWith('://')
      ) {
        normalizedRequestUrl = 'stagewise://internal/';
      }

      // Parse URL and check if origin is "internal"
      let url: URL;
      try {
        url = new URL(normalizedRequestUrl);
      } catch (err) {
        this.logger.error(
          `[PagesService] Failed to parse URL: ${err}. Redirecting to not-found page.`,
        );
        // Redirect to not-found page for invalid URLs
        return Response.redirect('stagewise://internal/not-found', 302);
      }

      // Only serve the app if the origin (hostname) is "internal"
      if (url.hostname !== 'internal') {
        this.logger.debug(
          `[PagesService] Redirecting request with origin: ${url.hostname} to not-found page. Only "internal" origin is allowed.`,
        );
        // Redirect to not-found page
        return Response.redirect('stagewise://internal/not-found', 302);
      }

      // In dev mode, forward all requests to the dev server
      if (PAGES_VITE_DEV_SERVER_URL) {
        const pathname = url.pathname || '/';
        const search = url.search || '';
        const devServerUrl = `${PAGES_VITE_DEV_SERVER_URL}${pathname}${search}`;
        return net.fetch(devServerUrl);
      }

      // In production, serve files if they exist, otherwise serve index.html
      const requestPath = url.pathname || '/';

      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const pagesBaseDir = path.resolve(
        __dirname,
        `../renderer/${PAGES_VITE_NAME}`,
      );

      // If path is empty or just "/", serve index.html
      if (!requestPath || requestPath === '/') {
        const indexPath = path.resolve(pagesBaseDir, 'index.html');
        const normalizedIndexPath = indexPath.replace(/\\/g, '/');
        const fileUrl = `file:///${normalizedIndexPath}`;
        return net.fetch(fileUrl);
      }

      // Remove leading slash and resolve the file path
      const normalizedPath = requestPath.startsWith('/')
        ? requestPath.slice(1)
        : requestPath;
      const filePath = path.resolve(pagesBaseDir, normalizedPath);

      // If file exists, serve it; otherwise serve index.html for client-side routing
      const targetPath = existsSync(filePath)
        ? filePath
        : path.resolve(pagesBaseDir, 'index.html');
      const normalizedTargetPath = targetPath.replace(/\\/g, '/');
      const fileUrl = `file:///${normalizedTargetPath}`;
      return net.fetch(fileUrl);
    });

    this.logger.debug(
      '[PagesService] Registered stagewise protocol handler for browsing session',
    );
  }

  private registerProcedureHandlers(): void {
    this.kartonServer.registerServerProcedureHandler(
      'getHistory',
      async (filter: HistoryFilter): Promise<HistoryResult[]> => {
        const historyResults = await this.historyService.queryHistory(filter);

        // Get favicon URLs for all history entries efficiently
        const pageUrls = historyResults.map((r) => r.url);
        const faviconMap =
          await this.faviconService.getFaviconsForUrls(pageUrls);

        // Enrich history results with favicon URLs
        return historyResults.map((result) => ({
          ...result,
          faviconUrl: faviconMap.get(result.url) ?? null,
        }));
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'getDownloads',
      async (filter: DownloadsFilter): Promise<DownloadResult[]> => {
        const downloadResults =
          await this.historyService.queryDownloads(filter);

        // Get active downloads for merging progress info
        const activeDownloads =
          this.downloadsService?.getActiveDownloads() ?? [];
        const activeByGuid = new Map(
          activeDownloads.map((d) => [`${d.id}`, d]),
        );

        // Enrich download results with filename, file existence, and active download info
        return downloadResults.map((download) => {
          // Extract filename from target path
          const filename = path.basename(download.targetPath);

          // Check if file exists on disk - use targetPath as that's where the file is
          const fileExists = download.targetPath
            ? existsSync(download.targetPath)
            : false;

          // Use guid (parsed as number) as id for consistency with DownloadManager
          const id = Number.parseInt(download.guid, 10) || download.id;

          // Check if this download is active and merge real-time progress
          const activeDownload = activeByGuid.get(download.guid);
          const isActive = !!activeDownload;

          // Use active download values if available, otherwise use DB values
          const receivedBytes =
            activeDownload?.receivedBytes ?? download.receivedBytes;
          const totalBytes = activeDownload?.totalBytes ?? download.totalBytes;
          const state = activeDownload?.state ?? download.state;
          const progress =
            totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0;

          return {
            ...download,
            id,
            filename,
            fileExists,
            receivedBytes,
            totalBytes,
            state,
            isActive,
            progress,
            isPaused: activeDownload?.isPaused,
            canResume: activeDownload?.canResume,
          };
        });
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'getActiveDownloads',
      async (): Promise<ActiveDownloadInfo[]> => {
        if (!this.downloadsService) {
          return [];
        }

        const activeDownloads = this.downloadsService.getActiveDownloads();
        return activeDownloads.map((download) => ({
          id: download.id,
          state: download.state,
          receivedBytes: download.receivedBytes,
          totalBytes: download.totalBytes,
          isPaused: download.isPaused,
          canResume: download.canResume,
          progress:
            download.totalBytes > 0
              ? Math.round((download.receivedBytes / download.totalBytes) * 100)
              : 0,
          filename: download.filename,
          url: download.url,
          targetPath: download.targetPath,
          startTime: download.startTime,
          currentSpeedKBps: download.currentSpeedKBps,
          speedHistory: download.speedHistory,
        }));
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'deleteDownload',
      async (downloadId: number): Promise<DownloadControlResult> => {
        try {
          // Cancel active download if in progress
          if (this.downloadsService) {
            const activeDownload =
              this.downloadsService.getActiveDownload(downloadId);
            if (activeDownload) {
              await this.downloadsService.cancelDownload(downloadId);
              this.logger.info(
                '[PagesService] Cancelled active download before deletion',
                { id: downloadId },
              );
            }
          }

          // Check if this is the newest download for its filepath
          // Only delete the file if it's the newest entry (no newer downloads with same path)
          const { isNewest, targetPath } =
            await this.historyService.isNewestDownloadForPath(`${downloadId}`);

          // Also check if there's an active download with the same path
          let hasActiveWithSamePath = false;
          if (targetPath && this.downloadsService) {
            const activeDownloads = this.downloadsService.getActiveDownloads();
            hasActiveWithSamePath = activeDownloads.some(
              (d) => d.targetPath === targetPath && d.id !== downloadId,
            );
          }

          // Delete from database (using guid as the ID)
          const deleted = await this.historyService.deleteDownloadByGuid(
            `${downloadId}`,
          );

          // Only delete the file if this is the newest entry and no active downloads use it
          const shouldDeleteFile = isNewest && !hasActiveWithSamePath;
          if (shouldDeleteFile && targetPath && existsSync(targetPath)) {
            try {
              unlinkSync(targetPath);
              this.logger.info('[PagesService] Deleted download file', {
                path: targetPath,
              });
            } catch (fileError) {
              this.logger.warn('[PagesService] Failed to delete file', {
                path: targetPath,
                error: fileError,
              });
              // Don't fail the operation if file deletion fails
            }
          } else if (
            targetPath &&
            existsSync(targetPath) &&
            !shouldDeleteFile
          ) {
            this.logger.info(
              '[PagesService] Skipped file deletion - newer download exists for path',
              { path: targetPath, isNewest, hasActiveWithSamePath },
            );
          }

          if (deleted) {
            return { success: true };
          }
          return { success: false, error: 'Download not found' };
        } catch (error) {
          this.logger.error('[PagesService] Failed to delete download', error);
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          };
        }
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'openDownloadFile',
      async (filePath: string): Promise<DownloadControlResult> => {
        try {
          if (!filePath) {
            return { success: false, error: 'No file path provided' };
          }

          if (!existsSync(filePath)) {
            return { success: false, error: 'File not found' };
          }

          // Open the file with the system default application
          const errorMessage = await shell.openPath(filePath);
          if (errorMessage) {
            this.logger.warn('[PagesService] Failed to open file', {
              path: filePath,
              error: errorMessage,
            });
            return { success: false, error: errorMessage };
          }

          this.logger.debug('[PagesService] Opened file', { path: filePath });
          return { success: true };
        } catch (error) {
          this.logger.error('[PagesService] Error opening file', error);
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          };
        }
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'showDownloadInFolder',
      async (filePath: string): Promise<DownloadControlResult> => {
        try {
          if (!filePath) {
            return { success: false, error: 'No file path provided' };
          }

          if (!existsSync(filePath)) {
            return { success: false, error: 'File not found' };
          }

          // Show the file in the system file manager (Finder/Explorer)
          shell.showItemInFolder(filePath);

          this.logger.debug('[PagesService] Showed file in folder', {
            path: filePath,
          });
          return { success: true };
        } catch (error) {
          this.logger.error(
            '[PagesService] Error showing file in folder',
            error,
          );
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          };
        }
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'pauseDownload',
      async (downloadId: number): Promise<DownloadControlResult> => {
        if (!this.downloadsService) {
          return {
            success: false,
            error: 'Download manager not available',
          };
        }

        const paused = this.downloadsService.pauseDownload(downloadId);
        if (paused) {
          return { success: true };
        }
        return {
          success: false,
          error: 'Download not found or cannot be paused',
        };
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'resumeDownload',
      async (downloadId: number): Promise<DownloadControlResult> => {
        if (!this.downloadsService) {
          return {
            success: false,
            error: 'Download manager not available',
          };
        }

        const resumed = this.downloadsService.resumeDownload(downloadId);
        if (resumed) {
          return { success: true };
        }
        return {
          success: false,
          error: 'Download not found or cannot be resumed',
        };
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'cancelDownload',
      async (downloadId: number): Promise<DownloadControlResult> => {
        if (!this.downloadsService) {
          return {
            success: false,
            error: 'Download manager not available',
          };
        }

        const cancelled =
          await this.downloadsService.cancelDownload(downloadId);
        if (cancelled) {
          return { success: true };
        }
        return { success: false, error: 'Download not found' };
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'markDownloadsSeen',
      async (): Promise<void> => {
        if (!this.markDownloadsSeenHandler) {
          this.logger.warn(
            '[PagesService] markDownloadsSeen called but no handler is set',
          );
          return;
        }
        await this.markDownloadsSeenHandler();
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'getFaviconBitmaps',
      async (
        faviconUrls: string[],
      ): Promise<Record<string, FaviconBitmapResult>> => {
        const bitmapMap =
          await this.faviconService.getFaviconBitmaps(faviconUrls);
        // Convert Map to Record for JSON serialization
        const result: Record<string, FaviconBitmapResult> = {};
        for (const [url, bitmap] of bitmapMap) {
          result[url] = bitmap;
        }
        return result;
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'openTab',
      async (url: string, setActive?: boolean): Promise<void> => {
        if (!this.openTabHandler) {
          this.logger.warn(
            '[PagesService] openTab called but no handler is set',
          );
          return;
        }
        await this.openTabHandler(url, setActive);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'clearBrowsingData',
      async (
        options: ClearBrowsingDataOptions,
      ): Promise<ClearBrowsingDataResult> => {
        this.logger.info('[PagesService] Clear browsing data requested', {
          history: options.history,
          favicons: options.favicons,
          downloads: options.downloads,
          cookies: options.cookies,
          cache: options.cache,
          storage: options.storage,
          indexedDB: options.indexedDB,
          serviceWorkers: options.serviceWorkers,
          cacheStorage: options.cacheStorage,
          timeRange: options.timeRange,
        });

        try {
          const result: ClearBrowsingDataResult = {
            success: true,
          };

          // Clear history if requested
          if (options.history) {
            if (options.timeRange?.start || options.timeRange?.end) {
              // Range-based clearing
              const start = options.timeRange.start ?? new Date(0);
              const end = options.timeRange.end ?? new Date();
              result.historyEntriesCleared =
                await this.historyService.clearHistoryRange(start, end);
            } else {
              // Clear all history
              result.historyEntriesCleared =
                await this.historyService.clearAllData();
            }
          }

          // Clear downloads if requested
          if (options.downloads) {
            result.downloadsCleared =
              await this.historyService.clearDownloads();
          }

          // Clear favicons if requested
          if (options.favicons) {
            // Clear all favicons
            result.faviconsCleared = await this.faviconService.clearAllData();
          } else if (options.history) {
            // If only history was cleared, clean up orphaned favicons
            result.faviconsCleared =
              await this.faviconService.cleanupOrphanedFavicons();
          }

          // Clear session data (cookies, cache, storage, etc.)
          const ses = session.fromPartition('persist:browser-content');

          // Clear HTTP cache if requested
          if (options.cache) {
            await ses.clearCache();
            result.cacheCleared = true;
            this.logger.debug('[PagesService] HTTP cache cleared');
          }

          // Build storage types to clear
          const storageTypes: string[] = [];
          if (options.cookies) storageTypes.push('cookies');
          if (options.storage) {
            storageTypes.push('localstorage');
            // Note: sessionstorage is per-tab and cleared when tab closes
          }
          if (options.indexedDB) storageTypes.push('indexdb');
          if (options.serviceWorkers) storageTypes.push('serviceworkers');
          if (options.cacheStorage) storageTypes.push('cachestorage');

          // Clear storage data if any types requested
          if (storageTypes.length > 0) {
            const clearStorageOptions: Electron.ClearStorageDataOptions = {
              storages:
                storageTypes as Electron.ClearStorageDataOptions['storages'],
            };

            // Apply time range if specified (only for cookies)
            if (
              options.cookies &&
              options.timeRange?.start &&
              storageTypes.length === 1
            ) {
              // Note: clearStorageData doesn't support time-based filtering for all types
              // For cookies specifically, we can use cookies.remove with date filtering
              // but clearStorageData is all-or-nothing
              this.logger.debug(
                '[PagesService] Time range filtering not fully supported for session storage, clearing all',
              );
            }

            await ses.clearStorageData(clearStorageOptions);

            if (options.cookies) result.cookiesCleared = true;
            if (
              options.storage ||
              options.indexedDB ||
              options.serviceWorkers ||
              options.cacheStorage
            ) {
              result.storageCleared = true;
            }

            this.logger.debug('[PagesService] Session storage data cleared', {
              storageTypes,
            });
          }

          // Run vacuum if requested (default true)
          if (options.vacuum !== false) {
            const vacuumPromises: Promise<void>[] = [];
            if (options.history || options.downloads) {
              vacuumPromises.push(this.historyService.vacuum());
            }
            if (options.favicons) {
              vacuumPromises.push(this.faviconService.vacuum());
            }
            await Promise.all(vacuumPromises);
          }

          this.logger.info(
            '[PagesService] Clear browsing data completed',
            result,
          );
          return result;
        } catch (error) {
          this.logger.error('[PagesService] Clear browsing data failed', error);
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          };
        }
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'getPendingEdits',
      async (chatId: string): Promise<PendingEditsResult> => {
        if (!this.getPendingEditsHandler) {
          this.logger.warn(
            '[PagesService] getPendingEdits called but no handler is set',
          );
          return { found: false, edits: [] };
        }
        return this.getPendingEditsHandler(chatId);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'acceptAllPendingEdits',
      async (chatId: string): Promise<void> => {
        if (!this.acceptAllPendingEditsHandler) {
          this.logger.warn(
            '[PagesService] acceptAllPendingEdits called but no handler is set',
          );
          return;
        }
        await this.acceptAllPendingEditsHandler(chatId);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'rejectAllPendingEdits',
      async (chatId: string): Promise<void> => {
        if (!this.rejectAllPendingEditsHandler) {
          this.logger.warn(
            '[PagesService] rejectAllPendingEdits called but no handler is set',
          );
          return;
        }
        await this.rejectAllPendingEditsHandler(chatId);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'acceptPendingEdit',
      async (chatId: string, filePath: string): Promise<void> => {
        if (!this.acceptPendingEditHandler) {
          this.logger.warn(
            '[PagesService] acceptPendingEdit called but no handler is set',
          );
          return;
        }
        await this.acceptPendingEditHandler(chatId, filePath);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'rejectPendingEdit',
      async (chatId: string, filePath: string): Promise<void> => {
        if (!this.rejectPendingEditHandler) {
          this.logger.warn(
            '[PagesService] rejectPendingEdit called but no handler is set',
          );
          return;
        }
        await this.rejectPendingEditHandler(chatId, filePath);
      },
    );

    // Search engine procedures
    this.kartonServer.registerServerProcedureHandler(
      'getSearchEngines',
      async () => {
        if (!this.webDataService) {
          this.logger.warn(
            '[PagesService] getSearchEngines called but webDataService is not available',
          );
          return [];
        }
        return this.webDataService.getSearchEngines();
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'addSearchEngine',
      async (input: AddSearchEngineInput) => {
        if (!this.webDataService) {
          return {
            success: false as const,
            error: 'Search engine service not available',
          };
        }
        try {
          // Convert %s to {searchTerms} for internal storage
          const internalUrl = input.url.replace(/%s/g, '{searchTerms}');

          const id = await this.webDataService.addSearchEngine({
            name: input.name,
            url: internalUrl,
            keyword: input.keyword,
          });

          // Sync updated list to state
          await this.syncSearchEnginesState();

          return { success: true as const, id };
        } catch (error) {
          this.logger.error(
            '[PagesService] Failed to add search engine',
            error,
          );
          return {
            success: false as const,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to add search engine',
          };
        }
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'removeSearchEngine',
      async (id: number) => {
        if (!this.webDataService) {
          return {
            success: false,
            error: 'Search engine service not available',
          };
        }
        try {
          const removed = await this.webDataService.removeSearchEngine(id);
          if (!removed) {
            return {
              success: false,
              error: 'Search engine not found',
            };
          }

          // Sync updated list to state
          await this.syncSearchEnginesState();

          return { success: true };
        } catch (error) {
          this.logger.error(
            '[PagesService] Failed to remove search engine',
            error,
          );
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to remove search engine',
          };
        }
      },
    );
  }

  /**
   * Set the handler for opening tabs. This should be called by WindowLayoutService.
   */
  public setOpenTabHandler(
    handler: (url: string, setActive?: boolean) => Promise<void>,
  ): void {
    this.openTabHandler = handler;
  }

  /**
   * Set the handler for marking downloads as seen. This should be called by main.ts.
   */
  public setMarkDownloadsSeenHandler(handler: () => Promise<void>): void {
    this.markDownloadsSeenHandler = handler;
  }

  /**
   * Set the handler called when search engines change.
   * This allows main.ts to sync search engines to the UI Karton.
   */
  public setOnSearchEnginesChangeHandler(handler: () => Promise<void>): void {
    this.onSearchEnginesChangeHandler = handler;
  }

  /**
   * Set the handler for getting pending edits. This should be called by main.ts.
   */
  public setGetPendingEditsHandler(
    handler: (chatId: string) => Promise<PendingEditsResult>,
  ): void {
    this.getPendingEditsHandler = handler;
  }

  /**
   * Set the handler for accepting all pending edits. This should be called by main.ts.
   */
  public setAcceptAllPendingEditsHandler(
    handler: (chatId: string) => Promise<void>,
  ): void {
    this.acceptAllPendingEditsHandler = handler;
  }

  /**
   * Set the handler for rejecting all pending edits. This should be called by main.ts.
   */
  public setRejectAllPendingEditsHandler(
    handler: (chatId: string) => Promise<void>,
  ): void {
    this.rejectAllPendingEditsHandler = handler;
  }

  /**
   * Set the handler for accepting a single pending edit. This should be called by main.ts.
   */
  public setAcceptPendingEditHandler(
    handler: (chatId: string, path: string) => Promise<void>,
  ): void {
    this.acceptPendingEditHandler = handler;
  }

  /**
   * Set the handler for rejecting a single pending edit. This should be called by main.ts.
   */
  public setRejectPendingEditHandler(
    handler: (chatId: string, path: string) => Promise<void>,
  ): void {
    this.rejectPendingEditHandler = handler;
  }

  /**
   * Register handlers for preferences operations.
   * Called by PreferencesService during initialization.
   */
  public registerPreferencesHandlers(
    getHandler: () => UserPreferences,
    updateHandler: (patches: Patch[]) => Promise<void>,
  ): void {
    this.getPreferencesHandler = getHandler;
    this.updatePreferencesHandler = updateHandler;

    this.kartonServer.registerServerProcedureHandler(
      'getPreferences',
      async () => {
        if (!this.getPreferencesHandler) {
          throw new Error('Preferences handler not registered');
        }
        return this.getPreferencesHandler();
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'updatePreferences',
      async (patches: Patch[]) => {
        if (!this.updatePreferencesHandler) {
          throw new Error('Preferences handler not registered');
        }
        await this.updatePreferencesHandler(patches);
      },
    );

    this.logger.debug('[PagesService] Preferences handlers registered');
  }

  /**
   * Sync preferences state to the Pages API Karton state.
   * Called by PreferencesService when preferences change.
   */
  public syncPreferencesState(preferences: UserPreferences): void {
    this.kartonServer.setState((draft) => {
      draft.preferences = preferences;
    });
  }

  /**
   * Sync search engines state to the Pages API Karton state.
   * Called after search engines are added/removed or during initialization.
   * Also notifies the onSearchEnginesChangeHandler to sync to UI Karton.
   */
  public async syncSearchEnginesState(): Promise<void> {
    if (!this.webDataService) {
      this.logger.warn(
        '[PagesService] Cannot sync search engines - webDataService not available',
      );
      return;
    }

    const engines = await this.webDataService.getSearchEngines();
    this.kartonServer.setState((draft) => {
      draft.searchEngines = engines;
    });

    // Notify main.ts to sync to UI Karton as well
    if (this.onSearchEnginesChangeHandler) {
      await this.onSearchEnginesChangeHandler();
    }

    this.logger.debug(
      `[PagesService] Synced ${engines.length} search engines to state`,
    );
  }

  /**
   * Update the pending edits state for a specific chat. Called when edits change.
   */
  public updatePendingEditsState(
    chatId: string,
    edits: FileDiffResult[],
  ): void {
    this.kartonServer.setState((draft) => {
      draft.pendingEditsByChat[chatId] = edits;
    });
  }

  /**
   * Accept a new MessagePort connection for the PagesApi contract.
   *
   * @param port - The MessagePortMain from the main process side
   * @returns The connection ID assigned to this port
   */
  public acceptPort(port: MessagePortMain): string {
    // Remove listener from old port if it exists
    if (this.currentPort) {
      const oldListener = this.portCloseListeners.get(this.currentPort);
      if (oldListener) {
        this.currentPort.off('close', oldListener);
        this.portCloseListeners.delete(this.currentPort);
      }
    }

    // Store the new port
    this.currentPort = port;

    // Setup close listener for connection monitoring
    const closeListener = () => {
      this.logger.warn('[PagesService] MessagePort closed - connection lost');
      // Clean up the listener reference
      if (this.currentPort) {
        this.portCloseListeners.delete(this.currentPort);
      }
    };

    // Store the listener so we can remove it later
    this.portCloseListeners.set(port, closeListener);
    port.on('close', closeListener);

    // Accept the port in the transport
    const id = this.transport.setPort(port, 'pages-api');
    this.logger.debug(`[PagesService] Accepted port connection: ${id}`);

    return id;
  }

  /**
   * Close all connections and clean up resources.
   */
  protected async onTeardown(): Promise<void> {
    this.logger.debug('[PagesService] Tearing down...');

    // Unregister procedure handlers
    this.kartonServer.removeServerProcedureHandler('getHistory');
    this.kartonServer.removeServerProcedureHandler('getFaviconBitmaps');
    this.kartonServer.removeServerProcedureHandler('openTab');
    this.kartonServer.removeServerProcedureHandler('clearBrowsingData');
    this.kartonServer.removeServerProcedureHandler('getPendingEdits');
    this.kartonServer.removeServerProcedureHandler('acceptAllPendingEdits');
    this.kartonServer.removeServerProcedureHandler('rejectAllPendingEdits');
    this.kartonServer.removeServerProcedureHandler('acceptPendingEdit');
    this.kartonServer.removeServerProcedureHandler('rejectPendingEdit');
    this.kartonServer.removeServerProcedureHandler('getPreferences');
    this.kartonServer.removeServerProcedureHandler('updatePreferences');
    this.kartonServer.removeServerProcedureHandler('getSearchEngines');
    this.kartonServer.removeServerProcedureHandler('addSearchEngine');
    this.kartonServer.removeServerProcedureHandler('removeSearchEngine');

    // Unregister the protocol handler from the browsing session
    const ses = session.fromPartition('persist:browser-content');
    ses.protocol.unhandle('stagewise');

    // Clean up all port close listeners
    for (const [port, listener] of this.portCloseListeners.entries()) {
      port.off('close', listener);
    }
    this.portCloseListeners.clear();
    this.currentPort = undefined;
    this.openTabHandler = undefined;

    await this.transport.close();
    this.logger.debug('[PagesService] Teardown complete');
  }
}
