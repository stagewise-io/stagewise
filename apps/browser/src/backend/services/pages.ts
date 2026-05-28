import { net, session, shell } from 'electron';
import type { Logger } from './logger';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
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
import type { GlobalConfig } from '@shared/karton-contracts/ui/shared-types';
import type { HistoryService } from './history';
import type { FaviconService } from './favicon';
import type {
  ClearBrowsingDataOptions,
  ClearBrowsingDataResult,
  PendingEditsResult,
  ExternalFileContentResult,
  HistoryFilter,
  HistoryResult,
  FaviconBitmapResult,
} from '@shared/karton-contracts/pages-api/types';
import { DisposableService } from './disposable';
import type { TelemetryService } from './telemetry';
import { isUIEventName, parseUIEventProperties } from './telemetry';
import { getPlansDir } from '@/utils/paths';

declare const PAGES_VITE_DEV_SERVER_URL: string;
declare const PAGES_VITE_NAME: string;

/**
 * Service responsible for the stagewise:// protocol handler for the pages
 * renderer (internal pages: history, downloads, diff-review, plans) and the
 * PagesApi Karton contract for communication with those pages.
 */
export class PagesService extends DisposableService {
  private readonly logger: Logger;
  private readonly historyService: HistoryService;
  private readonly faviconService: FaviconService;
  private kartonServer: KartonServer<PagesApiContract>;
  private transport: ElectronServerTransport;
  private portCloseListeners = new Map<MessagePortMain, () => void>();
  private openTabHandler?: (url: string, setActive?: boolean) => Promise<void>;
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
  private clearPermissionExceptionsHandler?: () => Promise<void>;
  private trustCertificateAndReloadHandler?: (
    tabId: string,
    origin: string,
  ) => Promise<void>;
  private getExternalFileContentHandler?: (
    oid: string,
  ) => Promise<ExternalFileContentResult | null>;

  private readonly telemetryService: TelemetryService;

