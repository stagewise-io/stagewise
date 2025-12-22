/**
 * This file stores the main setup for the CLI.
 */

import { app } from 'electron';
import { AuthService } from './services/auth';
import { AgentService } from './services/workspace/services/agent/agent';
import { UserExperienceService } from './services/experience';
import { getEnvMode } from './utils/env';
import { WorkspaceManagerService } from './services/workspace-manager';
import { FilePickerService } from './services/file-picker';
import { existsSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { AppMenuService } from './services/app-menu';
import { URIHandlerService } from './services/uri-handler';
import { IdentifierService } from './services/identifier';
import { GlobalDataPathService } from './services/global-data-path';
import { Logger } from './services/logger';
import { TelemetryService } from './services/telemetry';
import { GlobalConfigService } from './services/global-config';
import { NotificationService } from './services/notification';
import { PagesService } from './services/pages';
import { WindowLayoutService } from './services/window-layout';
import { HistoryService } from './services/history';
import { FaviconService } from './services/favicon';
import { ensureRipgrepInstalled } from '@stagewise/agent-runtime-node';
import { getRepoRootForPath } from './utils/git-tools';
import { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { generateId } from 'ai';

export type MainParameters = {
  launchOptions: {
    workspacePath?: string;
    verbose?: boolean;
    workspaceOnStart?: boolean;
    wrappedCommand?: string;
  };
};

export async function main({
  launchOptions: { workspacePath, verbose, workspaceOnStart, wrappedCommand },
}: MainParameters) {
  // In this file you can include the rest of your app's specific main process
  // code. You can also put them in separate files and import them here.
  const logger = new Logger(verbose ?? false);

  const globalDataPathService = await GlobalDataPathService.create(logger);

  // Create HistoryService and FaviconService early so they can be passed to other services
  const historyService = await HistoryService.create(
    logger,
    globalDataPathService,
  );
  const faviconService = await FaviconService.create(
    logger,
    globalDataPathService,
  );

  // Create PagesService early so it can be passed to WindowLayoutService
  const pagesService = await PagesService.create(
    logger,
    historyService,
    faviconService,
  );

  const windowLayoutService = await WindowLayoutService.create(
    logger,
    globalDataPathService,
    historyService,
    faviconService,
    pagesService,
  );
  const uiKarton = windowLayoutService.uiKarton;

  // Set up URL handlers
  setupUrlHandlers(windowLayoutService, logger);

  const notificationService = await NotificationService.create(
    logger,
    uiKarton,
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
    globalConfigService,
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
  const uriHandlerService = await URIHandlerService.create(logger);

  const authService = await AuthService.create(
    globalDataPathService,
    identifierService,
    uiKarton,
    notificationService,
    uriHandlerService,
    logger,
  );

  const workspaceManagerService = await WorkspaceManagerService.create(
    logger,
    filePickerService,
    telemetryService,
    uiKarton,
    globalDataPathService,
    notificationService,
  );

  workspaceManagerService.registerWorkspaceChangeListener((event) => {
    switch (event.type) {
      case 'loaded': {
        const accessPath = event.accessPath ?? event.selectedPath;
        const absoluteAccessPath =
          accessPath === '{GIT_REPO_ROOT}'
            ? getRepoRootForPath(event.selectedPath)
            : resolve(event.selectedPath, accessPath);
        agentService.setClientRuntime(
          new ClientRuntimeNode({
            workingDirectory: absoluteAccessPath,
            rgBinaryBasePath: globalDataPathService.globalDataPath,
          }),
        );
        if (uiKarton.state.workspaceStatus === 'setup') {
          agentService.createAndActivateNewChat();
          agentService.sendUserMessage({
            id: generateId(),
            role: 'user',
            parts: [
              { type: 'text', text: 'Help me set up the selected workspace!' },
            ],
          });
        }
        break;
      }
      case 'unloaded':
        agentService.setClientRuntime(null);
        break;
      case 'setupCompleted':
        void _userExperienceService.saveRecentlyOpenedWorkspace({
          path: event.workspacePath,
          name: event.name ?? '',
          openedAt: Date.now(),
        });
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

  const agentService = await AgentService.create(
    logger,
    telemetryService,
    uiKarton,
    globalConfigService,
    authService,
    windowLayoutService,
    async (params) => {
      await workspaceManagerService.workspace?.setupService?.handleSetupSubmission(
        {
          agentAccessPath: params.agentAccessPath,
        },
        params.appPath,
      );
      agentService.setCurrentWorkingDirectory(
        params.agentAccessPath === '{GIT_REPO_ROOT}'
          ? getRepoRootForPath(params.appPath)
          : resolve(params.appPath, params.agentAccessPath),
      );
    },
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

  logger.debug('[Main] Normal operation services bootstrapped');

  // Set initial app info into the karton service.
  uiKarton.setState((draft) => {
    draft.appInfo.version = process.env.CLI_VERSION ?? '0.0.1';
    draft.appInfo.envMode =
      getEnvMode() === 'dev' ? 'development' : 'production';
    draft.appInfo.verbose = verbose ?? false;
    draft.appInfo.startedInPath = process.cwd();
    draft.appInfo.platform = process.platform as 'darwin' | 'linux' | 'win32';
  });

  logger.debug('[Main] App info set into karton service');

  // After all services got started, we're now ready to load the initial workspace (which is either the user given path or the cwd).
  // We only load the current workspace as default workspace if the folder contains a stagewise.json file. (We don't verify it tho)
  const workspacePathToLoad =
    workspacePath ??
    (existsSync(path.resolve(process.cwd(), 'stagewise.json'))
      ? process.cwd()
      : undefined);

  if (workspaceOnStart && workspacePathToLoad) {
    logger.debug('[Main] Loading initial workspace...');
    await workspaceManagerService.loadWorkspace(
      workspacePath ?? process.cwd(),
      true,
      !!workspacePath,
      wrappedCommand,
    );
    logger.debug('[Main] Initial workspace loaded');
  }

  logger.debug('[Main] Startup complete');

  // Handle command line arguments for URLs on initial startup
  handleCommandLineUrls(process.argv, windowLayoutService, logger);
}

/**
 * Checks if a string is a valid URL (http/https)
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extracts URLs from command line arguments
 */
function extractUrlsFromArgs(argv: string[]): string[] {
  const urls: string[] = [];
  for (const arg of argv) {
    // Skip non-URL arguments
    if (arg.startsWith('-') || arg.includes('stagewise:/')) {
      continue;
    }
    if (isValidUrl(arg)) {
      urls.push(arg);
    }
  }
  return urls;
}

/**
 * Sets up event handlers for opening URLs
 */
function setupUrlHandlers(
  windowLayoutService: WindowLayoutService,
  logger: Logger,
): void {
  // Handle 'open-url' event (macOS)
  app.on('open-url', (ev: Electron.Event, url: string) => {
    ev.preventDefault();
    logger.debug(`[Main] open-url event received: ${url}`);
    if (isValidUrl(url)) {
      void windowLayoutService.openUrl(url);
    }
  });

  // Handle 'second-instance' event (when app is already running)
  app.on('second-instance', (_ev: Electron.Event, argv: string[]) => {
    logger.debug(`[Main] second-instance event received with argv: ${argv}`);
    const urls = extractUrlsFromArgs(argv);
    for (const url of urls) {
      void windowLayoutService.openUrl(url);
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
    void windowLayoutService.openUrl(urls[0]);
    // Open remaining URLs after a short delay to ensure the first one is processed
    for (let i = 1; i < urls.length; i++) {
      setTimeout(() => {
        void windowLayoutService.openUrl(urls[i]);
      }, i * 100);
    }
  }
}
