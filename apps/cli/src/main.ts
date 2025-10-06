/**
 * This file stores the main setup for the CLI.
 */

import { AuthService } from './services/auth';
import { ExperienceStateService } from './services/experience-state';
import { getEnvMode } from './utils/env';
import { bootstrapGlobalServices } from './global-service-bootstrap';
import { WorkspaceManagerService } from './services/workspace-manager';
import { UIServerService } from './services/ui-server';
import { FilePickerService } from './services/file-picker';

export type MainParameters = {
  launchOptions: {
    port?: number;
    appPort?: number; // Will only be respected on the initially launched workspace.
    workspacePath?: string;
    verbose?: boolean;
    bridgeMode?: boolean;
    workspaceOnStart?: boolean;
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
  },
}: MainParameters) {
  const {
    logger,
    kartonService,
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
    logger,
    kartonService,
    notificationService,
  );
  const _experienceStateService = await ExperienceStateService.create(
    logger,
    kartonService,
  );
  const workspaceManagerService = await WorkspaceManagerService.create(
    logger,
    filePickerService,
    telemetryService,
    kartonService,
    authService,
    globalDataPathService,
  );
  const uiServerService = await UIServerService.create(
    logger,
    kartonService.webSocketServer,
    workspaceManagerService,
    authService,
    port,
  );

  logger.debug('[Main] Normal operation services bootstrapped');

  // Set initial app info into the karton service.
  kartonService.setState((draft) => {
    draft.appInfo.version = process.env.CLI_VERSION ?? '0.0.1';
    draft.appInfo.envMode =
      getEnvMode() === 'dev' ? 'development' : 'production';
    draft.appInfo.verbose = verbose ?? false;
    draft.appInfo.bridgeMode = bridgeMode ?? false;
    draft.appInfo.runningOnPort = uiServerService.port;
  });

  logger.debug('[Main] App info set into karton service');

  // After all services got started, we're now ready to load the initial workspace (which is either the user given path or the cwd).
  if (workspaceOnStart) {
    logger.debug('[Main] Loading initial workspace...');
    await workspaceManagerService.loadWorkspace(
      workspacePath ?? process.cwd(),
      {
        appPort: appPort ?? undefined,
      },
      true,
      !!workspacePath,
    );
    logger.debug('[Main] Initial workspace loaded');
  }

  logger.debug('[Main] Startup complete');
}
