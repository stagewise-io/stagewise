import { net, session } from 'electron';
import type { Logger } from './logger';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
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
import type { HistoryService } from './history';
import type { FaviconService } from './favicon';
import type {
  HistoryFilter,
  HistoryResult,
  FaviconBitmapResult,
  ClearBrowsingDataOptions,
  ClearBrowsingDataResult,
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
  private kartonServer: KartonServer<PagesApiContract>;
  private transport: ElectronServerTransport;
  private currentPort?: MessagePortMain;
  private portCloseListeners = new Map<MessagePortMain, () => void>();
  private openTabHandler?: (url: string, setActive?: boolean) => Promise<void>;

  private constructor(
    logger: Logger,
    historyService: HistoryService,
    faviconService: FaviconService,
  ) {
    super();
    this.logger = logger;
    this.historyService = historyService;
    this.faviconService = faviconService;

    this.transport = new ElectronServerTransport();

    this.kartonServer = createKartonServer<PagesApiContract>({
      initialState: defaultState,
      transport: this.transport,
    });

    this.logger.debug(
      '[PagesService] Karton server initialized with MessagePort transport',
    );
  }

  public static async create(
    logger: Logger,
    historyService: HistoryService,
    faviconService: FaviconService,
  ): Promise<PagesService> {
    const instance = new PagesService(logger, historyService, faviconService);
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
