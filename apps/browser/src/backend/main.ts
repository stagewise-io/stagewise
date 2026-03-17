/**
 * This file stores the main setup for the CLI.
 */

import { app } from 'electron';
import { AuthService } from './services/auth';
import { AgentManagerService } from './services/agent-manager';
import { UserExperienceService } from './services/experience';
import { FilePickerService } from './services/file-picker';
import { AppMenuService } from './services/app-menu';
import { URIHandlerService } from './services/uri-handler';
import { IdentifierService } from './services/identifier';
import { Logger } from './services/logger';
import { TelemetryService } from './services/telemetry';
import { GlobalConfigService } from './services/global-config';
import { PreferencesService } from './services/preferences';
import { NotificationService } from './services/notification';
import { PagesService } from './services/pages';
import { WindowLayoutService } from './services/window-layout';
import { HistoryService } from './services/history';
import { FaviconService } from './services/favicon';
import { ThumbnailService } from './services/thumbnail';
import { WebDataService } from './services/webdata';
import { DownloadsService } from './services/download-manager';
import { DiffHistoryService } from './services/diff-history';
import { AutoUpdateService } from './services/auto-update';
import { LocalPortsScannerService } from './services/local-ports-scanner';
import { DevToolAPIService } from './services/dev-tool-api';
import { OmniboxSuggestionsService } from './services/omnibox-suggestions';
import { ensureRipgrepInstalled } from '@stagewise/agent-runtime-node';
import { ToolboxService } from './services/toolbox';
import { CredentialsService } from './services/credentials';
import type { CredentialTypeId } from '@shared/credential-types';
import { ModelProviderService } from './agents/model-provider';
import { wireDownloads } from './wiring/downloads-wiring';
import { wirePagesStateSync } from './wiring/pages-state-sync';
import { wirePagesHandlers } from './wiring/pages-handler-wiring';
import {
  ensureDataDirectories,
  getPluginsPath,
  getRipgrepBasePath,
} from './utils/paths';
import { migrateLegacyPaths } from './utils/migrate-legacy-paths';
import { discoverPlugins } from './utils/discover-plugins';
import { AssetCacheService } from './services/asset-cache';
import { ProcessedImageCacheService } from './services/processed-image-cache';

export type MainParameters = {
  launchOptions: {
    verbose?: boolean;
  };
};

