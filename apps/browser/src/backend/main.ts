/**
 * This file stores the main setup for the CLI.
 */

import { AuthService } from './services/auth';
import { UserExperienceService } from './services/experience';
import { WindowLayoutService } from './services/window-layout';
import { getEnvMode } from './utils/env';
import { bootstrapGlobalServices } from './global-service-bootstrap';
import { WorkspaceManagerService } from './services/workspace-manager';
import { UIServerService } from './services/ui-server';
import { FilePickerService } from './services/file-picker';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { AppMenuService } from './services/app-menu';

export type MainParameters = {
  launchOptions: {
    port?: number;
    appPort?: number; // Will only be respected on the initially launched workspace.
    workspacePath?: string;
    verbose?: boolean;
    bridgeMode?: boolean;
    workspaceOnStart?: boolean;
    wrappedCommand?: string;
  };
};

export async function main({
  launchOptions: {
    port,
    appPort,
    workspacePath,
    verbose,
    bridgeMode,
    workspaceOnStart,
    wrappedCommand,
  },
}: MainParameters) {
  // In this file you can include the rest of your app's specific main process
  // code. You can also put them in separate files and import them here.
  const {
    logger,
    kartonService,
    globalConfigService,
    notificationService,
    globalDataPathService,
    telemetryService,
    identifierService,
  } = await bootstrapGlobalServices({ verbose: verbose });

  logger.debug('[Main] Global services bootstrapped');

  // Start remaining services that are irrelevant to non-regular operation of the app.
  const filePickerService = await FilePickerService.create(
    logger,
    kartonService,
  );
  const authService = await AuthService.create(
    globalDataPathService,
    identifierService,
    kartonService,
    notificationService,
    logger,
  );

  const _windowLayoutService = new WindowLayoutService(logger, kartonService);

  const _appMenuService = new AppMenuService(
    logger,
    authService,
    _windowLayoutService,
  );

  const workspaceManagerService = await WorkspaceManagerService.create(
    logger,
    filePickerService,
    telemetryService,
    kartonService,
    globalConfigService,
    authService,
    globalDataPathService,
    notificationService,
  );
  const _userExperienceService = await UserExperienceService.create(
    logger,
    kartonService,
  );
  const uiServerService = await UIServerService.create(
    logger,
    kartonService.webSocketServer,
    workspaceManagerService,
    authService,
    port,
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
  kartonService.setState((draft) => {
    draft.appInfo.version = process.env.CLI_VERSION ?? '0.0.1';
    draft.appInfo.envMode =
      getEnvMode() === 'dev' ? 'development' : 'production';
    draft.appInfo.verbose = verbose ?? false;
    draft.appInfo.bridgeMode = bridgeMode ?? false;
    draft.appInfo.runningOnPort = uiServerService.port;
    draft.appInfo.startedInPath = process.cwd();
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
      {
        appPort: appPort ?? undefined,
      },
      true,
      !!workspacePath,
      wrappedCommand,
    );
    logger.debug('[Main] Initial workspace loaded');
  }

  logger.debug('[Main] Startup complete');
}
