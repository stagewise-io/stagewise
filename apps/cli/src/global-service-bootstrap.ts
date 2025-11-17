import { IdentifierService } from './services/identifier';
import { KartonService } from './services/karton';
import { GlobalDataPathService } from './services/global-data-path';
import { Logger } from './services/logger';
import { TelemetryService } from './services/telemetry';
import { GlobalConfigService } from './services/global-config';
import { NotificationService } from './services/notification';
import { ensureRipgrepInstalled } from '@stagewise/agent-runtime-node';

export type GlobalServicesBootstrapParameters = {
  verbose?: boolean;
};

export type GlobalServices = {
  logger: Logger;
  kartonService: KartonService;
  notificationService: NotificationService;
  globalDataPathService: GlobalDataPathService;
  identifierService: IdentifierService;
  globalConfigService: GlobalConfigService;
  telemetryService: TelemetryService;
};

export async function bootstrapGlobalServices({
  verbose = false,
}: GlobalServicesBootstrapParameters): Promise<GlobalServices> {
  const logger = new Logger(verbose);

  const kartonService = await KartonService.create(logger);
  const notificationService = await NotificationService.create(
    logger,
    kartonService,
  );
  const globalDataPathService = await GlobalDataPathService.create(logger);

  // Ensure ripgrep is installed for improved grep/glob performance
  // If installation fails, the app will continue with Node.js fallback implementations
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
  const identifierService = await IdentifierService.create(
    globalDataPathService,
    logger,
  );
  const globalConfigService = await GlobalConfigService.create(
    globalDataPathService,
    logger,
    kartonService,
  );

  const telemetryService = new TelemetryService(
    identifierService,
    globalConfigService,
    logger,
  );

  return {
    logger,
    kartonService,
    notificationService,
    globalDataPathService,
    identifierService,
    globalConfigService,
    telemetryService,
  };
}