export async function main({ launchOptions: { verbose } }: MainParameters) {
  // In this file you can include the rest of your app's specific main process
  // code. You can also put them in separate files and import them here.
  const logger = new Logger(verbose ?? false);

  migrateLegacyPaths(logger);

  await ensureDataDirectories();

  // Create PreferencesService, IdentifierService, and TelemetryService first
  // so telemetryService can be passed to all downstream services
  const preferencesService = await PreferencesService.create(logger);
  const identifierService = await IdentifierService.create(logger);
  const telemetryService = new TelemetryService(
    identifierService,
    preferencesService,
    logger,
  );

  telemetryService.capture('app-launched', { cold_start: true });

  // Global safety net: capture any unhandled errors/rejections to telemetry
  process.on('uncaughtException', (error) => {
    logger.error(`[Process] Uncaught exception: ${error.message}`);
    telemetryService.captureException(error, {
      service: 'process',
      operation: 'uncaughtException',
    });
  });
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error(`[Process] Unhandled rejection: ${error.message}`);
    telemetryService.captureException(error, {
      service: 'process',
      operation: 'unhandledRejection',
    });
  });

  // Create database services early so they can be passed to other services
  // WebDataService must be created first as HistoryService depends on it
  // for search term extraction (keyword IDs reference the keywords table)
  const webDataService = await WebDataService.create(logger);
  const historyService = await HistoryService.create(
    logger,
    webDataService,
    telemetryService,
  );
  const faviconService = await FaviconService.create(logger);
  const thumbnailService = await ThumbnailService.create(logger);

  // Evict thumbnails older than 30 days (fire-and-forget)
  thumbnailService.evictStaleThumbnails(30).catch((err) => {
    logger.warn('[Main] Failed to evict stale thumbnails', err);
  });

  // Create DownloadsService to track active downloads for pause/resume/cancel
  const downloadsService = await DownloadsService.create(
    logger,
    historyService,
    telemetryService,
  );

  // Create PagesService early so it can be passed to WindowLayoutService
  const pagesService = await PagesService.create(
    logger,
    historyService,
    faviconService,
    downloadsService,
    webDataService,
    telemetryService,
    thumbnailService,
  );

  // Initialize search engines state
  await pagesService.syncSearchEnginesState();

  // Create LocalPortsScannerService to discover local dev servers
  const localPortsScannerService = await LocalPortsScannerService.create(
    logger,
    pagesService,
  );

  // Wire scan trigger so the UI can request a fresh port scan
  pagesService.setScanLocalPortsHandler(() => localPortsScannerService.scan());

  // Create WindowLayoutService with all dependencies including PreferencesService
  // This also applies the startup page preference during initialization
  const windowLayoutService = await WindowLayoutService.create(
    logger,
    historyService,
    faviconService,
    pagesService,
    preferencesService,
    thumbnailService,
    telemetryService,
  );
  const uiKarton = windowLayoutService.uiKarton;

  // Push bundled plugin definitions to UI karton state
  discoverPlugins(getPluginsPath()).then((plugins) => {
    uiKarton.setState((draft) => {
      draft.plugins = plugins;
    });
    if (verbose)
      logger.debug(
        `[Main] Pushed ${plugins.length} bundled plugins to UI karton`,
      );
  });

  const diffHistoryService = await DiffHistoryService.create(
    logger,
    uiKarton,
    telemetryService,
  );

  // Connect PreferencesService to Karton for reactive sync
  preferencesService.connectKarton(uiKarton, pagesService);

  // Wire downloads UI state, procedure handlers, and pages-api integration
  wireDownloads({
    uiKarton,
    downloadsService,
    historyService,
    pagesService,
    logger,
    telemetryService,
  });

  // Create OmniboxSuggestionsService for omnibox autocomplete
  const _omniboxSuggestionsService = await OmniboxSuggestionsService.create(
    logger,
    uiKarton,
    historyService,
    webDataService,
    faviconService,
    localPortsScannerService,
  );

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
    telemetryService,
    preferencesService,
  );

  const globalConfigService = await GlobalConfigService.create(
    logger,
    uiKarton,
  );

  ensureRipgrepInstalled({
    rgBinaryBasePath: getRipgrepBasePath(),
    onLog: logger.debug,
  })
    .then((result) => {
      if (!result.success) {
        telemetryService.captureException(
          new Error(result.error ?? 'Unknown error'),
          { service: 'main', operation: 'ensureRipgrep' },
        );
        logger.warn(
          `Ripgrep installation failed: ${result.error}. Grep/glob operations will use slower Node.js implementations.`,
        );
      } else {
        if (verbose)
          logger.debug('Ripgrep is available for grep/glob operations');
      }
    })
    .catch((error) => {
      logger.warn(
        `Ripgrep installation failed: ${error}. Grep/glob operations will use slower Node.js implementations.`,
      );
      telemetryService.captureException(error as Error, {
        service: 'main',
        operation: 'ensureRipgrep',
      });
    });

  logger.debug('[Main] Global services bootstrapped');

  // Register telemetry capture RPC so the UI can send events through the backend
  uiKarton.registerServerProcedureHandler(
    'telemetry.capture',
    async (
      _cid: string,
      eventName: string,
      properties?: Record<string, unknown>,
    ) => {
      telemetryService.capture(
        eventName as keyof import('./services/telemetry').EventProperties,
        properties as any,
      );
    },
  );

  // Start remaining services that are irrelevant to non-regular operation of the app.
  const filePickerService = await FilePickerService.create(logger, uiKarton);

  // DevToolAPIService handles devtools-related functionality and state
  const _devToolAPIService = await DevToolAPIService.create(
    logger,
    uiKarton,
    windowLayoutService,
  );

  // URIHandlerService registers the app as the default protocol client for stagewise://
  // URL handling is done in main.ts via setupUrlHandlers() and handleCommandLineUrls()
  await URIHandlerService.create(logger);

  const authService = await AuthService.create(
    identifierService,
    uiKarton,
    notificationService,
    logger,
  );

  const userExperienceService = await UserExperienceService.create(
    logger,
    uiKarton,
    telemetryService,
  );

  const credentialsService = await CredentialsService.create(logger);

  credentialsService.setAccessTokenProvider(() => authService.accessToken);

  const toolboxService = await ToolboxService.create(
    logger,
    uiKarton,
    globalConfigService,
    diffHistoryService,
    windowLayoutService,
    authService,
    telemetryService,
    filePickerService,
    userExperienceService,
    credentialsService,
  );

  const _appMenuService = new AppMenuService(
    logger,
    authService,
    windowLayoutService,
  );

  const modelProviderService = new ModelProviderService(
    telemetryService,
    authService,
    preferencesService,
  );

  const assetCacheService = await AssetCacheService.create(
    () => authService.accessToken,
    logger,
  );

  let processedImageCacheService: ProcessedImageCacheService | undefined;
  try {
    processedImageCacheService =
      await ProcessedImageCacheService.create(logger);
  } catch (err) {
    logger.warn(
      `[main] ProcessedImageCacheService failed to initialise — image caching disabled: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const agentManagerService = new AgentManagerService(
    uiKarton,
    telemetryService,
    toolboxService,
    logger,
    modelProviderService,
    assetCacheService,
    processedImageCacheService,
  );

  // Wire all uiKarton-to-pages state syncs (pending edits, mounts,
  // workspace-md generating, search engines, global config, auth)
  await wirePagesStateSync({
    uiKarton,
    pagesService,
    webDataService,
    globalConfigService,
    authService,
    logger,
    telemetryService,
  });

  // Wire all pages-api handler setters (pending edits accept/reject,
  // context files, certificate trust, auth, home page, etc.)
  wirePagesHandlers({
    uiKarton,
    pagesService,
    diffHistoryService,
    windowLayoutService,
    toolboxService,
    agentManagerService,
    authService,
    userExperienceService,
    logger,
  });

  // Wire credential CRUD operations from CredentialsService to PagesService
  pagesService.registerCredentialHandlers(
    async (typeId, data) => {
      await credentialsService.set(
        typeId as CredentialTypeId,
        data as Parameters<typeof credentialsService.set>[1],
      );
    },
    async (typeId) => {
      await credentialsService.delete(typeId as CredentialTypeId);
    },
    () => credentialsService.listConfigured(),
  );

  logger.debug('[Main] Normal operation services bootstrapped');

  logger.debug('[Main] Startup complete');

  // Handle command line arguments for URLs on initial startup
  handleCommandLineUrls(process.argv, windowLayoutService, logger);

  // Set up graceful shutdown to clean up database connections
  const shutdown = () => {
    logger.debug('[Main] Shutting down services...');
    localPortsScannerService.teardown();
    webDataService.teardown();
    historyService.teardown();
    faviconService.teardown();
    thumbnailService.teardown();
    diffHistoryService.teardown();
    assetCacheService.teardown();
    processedImageCacheService?.teardown();
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
