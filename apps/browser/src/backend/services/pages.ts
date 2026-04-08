import { net, session, shell } from 'electron';
import type { Logger } from './logger';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { inferMimeType } from '@shared/mime-utils';
import {
  createKartonServer,
  type KartonServer,
  ElectronServerTransport,
  type MessagePortMain,
} from '@stagewise/karton/server';
import {
  type PagesApiContract,
  defaultState,
  type WorkspaceMountInfo,
} from '@shared/karton-contracts/pages-api';
import type { PlanEntry } from '@shared/karton-contracts/ui';
import type { FileDiff } from '@shared/karton-contracts/ui/shared-types';
import type {
  UserPreferences,
  Patch,
  GlobalConfig,
  ModelProvider,
} from '@shared/karton-contracts/ui/shared-types';
import { validateApiKeys } from '../utils/validate-api-keys';
import type { HistoryService } from './history';
import type { FaviconService } from './favicon';
import type { ThumbnailService } from './thumbnail';
import type { DownloadsService } from './download-manager';
import type { WebDataService } from './webdata';
import type { UserExperienceService } from './experience';
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
  InspirationWebsite,
  ContextFilesResult,
  ExternalFileContentResult,
  LocalPortEntry,
  OriginThumbnailResult,
  MostVisitedOriginEntry,
  CurrentUsageResponse,
  UsageHistoryResponse,
} from '@shared/karton-contracts/pages-api/types';
import { DisposableService } from './disposable';
import type { TelemetryService } from './telemetry';
import { discoverPlugins } from '@/utils/discover-plugins';
import { getPluginsPath, getPlansDir } from '@/utils/paths';

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
  private readonly thumbnailService?: ThumbnailService;
  private readonly downloadsService?: DownloadsService;
  private readonly webDataService?: WebDataService;
  private kartonServer: KartonServer<PagesApiContract>;
  private transport: ElectronServerTransport;
  private portCloseListeners = new Map<MessagePortMain, () => void>();
  private openTabHandler?: (url: string, setActive?: boolean) => Promise<void>;
  private markDownloadsSeenHandler?: () => Promise<void>;
  private onSearchEnginesChangeHandler?: () => Promise<void>;
  private getPendingEditsHandler?: (
    agentInstanceId: string,
  ) => Promise<PendingEditsResult>;
  private acceptAllPendingEditsHandler?: (
    agentInstanceId: string,
  ) => Promise<void>;
  private rejectAllPendingEditsHandler?: (
    agentInstanceId: string,
  ) => Promise<void>;
  private acceptPendingEditHandler?: (
    agentInstanceId: string,
    path: string,
  ) => Promise<void>;
  private rejectPendingEditHandler?: (
    agentInstanceId: string,
    fileId: string,
  ) => Promise<void>;
  private getPreferencesHandler?: () => UserPreferences;
  private updatePreferencesHandler?: (patches: Patch[]) => Promise<void>;
  private clearPermissionExceptionsHandler?: () => Promise<void>;
  // Auth handlers (delegated to AuthService via main.ts)
  private sendOtpHandler?: (email: string) => Promise<{ error?: string }>;
  private verifyOtpHandler?: (
    email: string,
    code: string,
  ) => Promise<{ error?: string }>;
  private logoutHandler?: () => Promise<void>;
  // Home page service dependencies
  private userExperienceService?: UserExperienceService;
  private trustCertificateAndReloadHandler?: (
    tabId: string,
    origin: string,
  ) => Promise<void>;
  private setGlobalConfigHandler?: (config: GlobalConfig) => Promise<void>;
  private getContextFilesHandler?: () => Promise<ContextFilesResult>;
  private generateWorkspaceMdHandler?: (workspacePath: string) => Promise<void>;
  private getExternalFileContentHandler?: (
    oid: string,
  ) => Promise<ExternalFileContentResult | null>;
  private scanLocalPortsHandler?: () => Promise<void>;
  private getUsageCurrentHandler?: () => Promise<CurrentUsageResponse>;
  private getUsageHistoryHandler?: (params: {
    days?: number;
  }) => Promise<UsageHistoryResponse>;
  // Auto-update handlers (delegated to AutoUpdateService via wiring)
  private autoUpdateCheckHandler?: () => void;
  private autoUpdateQuitAndInstallHandler?: () => void;

  private readonly telemetryService: TelemetryService;

  private constructor(
    logger: Logger,
    historyService: HistoryService,
    faviconService: FaviconService,
    downloadsService: DownloadsService | undefined,
    webDataService: WebDataService | undefined,
    telemetryService: TelemetryService,
    thumbnailService?: ThumbnailService,
  ) {
    super();
    this.logger = logger;
    this.historyService = historyService;
    this.faviconService = faviconService;
    this.thumbnailService = thumbnailService;
    this.downloadsService = downloadsService;
    this.webDataService = webDataService;
    this.telemetryService = telemetryService;

    this.transport = new ElectronServerTransport();

    this.kartonServer = createKartonServer<PagesApiContract>({
      initialState: defaultState,
      transport: this.transport,
    });
    this.kartonServer.setState((draft) => {
      draft.appInfo.otherVersions = { ...process.versions, modules: undefined };
    });

    discoverPlugins(getPluginsPath()).then((plugins) => {
      this.kartonServer.setState((draft) => {
        draft.plugins = plugins;
      });
      this.logger.debug(
        `[PagesService] Discovered ${plugins.length} bundled plugins`,
      );
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

  private report(
    error: Error,
    operation: string,
    extra?: Record<string, unknown>,
  ) {
    this.telemetryService.captureException(error, {
      service: 'pages',
      operation,
      ...extra,
    });
  }

  public static async create(
    logger: Logger,
    historyService: HistoryService,
    faviconService: FaviconService,
    downloadsService: DownloadsService | undefined,
    webDataService: WebDataService | undefined,
    telemetryService: TelemetryService,
    thumbnailService?: ThumbnailService,
  ): Promise<PagesService> {
    const instance = new PagesService(
      logger,
      historyService,
      faviconService,
      downloadsService,
      webDataService,
      telemetryService,
      thumbnailService,
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
      )
        normalizedRequestUrl = 'stagewise://internal/';

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

    // Register workspace:// protocol on the browsing session so that
    // internal pages (stagewise://internal/*) can fetch workspace files.
    // Origin-gated: only requests originating from stagewise://internal are
    // allowed; external websites in other tabs get a 403.
    ses.protocol.handle('workspace', async (request) => {
      try {
        // Gate: block requests from external websites.
        // Chromium always sends Sec-Fetch-Site, even for subresource
        // loads (<script>, <img>, etc.) that omit Origin/Referer.
        // Internal same-session requests are 'same-origin' or absent;
        // external pages are 'cross-site'.
        const secFetchSite = request.headers.get('Sec-Fetch-Site');
        if (secFetchSite === 'cross-site')
          return new Response('Forbidden', { status: 403 });

        const url = new URL(request.url);
        const mountPrefix = url.hostname;
        const relativePath = decodeURIComponent(
          url.pathname.replace(/^\//, ''),
        );

        if (!mountPrefix || !relativePath)
          return new Response('Invalid workspace URL', { status: 400 });

        // Resolve mount prefix to workspace root
        const workspaceRoot = this.findMountPath(mountPrefix);
        if (!workspaceRoot)
          return new Response('Mount not found', { status: 404 });

        const absolutePath = path.resolve(workspaceRoot, relativePath);
        if (!absolutePath.startsWith(workspaceRoot + path.sep))
          return new Response('Path traversal denied', { status: 400 });

        const mime = inferMimeType(relativePath);
        const fileUrl = pathToFileURL(absolutePath).href;
        const fileResponse = await net.fetch(fileUrl);

        return new Response(fileResponse.body, {
          status: 200,
          headers: { 'Content-Type': mime },
        });
      } catch (err) {
        this.logger.error(
          '[PagesService] workspace protocol error (browsing session)',
          { error: err, url: request.url },
        );
        return new Response('Internal error', { status: 500 });
      }
    });

    this.logger.debug(
      '[PagesService] Registered workspace protocol handler for browsing session',
    );

    // Register plans:// protocol on the browsing session so that
    // internal pages (stagewise://internal/plan/*) can fetch plan files.
    ses.protocol.handle('plans', async (request) => {
      try {
        const secFetchSite = request.headers.get('Sec-Fetch-Site');
        if (secFetchSite === 'cross-site')
          return new Response('Forbidden', { status: 403 });

        const url = new URL(request.url);
        const filename = decodeURIComponent(url.pathname.replace(/^\//, ''));

        if (!filename)
          return new Response('Invalid plans URL', { status: 400 });

        const plansDir = getPlansDir();
        const absolutePath = path.resolve(plansDir, filename);
        if (!absolutePath.startsWith(plansDir + path.sep))
          return new Response('Path traversal denied', { status: 400 });

        const mime = inferMimeType(filename);
        const fileUrl = pathToFileURL(absolutePath).href;
        const fileResponse = await net.fetch(fileUrl);

        return new Response(fileResponse.body, {
          status: 200,
          headers: { 'Content-Type': mime },
        });
      } catch (err) {
        this.logger.error(
          '[PagesService] plans protocol error (browsing session)',
          { error: err, url: request.url },
        );
        return new Response('Internal error', { status: 500 });
      }
    });

    this.logger.debug(
      '[PagesService] Registered plans protocol handler for browsing session',
    );
  }

  private registerProcedureHandlers(): void {
    this.kartonServer.registerServerProcedureHandler(
      'getHistory',
      async (
        _callingClientId: string,
        filter: HistoryFilter,
      ): Promise<HistoryResult[]> => {
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
      async (
        _callingClientId: string,
        filter: DownloadsFilter,
      ): Promise<DownloadResult[]> => {
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
      async (_callingClientId: string): Promise<ActiveDownloadInfo[]> => {
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
      async (
        _callingClientId: string,
        downloadId: number,
      ): Promise<DownloadControlResult> => {
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
          this.report(error as Error, 'deleteDownload');
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
      async (
        _callingClientId: string,
        filePath: string,
      ): Promise<DownloadControlResult> => {
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
          this.report(error as Error, 'openDownloadFile');
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
      async (
        _callingClientId: string,
        filePath: string,
      ): Promise<DownloadControlResult> => {
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
          this.report(error as Error, 'showDownloadInFolder');
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
      async (
        _callingClientId: string,
        downloadId: number,
      ): Promise<DownloadControlResult> => {
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
      async (
        _callingClientId: string,
        downloadId: number,
      ): Promise<DownloadControlResult> => {
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
      async (
        _callingClientId: string,
        downloadId: number,
      ): Promise<DownloadControlResult> => {
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
      async (_callingClientId: string): Promise<void> => {
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
        _callingClientId: string,
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
      async (
        _callingClientId: string,
        url: string,
        setActive?: boolean,
      ): Promise<void> => {
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
        _callingClientId: string,
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
          permissionExceptions: options.permissionExceptions,
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
            // Also clear thumbnails when favicons are cleared
            if (this.thumbnailService) {
              await this.thumbnailService.clearAllData();
            }
          } else if (options.history) {
            // If only history was cleared, clean up orphaned favicons
            result.faviconsCleared =
              await this.faviconService.cleanupOrphanedFavicons();
          }

          // Clear thumbnails when cache is cleared
          if (options.cache && this.thumbnailService) {
            await this.thumbnailService.clearAllData();
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

          // Clear permission exceptions if requested
          if (options.permissionExceptions) {
            if (this.clearPermissionExceptionsHandler) {
              await this.clearPermissionExceptionsHandler();
              result.permissionExceptionsCleared = true;
              this.logger.debug('[PagesService] Permission exceptions cleared');
            } else {
              this.logger.warn(
                '[PagesService] Permission exceptions clear requested but no handler registered',
              );
            }
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
            if ((options.favicons || options.cache) && this.thumbnailService) {
              vacuumPromises.push(this.thumbnailService.vacuum());
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
          this.report(error as Error, 'clearBrowsingData');
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
      async (
        _callingClientId: string,
        agentInstanceId: string,
      ): Promise<PendingEditsResult> => {
        if (!this.getPendingEditsHandler) {
          this.logger.warn(
            '[PagesService] getPendingEdits called but no handler is set',
          );
          return { found: false, edits: [] };
        }
        return this.getPendingEditsHandler(agentInstanceId);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'acceptAllPendingEdits',
      async (
        _callingClientId: string,
        agentInstanceId: string,
      ): Promise<void> => {
        if (!this.acceptAllPendingEditsHandler) {
          this.logger.warn(
            '[PagesService] acceptAllPendingEdits called but no handler is set',
          );
          return;
        }
        await this.acceptAllPendingEditsHandler(agentInstanceId);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'rejectAllPendingEdits',
      async (
        _callingClientId: string,
        agentInstanceId: string,
      ): Promise<void> => {
        if (!this.rejectAllPendingEditsHandler) {
          this.logger.warn(
            '[PagesService] rejectAllPendingEdits called but no handler is set',
          );
          return;
        }
        await this.rejectAllPendingEditsHandler(agentInstanceId);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'acceptPendingEdit',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        fileId: string,
      ): Promise<void> => {
        if (!this.acceptPendingEditHandler) {
          this.logger.warn(
            '[PagesService] acceptPendingEdit called but no handler is set',
          );
          return;
        }
        await this.acceptPendingEditHandler(agentInstanceId, fileId);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'rejectPendingEdit',
      async (
        _callingClientId: string,
        agentInstanceId: string,
        fileId: string,
      ): Promise<void> => {
        if (!this.rejectPendingEditHandler) {
          this.logger.warn(
            '[PagesService] rejectPendingEdit called but no handler is set',
          );
          return;
        }
        await this.rejectPendingEditHandler(agentInstanceId, fileId);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'getExternalFileContent',
      async (
        _callingClientId: string,
        oid: string,
      ): Promise<ExternalFileContentResult | null> => {
        if (!this.getExternalFileContentHandler) {
          this.logger.warn(
            '[PagesService] getExternalFileContent called but no handler is set',
          );
          return null;
        }
        return this.getExternalFileContentHandler(oid);
      },
    );

    // Search engine procedures
    this.kartonServer.registerServerProcedureHandler(
      'getSearchEngines',
      async (_callingClientId: string) => {
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
      async (_callingClientId: string, input: AddSearchEngineInput) => {
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
          this.report(error as Error, 'addSearchEngine');
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
      async (_callingClientId: string, id: number) => {
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
          this.report(error as Error, 'removeSearchEngine');
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

    // Home page procedure handlers
    this.kartonServer.registerServerProcedureHandler(
      'getInspirationWebsites',
      async (
        _callingClientId: string,
        params: { offset: number; limit: number },
      ): Promise<InspirationWebsite> => {
        if (!this.userExperienceService) {
          this.logger.warn(
            '[PagesService] getInspirationWebsites called but UserExperienceService not set',
          );
          return { websites: [], total: 0, seed: '' };
        }
        return this.userExperienceService.getInspirationWebsites(params);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'setHasSeenOnboardingFlow',
      async (_callingClientId: string, value: boolean): Promise<void> => {
        if (!this.userExperienceService) {
          this.logger.warn(
            '[PagesService] setHasSeenOnboardingFlow called but UserExperienceService not set',
          );
          return;
        }
        await this.userExperienceService.setHasSeenOnboardingFlow(value);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'trustCertificateAndReload',
      async (
        _callingClientId: string,
        tabId: string,
        origin: string,
      ): Promise<void> => {
        if (!this.trustCertificateAndReloadHandler) {
          this.logger.warn(
            '[PagesService] trustCertificateAndReload called but no handler is set',
          );
          return;
        }
        await this.trustCertificateAndReloadHandler(tabId, origin);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'setGlobalConfig',
      async (_callingClientId: string, config: GlobalConfig): Promise<void> => {
        if (!this.setGlobalConfigHandler) {
          this.logger.warn(
            '[PagesService] setGlobalConfig called but no handler is set',
          );
          return;
        }
        await this.setGlobalConfigHandler(config);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'getContextFiles',
      async (_callingClientId: string): Promise<ContextFilesResult> => {
        if (!this.getContextFilesHandler) {
          this.logger.warn(
            '[PagesService] getContextFiles called but no handler is set',
          );
          // Return a default response indicating no workspace
          return {};
        }
        return await this.getContextFilesHandler();
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'generateWorkspaceMd',
      async (
        _callingClientId: string,
        workspacePath: string,
      ): Promise<void> => {
        if (!this.generateWorkspaceMdHandler) {
          throw new Error('[PagesService] generateWorkspaceMd handler not set');
        }
        await this.generateWorkspaceMdHandler(workspacePath);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'scanLocalPorts',
      async (_callingClientId: string): Promise<void> => {
        if (!this.scanLocalPortsHandler) {
          this.logger.warn(
            '[PagesService] scanLocalPorts called but no handler is set',
          );
          return;
        }
        await this.scanLocalPortsHandler();
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'getThumbnailsForOrigins',
      async (
        _callingClientId: string,
        origins: string[],
      ): Promise<Record<string, OriginThumbnailResult>> => {
        if (!this.thumbnailService) {
          return {};
        }
        const map =
          await this.thumbnailService.getThumbnailsForOrigins(origins);
        const result: Record<string, OriginThumbnailResult> = {};
        for (const [origin, thumbnail] of map) {
          result[origin] = thumbnail;
        }
        return result;
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'getUsageCurrent',
      async (_callingClientId: string): Promise<CurrentUsageResponse> => {
        if (!this.getUsageCurrentHandler) {
          throw new Error('Usage handler not available');
        }
        return this.getUsageCurrentHandler();
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'getUsageHistory',
      async (
        _callingClientId: string,
        params: { days?: number },
      ): Promise<UsageHistoryResponse> => {
        if (!this.getUsageHistoryHandler) {
          throw new Error('Usage handler not available');
        }
        return this.getUsageHistoryHandler(params);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'getMostVisitedOrigins',
      async (
        _callingClientId: string,
        params: { offset: number; limit: number },
      ): Promise<MostVisitedOriginEntry[]> => {
        const origins = await this.historyService.getMostVisitedOrigins({
          limit: params.limit,
          offset: params.offset,
          timespanDays: 3,
          minVisitCount: 1,
        });

        if (origins.length === 0) return [];

        // Single batched query for titles + last URLs instead of N+1 calls
        const details = await this.historyService.getLastVisitedUrlsForOrigins(
          origins.map((o) => o.origin),
        );

        // Batch-fetch favicon URLs for the last visited pages
        const lastUrls = [...details.values()]
          .map((d) => d.url)
          .filter(Boolean);
        const faviconMap =
          lastUrls.length > 0
            ? await this.faviconService.getFaviconsForUrls(lastUrls)
            : new Map<string, string>();

        return origins.map((o) => {
          const detail = details.get(o.origin);
          return {
            origin: o.origin,
            visitCount: o.visitCount,
            lastVisitTime: o.lastVisitTime.getTime(),
            title: detail?.title ?? null,
            lastUrl: detail?.url ?? null,
            faviconUrl: (detail?.url && faviconMap.get(detail.url)) ?? null,
          };
        });
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
    handler: (agentInstanceId: string) => Promise<PendingEditsResult>,
  ): void {
    this.getPendingEditsHandler = handler;
  }

  /**
   * Set the handler for accepting all pending edits. This should be called by main.ts.
   */
  public setAcceptAllPendingEditsHandler(
    handler: (agentInstanceId: string) => Promise<void>,
  ): void {
    this.acceptAllPendingEditsHandler = handler;
  }

  /**
   * Set the handler for rejecting all pending edits. This should be called by main.ts.
   */
  public setRejectAllPendingEditsHandler(
    handler: (agentInstanceId: string) => Promise<void>,
  ): void {
    this.rejectAllPendingEditsHandler = handler;
  }

  /**
   * Set the handler for accepting a single pending edit. This should be called by main.ts.
   */
  public setAcceptPendingEditHandler(
    handler: (agentInstanceId: string, fileId: string) => Promise<void>,
  ): void {
    this.acceptPendingEditHandler = handler;
  }

  /**
   * Set the handler for rejecting a single pending edit. This should be called by main.ts.
   */
  public setRejectPendingEditHandler(
    handler: (agentInstanceId: string, fileId: string) => Promise<void>,
  ): void {
    this.rejectPendingEditHandler = handler;
  }

  /**
   * Set the handler for getting external file content by blob OID.
   * This should be called by main.ts to wire up to DiffHistoryService.
   */
  public setGetExternalFileContentHandler(
    handler: (oid: string) => Promise<ExternalFileContentResult | null>,
  ): void {
    this.getExternalFileContentHandler = handler;
  }

  /**
   * Register handlers for preferences operations.
   * Called by PreferencesService during initialization.
   */
  public registerPreferencesHandlers(
    getHandler: () => UserPreferences,
    updateHandler: (patches: Patch[]) => Promise<void>,
    clearPermissionExceptionsHandler: () => Promise<void>,
    setProviderApiKeyHandler: (
      provider: ModelProvider,
      apiKey: string,
    ) => Promise<void>,
    clearProviderApiKeyHandler: (provider: ModelProvider) => Promise<void>,
    setCustomEndpointApiKeyHandler: (
      endpointId: string,
      apiKey: string,
    ) => Promise<void>,
    clearCustomEndpointApiKeyHandler: (endpointId: string) => Promise<void>,
    setCustomEndpointSecretKeyHandler: (
      endpointId: string,
      secretKey: string,
    ) => Promise<void>,
    setCustomEndpointGoogleCredentialsHandler: (
      endpointId: string,
      credentials: string,
    ) => Promise<void>,
  ): void {
    this.getPreferencesHandler = getHandler;
    this.updatePreferencesHandler = updateHandler;
    this.clearPermissionExceptionsHandler = clearPermissionExceptionsHandler;

    this.kartonServer.registerServerProcedureHandler(
      'getPreferences',
      async (_callingClientId: string) => {
        if (!this.getPreferencesHandler) {
          throw new Error('Preferences handler not registered');
        }
        return this.getPreferencesHandler();
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'updatePreferences',
      async (_callingClientId: string, patches: Patch[]) => {
        if (!this.updatePreferencesHandler) {
          throw new Error('Preferences handler not registered');
        }
        await this.updatePreferencesHandler(patches);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'setProviderApiKey',
      async (
        _callingClientId: string,
        provider: ModelProvider,
        apiKey: string,
      ) => {
        await setProviderApiKeyHandler(provider, apiKey);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'clearProviderApiKey',
      async (_callingClientId: string, provider: ModelProvider) => {
        await clearProviderApiKeyHandler(provider);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'setCustomEndpointApiKey',
      async (_callingClientId: string, endpointId: string, apiKey: string) => {
        await setCustomEndpointApiKeyHandler(endpointId, apiKey);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'clearCustomEndpointApiKey',
      async (_callingClientId: string, endpointId: string) => {
        await clearCustomEndpointApiKeyHandler(endpointId);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'setCustomEndpointSecretKey',
      async (
        _callingClientId: string,
        endpointId: string,
        secretKey: string,
      ) => {
        await setCustomEndpointSecretKeyHandler(endpointId, secretKey);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'setCustomEndpointGoogleCredentials',
      async (
        _callingClientId: string,
        endpointId: string,
        credentials: string,
      ) => {
        await setCustomEndpointGoogleCredentialsHandler(
          endpointId,
          credentials,
        );
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'validateProviderApiKey',
      async (
        _callingClientId: string,
        provider: ModelProvider,
        apiKey: string,
        baseUrl?: string,
      ) => {
        const results = await validateApiKeys({ [provider]: apiKey }, baseUrl);
        return results[provider];
      },
    );

    // Auth procedure handlers
    this.kartonServer.registerServerProcedureHandler(
      'sendOtp',
      async (_callingClientId: string, email: string) => {
        if (!this.sendOtpHandler) {
          return { error: 'Auth service not available' };
        }
        return this.sendOtpHandler(email);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'verifyOtp',
      async (_callingClientId: string, email: string, code: string) => {
        if (!this.verifyOtpHandler) {
          return { error: 'Auth service not available' };
        }
        return this.verifyOtpHandler(email, code);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'logout',
      async (_callingClientId: string) => {
        if (!this.logoutHandler) {
          return;
        }
        await this.logoutHandler();
      },
    );

    this.logger.debug('[PagesService] Preferences handlers registered');
  }

  /**
   * Register handlers for credential CRUD operations.
   * Called by main.ts after CredentialsService is available.
   */
  public registerCredentialHandlers(
    setHandler: (typeId: string, data: Record<string, string>) => Promise<void>,
    deleteHandler: (typeId: string) => Promise<void>,
    listConfiguredHandler: () => string[],
  ): void {
    this.kartonServer.registerServerProcedureHandler(
      'setCredential',
      async (
        _callingClientId: string,
        typeId: string,
        data: Record<string, string>,
      ) => {
        await setHandler(typeId, data);
        this.syncConfiguredCredentialIds(listConfiguredHandler);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'deleteCredential',
      async (_callingClientId: string, typeId: string) => {
        await deleteHandler(typeId);
        this.syncConfiguredCredentialIds(listConfiguredHandler);
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'getConfiguredCredentialIds',
      async (_callingClientId: string) => {
        return listConfiguredHandler();
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'saveWorkspaceFile',
      async (
        _callingClientId: string,
        mountPrefix: string,
        relativePath: string,
        content: string,
      ) => {
        const workspaceRoot = this.findMountPath(mountPrefix);
        if (!workspaceRoot) throw new Error(`Mount not found: ${mountPrefix}`);

        const absolutePath = path.resolve(workspaceRoot, relativePath);
        if (!absolutePath.startsWith(workspaceRoot + path.sep))
          throw new Error('Path traversal denied');

        await writeFile(absolutePath, content, 'utf-8');
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'savePlanFile',
      async (_callingClientId: string, filename: string, content: string) => {
        const plansDir = getPlansDir();
        const absolutePath = path.resolve(plansDir, filename);
        if (!absolutePath.startsWith(plansDir + path.sep))
          throw new Error('Path traversal denied');

        await writeFile(absolutePath, content, 'utf-8');
      },
    );

    this.syncConfiguredCredentialIds(listConfiguredHandler);
    this.logger.debug('[PagesService] Credential handlers registered');
  }

  private syncConfiguredCredentialIds(
    listConfiguredHandler: () => string[],
  ): void {
    this.kartonServer.setState((draft) => {
      draft.configuredCredentialIds = listConfiguredHandler();
    });
  }

  /**
   * Set the UserExperienceService for home page functionality.
   * This should be called by main.ts after UserExperienceService is created.
   */
  public setUserExperienceService(service: UserExperienceService): void {
    this.userExperienceService = service;
  }

  /**
   * Set auth handlers for account management.
   * This should be called by main.ts to wire up to AuthService.
   */
  public setAuthHandlers(handlers: {
    sendOtp: (email: string) => Promise<{ error?: string }>;
    verifyOtp: (email: string, code: string) => Promise<{ error?: string }>;
    logout: () => Promise<void>;
  }): void {
    this.sendOtpHandler = handlers.sendOtp;
    this.verifyOtpHandler = handlers.verifyOtp;
    this.logoutHandler = handlers.logout;
  }

  /**
   * Set the handlers for usage data retrieval.
   * This should be called by pages-handler-wiring to wire up to AuthService.
   */
  public setUsageHandlers(handlers: {
    getUsageCurrent: () => Promise<CurrentUsageResponse>;
    getUsageHistory: (params: {
      days?: number;
    }) => Promise<UsageHistoryResponse>;
  }): void {
    this.getUsageCurrentHandler = handlers.getUsageCurrent;
    this.getUsageHistoryHandler = handlers.getUsageHistory;
  }

  /**
   * Sync user account state to the Pages API Karton state.
   * Called by main.ts when auth state changes.
   */
  public syncUserAccountState(
    state: PagesApiContract['state']['userAccount'],
  ): void {
    this.kartonServer.setState((draft) => {
      draft.userAccount = state;
    });
  }

  /**
   * Set the handler for trusting a certificate and reloading the tab.
   * This should be called by main.ts to wire up to WindowLayoutService.
   */
  public setTrustCertificateAndReloadHandler(
    handler: (tabId: string, origin: string) => Promise<void>,
  ): void {
    this.trustCertificateAndReloadHandler = handler;
  }

  /**
   * Set the handler for setting global config.
   * This should be called by main.ts to wire up to GlobalConfigService.
   */
  public registerGlobalConfigHandler(
    handler: (config: GlobalConfig) => Promise<void>,
  ): void {
    this.setGlobalConfigHandler = handler;
  }

  /**
   * Set the handler for getting context files (.stagewise/, AGENTS.md).
   * This should be called by main.ts to wire up workspace context retrieval.
   */
  public setGetContextFilesHandler(
    handler: () => Promise<ContextFilesResult>,
  ): void {
    this.getContextFilesHandler = handler;
  }

  public setGenerateWorkspaceMdHandler(
    handler: (workspacePath: string) => Promise<void>,
  ): void {
    this.generateWorkspaceMdHandler = handler;
  }

  public syncWorkspaceMdGeneratingState(
    generatingByPath: Record<string, boolean>,
  ): void {
    this.kartonServer.setState((draft) => {
      draft.workspaceMdGenerating = generatingByPath;
    });
  }

  public syncWorkspaceMountsState(mounts: WorkspaceMountInfo[]): void {
    this.kartonServer.setState((draft) => {
      draft.workspaceMounts = mounts;
    });
  }

  public syncPlansState(plans: PlanEntry[]): void {
    this.kartonServer.setState((draft) => {
      draft.plans = plans;
    });
  }

  /**
   * Resolve a mount prefix to its absolute workspace root path
   * by looking up the current workspaceMounts state.
   */
  private findMountPath(prefix: string): string | null {
    for (const mount of this.kartonServer.state.workspaceMounts)
      if (mount.prefix === prefix) return mount.path;

    return null;
  }

  /**
   * Sync global config state to the Pages API Karton state.
   * Called by main.ts when global config changes.
   */
  public syncGlobalConfigState(config: GlobalConfig): void {
    this.kartonServer.setState((draft) => {
      draft.globalConfig = config;
    });
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
    agentInstanceId: string,
    edits: FileDiff[],
  ): void {
    this.kartonServer.setState((draft) => {
      draft.pendingEditsByAgentInstanceId[agentInstanceId] = edits;
    });
  }

  /**
   * Sync home page state to the Pages API Karton state.
   * Called by UserExperienceService when home page data changes.
   */
  public syncHomePageState(state: {
    storedExperienceData?: PagesApiContract['state']['homePage']['storedExperienceData'];
  }): void {
    this.kartonServer.setState((draft) => {
      if (state.storedExperienceData !== undefined) {
        draft.homePage.storedExperienceData = state.storedExperienceData;
      }
    });
  }

  /**
   * Set the handler for triggering a local ports scan.
   * This should be called by main.ts to wire up to LocalPortsScannerService.
   */
  public setScanLocalPortsHandler(handler: () => Promise<void>): void {
    this.scanLocalPortsHandler = handler;
  }

  /**
   * Sync local ports state to the Pages API Karton state.
   * Sorts ports by history (most recently visited first), then by port number.
   * Called by LocalPortsScannerService when discovered ports change.
   */
  public async syncLocalPortsState(
    localPorts: LocalPortEntry[],
  ): Promise<void> {
    // Look up last visit time for each port origin
    const portsWithVisitTime = await Promise.all(
      localPorts.map(async (entry) => {
        const lastVisit = await this.historyService.getLastVisitTimeForOrigin(
          entry.url,
        );
        return { entry, lastVisit };
      }),
    );

    // Sort: visited ports first (most recent on top), unvisited last (by port)
    portsWithVisitTime.sort((a, b) => {
      if (a.lastVisit && b.lastVisit) {
        return b.lastVisit.getTime() - a.lastVisit.getTime();
      }
      if (a.lastVisit) return -1;
      if (b.lastVisit) return 1;
      return a.entry.port - b.entry.port;
    });

    const sorted = portsWithVisitTime.map((p) => p.entry);

    this.kartonServer.setState((draft) => {
      draft.homePage.localPorts = sorted;
    });
  }

  /**
   * Accept a new MessagePort connection for the PagesApi contract.
   *
   * @param port - The MessagePortMain from the main process side
   * @returns The connection ID assigned to this port
   */
  public acceptPort(port: MessagePortMain): string {
    // Setup close listener for connection monitoring
    const closeListener = () => {
      this.logger.warn('[PagesService] MessagePort closed - connection lost');
      this.portCloseListeners.delete(port);
    };

    this.portCloseListeners.set(port, closeListener);
    port.on('close', closeListener);

    // Each internal-page tab gets its own unique connection ID so multiple
    // tabs on stagewise://internal/ pages can coexist without stealing each
    // other's port. The karton server broadcasts state to all connections.
    const id = this.transport.setPort(port);
    this.logger.debug(`[PagesService] Accepted port connection: ${id}`);

    return id;
  }

  /**
   * Sync auto-update state to the Pages API Karton state.
   * Called by pages-state-sync when uiKarton autoUpdate state changes.
   */
  public syncAutoUpdateState(
    state: PagesApiContract['state']['autoUpdate'],
  ): void {
    this.kartonServer.setState((draft) => {
      draft.autoUpdate = state;
    });
  }

  /**
   * Set auto-update action handlers.
   * Called by pages-handler-wiring to wire up to AutoUpdateService.
   */
  public setAutoUpdateHandlers(handlers: {
    checkForUpdates: () => void;
    quitAndInstall: () => void;
  }): void {
    this.autoUpdateCheckHandler = handlers.checkForUpdates;
    this.autoUpdateQuitAndInstallHandler = handlers.quitAndInstall;

    this.kartonServer.registerServerProcedureHandler(
      'autoUpdate.checkForUpdates',
      async (_callingClientId: string) => {
        if (!this.autoUpdateCheckHandler) {
          this.logger.warn(
            '[PagesService] autoUpdate.checkForUpdates called but no handler registered',
          );
          return;
        }
        this.autoUpdateCheckHandler();
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'autoUpdate.quitAndInstall',
      async (_callingClientId: string) => {
        if (!this.autoUpdateQuitAndInstallHandler) {
          this.logger.warn(
            '[PagesService] autoUpdate.quitAndInstall called but no handler registered',
          );
          return;
        }
        this.autoUpdateQuitAndInstallHandler();
      },
    );
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
    this.kartonServer.removeServerProcedureHandler('getExternalFileContent');
    this.kartonServer.removeServerProcedureHandler('getPreferences');
    this.kartonServer.removeServerProcedureHandler('updatePreferences');
    this.kartonServer.removeServerProcedureHandler('getSearchEngines');
    this.kartonServer.removeServerProcedureHandler('addSearchEngine');
    this.kartonServer.removeServerProcedureHandler('removeSearchEngine');
    this.kartonServer.removeServerProcedureHandler('getInspirationWebsites');
    this.kartonServer.removeServerProcedureHandler('setHasSeenOnboardingFlow');
    this.kartonServer.removeServerProcedureHandler('trustCertificateAndReload');
    this.kartonServer.removeServerProcedureHandler('setGlobalConfig');
    this.kartonServer.removeServerProcedureHandler('getContextFiles');
    this.kartonServer.removeServerProcedureHandler('generateWorkspaceMd');
    this.kartonServer.removeServerProcedureHandler('setProviderApiKey');
    this.kartonServer.removeServerProcedureHandler('clearProviderApiKey');
    this.kartonServer.removeServerProcedureHandler('setCustomEndpointApiKey');
    this.kartonServer.removeServerProcedureHandler('clearCustomEndpointApiKey');
    this.kartonServer.removeServerProcedureHandler('validateProviderApiKey');
    this.kartonServer.removeServerProcedureHandler('sendOtp');
    this.kartonServer.removeServerProcedureHandler('verifyOtp');
    this.kartonServer.removeServerProcedureHandler('logout');
    this.kartonServer.removeServerProcedureHandler('scanLocalPorts');
    this.kartonServer.removeServerProcedureHandler('getThumbnailsForOrigins');
    this.kartonServer.removeServerProcedureHandler('getMostVisitedOrigins');
    this.kartonServer.removeServerProcedureHandler('getUsageCurrent');
    this.kartonServer.removeServerProcedureHandler('getUsageHistory');
    this.kartonServer.removeServerProcedureHandler('setCredential');
    this.kartonServer.removeServerProcedureHandler('deleteCredential');
    this.kartonServer.removeServerProcedureHandler(
      'getConfiguredCredentialIds',
    );
    this.kartonServer.removeServerProcedureHandler(
      'autoUpdate.checkForUpdates',
    );
    this.kartonServer.removeServerProcedureHandler('autoUpdate.quitAndInstall');

    // Unregister the protocol handler from the browsing session
    const ses = session.fromPartition('persist:browser-content');
    ses.protocol.unhandle('stagewise');
    ses.protocol.unhandle('plans');

    // Clean up all port close listeners
    this.autoUpdateCheckHandler = undefined;
    this.autoUpdateQuitAndInstallHandler = undefined;
    for (const [port, listener] of this.portCloseListeners.entries()) {
      port.off('close', listener);
    }
    this.portCloseListeners.clear();
    this.openTabHandler = undefined;
    this.userExperienceService = undefined;
    this.trustCertificateAndReloadHandler = undefined;
    this.getContextFilesHandler = undefined;
    this.generateWorkspaceMdHandler = undefined;
    this.getExternalFileContentHandler = undefined;
    this.scanLocalPortsHandler = undefined;
    this.getUsageCurrentHandler = undefined;
    this.getUsageHistoryHandler = undefined;
    this.sendOtpHandler = undefined;
    this.verifyOtpHandler = undefined;
    this.logoutHandler = undefined;

    await this.transport.close();
    this.logger.debug('[PagesService] Teardown complete');
  }
}