  private constructor(
    logger: Logger,
    historyService: HistoryService,
    faviconService: FaviconService,
    telemetryService: TelemetryService,
  ) {
    super();
    this.logger = logger;
    this.historyService = historyService;
    this.faviconService = faviconService;
    this.telemetryService = telemetryService;

    this.transport = new ElectronServerTransport();

    this.kartonServer = createKartonServer<PagesApiContract>({
      initialState: defaultState,
      transport: this.transport,
    });

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
    telemetryService: TelemetryService,
  ): Promise<PagesService> {
    const instance = new PagesService(
      logger,
      historyService,
      faviconService,
      telemetryService,
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
      let normalizedRequestUrl = request.url;
      if (
        normalizedRequestUrl === 'stagewise://' ||
        normalizedRequestUrl.endsWith('://')
      )
        normalizedRequestUrl = 'stagewise://internal/';

      let url: URL;
      try {
        url = new URL(normalizedRequestUrl);
      } catch (err) {
        this.logger.error(
          `[PagesService] Failed to parse URL: ${err}. Redirecting to not-found page.`,
        );
        return Response.redirect('stagewise://internal/not-found', 302);
      }

      if (url.hostname !== 'internal') {
        this.logger.debug(
          `[PagesService] Redirecting request with origin: ${url.hostname} to not-found page. Only "internal" origin is allowed.`,
        );
        return Response.redirect('stagewise://internal/not-found', 302);
      }

      if (PAGES_VITE_DEV_SERVER_URL) {
        const pathname = url.pathname || '/';
        const search = url.search || '';
        const devServerUrl = `${PAGES_VITE_DEV_SERVER_URL}${pathname}${search}`;
        return net.fetch(devServerUrl);
      }

      const requestPath = url.pathname || '/';

      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const pagesBaseDir = path.resolve(
        __dirname,
        `../renderer/${PAGES_VITE_NAME}`,
      );

      if (!requestPath || requestPath === '/') {
        const indexPath = path.resolve(pagesBaseDir, 'index.html');
        const normalizedIndexPath = indexPath.replace(/\\/g, '/');
        const fileUrl = `file:///${normalizedIndexPath}`;
        return net.fetch(fileUrl);
      }

      const normalizedPath = requestPath.startsWith('/')
        ? requestPath.slice(1)
        : requestPath;
      const filePath = path.resolve(pagesBaseDir, normalizedPath);

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

    // workspace:// protocol
    ses.protocol.handle('workspace', async (request) => {
      try {
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

    // plans:// protocol
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
      'getHistory',
      async (
        _callingClientId: string,
        filter: HistoryFilter,
      ): Promise<HistoryResult[]> => {
        const results = await this.historyService.queryHistory(filter);
        const pageUrls = results.map((result) => result.url);
        const faviconMap =
          await this.faviconService.getFaviconsForUrls(pageUrls);
        return results.map((result) => ({
          ...result,
          faviconUrl: faviconMap.get(result.url) ?? null,
        }));
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
        const result: Record<string, FaviconBitmapResult> = {};
        for (const [url, bitmap] of bitmapMap) {
          result[url] = bitmap;
        }
        return result;
      },
    );

    this.kartonServer.registerServerProcedureHandler(
      'openExternalUrl',
      async (_callingClientId: string, url: string): Promise<void> => {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          this.logger.warn(
            `[PagesService] Rejected openExternalUrl (unparseable, length=${url.length})`,
          );
          return;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          this.logger.warn(
            `[PagesService] Rejected openExternalUrl (bad scheme ${parsed.protocol}): ${parsed.protocol}//${parsed.host}`,
          );
          return;
        }
        await shell.openExternal(parsed.toString());
      },
    );

    // Bridge pages-renderer telemetry into the backend TelemetryService.
    this.kartonServer.registerServerProcedureHandler(
      'captureTelemetry',
      async (
        _callingClientId: string,
        eventName: string,
        properties?: Record<string, unknown>,
      ): Promise<void> => {
        if (!isUIEventName(eventName)) {
          this.logger.warn(
            `[PagesService] Ignoring unknown UI telemetry event: ${eventName}`,
          );
          return;
        }
        const parsedProperties = parseUIEventProperties(eventName, properties);
        if (parsedProperties === null) {
          this.logger.warn(
            `[PagesService] Ignoring invalid UI telemetry payload for event: ${eventName}`,
          );
          return;
        }
        this.telemetryService.capture(eventName, parsedProperties);
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
  }

  // ── Public setter methods (called by wiring) ──

  public setOpenTabHandler(
    handler: (url: string, setActive?: boolean) => Promise<void>,
  ): void {
    this.openTabHandler = handler;
  }

  public setGetPendingEditsHandler(
    handler: (agentInstanceId: string) => Promise<PendingEditsResult>,
  ): void {
    this.getPendingEditsHandler = handler;
  }

  public setAcceptAllPendingEditsHandler(
    handler: (agentInstanceId: string) => Promise<void>,
  ): void {
    this.acceptAllPendingEditsHandler = handler;
  }

  public setRejectAllPendingEditsHandler(
    handler: (agentInstanceId: string) => Promise<void>,
  ): void {
    this.rejectAllPendingEditsHandler = handler;
  }

  public setAcceptPendingEditHandler(
    handler: (agentInstanceId: string, fileId: string) => Promise<void>,
  ): void {
    this.acceptPendingEditHandler = handler;
  }

  public setRejectPendingEditHandler(
    handler: (agentInstanceId: string, fileId: string) => Promise<void>,
  ): void {
    this.rejectPendingEditHandler = handler;
  }

  public setGetExternalFileContentHandler(
    handler: (oid: string) => Promise<ExternalFileContentResult | null>,
  ): void {
    this.getExternalFileContentHandler = handler;
  }

  public setTrustCertificateAndReloadHandler(
    handler: (tabId: string, origin: string) => Promise<void>,
  ): void {
    this.trustCertificateAndReloadHandler = handler;
  }

  public setClearPermissionExceptionsHandler(
    handler: () => Promise<void>,
  ): void {
    this.clearPermissionExceptionsHandler = handler;
  }

  // ── State sync methods ──

  public syncGlobalConfigState(config: GlobalConfig): void {
    this.kartonServer.setState((draft) => {
      draft.globalConfig = config;
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

  public updatePendingEditsState(
    agentInstanceId: string,
    edits: FileDiff[],
  ): void {
    this.kartonServer.setState((draft) => {
      draft.pendingEditsByAgentInstanceId[agentInstanceId] = edits;
    });
  }

  // ── Port & lifecycle ──

  private findMountPath(prefix: string): string | null {
    for (const mount of this.kartonServer.state.workspaceMounts)
      if (mount.prefix === prefix) return mount.path;
    return null;
  }

  public acceptPort(port: MessagePortMain): string {
    const closeListener = () => {
      this.logger.warn('[PagesService] MessagePort closed - connection lost');
      this.portCloseListeners.delete(port);
    };
    this.portCloseListeners.set(port, closeListener);
    port.on('close', closeListener);
    const id = this.transport.setPort(port);
    this.logger.debug(`[PagesService] Accepted port connection: ${id}`);
    return id;
  }

  /**
   * Clear browsing data. Public method callable from the main UI Karton
   * handler (preferences.ts) as well.
   */
  async clearBrowsingData(
    options: ClearBrowsingDataOptions,
  ): Promise<ClearBrowsingDataResult> {
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
      const result: ClearBrowsingDataResult = { success: true };

      if (options.history) {
        if (options.timeRange?.start || options.timeRange?.end) {
          const start = options.timeRange.start ?? new Date(0);
          const end = options.timeRange.end ?? new Date();
          result.historyEntriesCleared =
            await this.historyService.clearHistoryRange(start, end);
        } else {
          result.historyEntriesCleared =
            await this.historyService.clearAllData();
        }
      }

      if (options.downloads) {
        // Downloads clearing is not time-range scoped — only clear for
        // "all time" requests to avoid unexpectedly wiping the full
        // download history when the user expects a limited clear.
        if (options.timeRange?.start || options.timeRange?.end) {
          this.logger.debug(
            '[PagesService] Skipping downloads clear — time-range not supported',
          );
        } else {
          result.downloadsCleared =
            (await this.historyService.clearDownloads()) > 0;
        }
      }

      if (options.favicons) {
        result.faviconsCleared = await this.faviconService.clearAllData();
      } else if (options.history) {
        result.faviconsCleared =
          await this.faviconService.cleanupOrphanedFavicons();
      }

      const ses = session.fromPartition('persist:browser-content');

      if (options.cache) {
        await ses.clearCache();
        result.cacheCleared = true;
        this.logger.debug('[PagesService] HTTP cache cleared');
      }

      const storageTypes: string[] = [];
      if (options.cookies) storageTypes.push('cookies');
      if (options.storage) storageTypes.push('localstorage');
      if (options.indexedDB) storageTypes.push('indexdb');
      if (options.serviceWorkers) storageTypes.push('serviceworkers');
      if (options.cacheStorage) storageTypes.push('cachestorage');

      if (storageTypes.length > 0) {
        const clearStorageOptions: Electron.ClearStorageDataOptions = {
          storages:
            storageTypes as Electron.ClearStorageDataOptions['storages'],
        };

        if (
          options.cookies &&
          options.timeRange?.start &&
          storageTypes.length === 1
        ) {
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

      this.logger.info('[PagesService] Clear browsing data completed', result);
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
  }

  protected async onTeardown(): Promise<void> {
    this.logger.debug('[PagesService] Tearing down...');

    this.kartonServer.removeServerProcedureHandler('openTab');
    this.kartonServer.removeServerProcedureHandler('openExternalUrl');
    this.kartonServer.removeServerProcedureHandler('captureTelemetry');
    this.kartonServer.removeServerProcedureHandler('getPendingEdits');
    this.kartonServer.removeServerProcedureHandler('acceptAllPendingEdits');
    this.kartonServer.removeServerProcedureHandler('rejectAllPendingEdits');
    this.kartonServer.removeServerProcedureHandler('acceptPendingEdit');
    this.kartonServer.removeServerProcedureHandler('rejectPendingEdit');
    this.kartonServer.removeServerProcedureHandler('getExternalFileContent');
    this.kartonServer.removeServerProcedureHandler('trustCertificateAndReload');

    const ses = session.fromPartition('persist:browser-content');
    ses.protocol.unhandle('stagewise');
    ses.protocol.unhandle('workspace');
    ses.protocol.unhandle('plans');

    for (const [port, listener] of this.portCloseListeners.entries()) {
      port.off('close', listener);
    }
    this.portCloseListeners.clear();
    this.openTabHandler = undefined;
    this.trustCertificateAndReloadHandler = undefined;
    this.getExternalFileContentHandler = undefined;

    await this.transport.close();
    this.logger.debug('[PagesService] Teardown complete');
  }
}
