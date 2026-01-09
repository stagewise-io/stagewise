import { app } from 'electron';
import type { Logger } from './logger';
import path from 'node:path';
import { DisposableService } from './disposable';

/**
 * Service responsible for registering the app as the default protocol client for stagewise:// URLs.
 * This enables the OS to route stagewise:// URLs to this app.
 *
 * Note: URL handling is done in main.ts via setupUrlHandlers() and handleCommandLineUrls().
 * This service only sets up the protocol registration.
 */
export class URIHandlerService extends DisposableService {
  private readonly logger: Logger;

  private constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  public static async create(logger: Logger): Promise<URIHandlerService> {
    const instance = new URIHandlerService(logger);
    await instance.initialize();
    logger.debug('[URIHandlerService] Created service');
    return instance;
  }

  private async initialize(): Promise<void> {
    // Register as default protocol client for stagewise:// URLs
    app.setAsDefaultProtocolClient('stagewise');

    // In development mode, we need to pass the script path for the protocol to work
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('stagewise', process.execPath, [
          path.resolve(process.argv[1]),
        ]);
      }
    }

    this.logger.debug('[URIHandlerService] Set as default protocol client');
    this.logger.debug(
      `[URIHandlerService] Is default protocol client: ${app.isDefaultProtocolClient('stagewise') ? 'yes' : 'no'}`,
    );
  }

  protected onTeardown(): void {
    this.logger.debug('[URIHandlerService] Teardown complete');
  }
}
