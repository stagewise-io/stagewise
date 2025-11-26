import { app } from 'electron';
import type { Logger } from './logger';
import path from 'node:path';

/**
 * This service provides the paths to a variety of global data directories that this app can use to store data and configurations etc.
 */
export class URIHandlerService {
  private logger: Logger;
  private _handlers: Record<
    string, // ID of the handler. Is used to delete the handler later.
    {
      pathPrefix: string; // The path prefix that the handler is interested in. If the incoming uri starts with this prefix, the handler is called.
      handler: (uri: string) => void | Promise<void>;
    }
  > = {};

  private constructor(logger: Logger) {
    this.logger = logger;
  }

  public static async create(logger: Logger): Promise<URIHandlerService> {
    const instance = new URIHandlerService(logger);
    await instance.initialize();
    logger.debug('[URIHandlerService] Created service');
    return instance;
  }

  private async initialize(): Promise<void> {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('stagewise', process.execPath, [
          path.resolve(process.argv[1]),
        ]);
      }
    } else {
      app.setAsDefaultProtocolClient('stagewise');
    }
    this.logger.debug('[URIHandlerService] Set as default protocol client');
    this.logger.debug(
      `[URIHandlerService] Is default protocol client: ${app.isDefaultProtocolClient('stagewise') ? 'yes' : 'no'}`,
    );

    app.on('second-instance', this.handleSecondInstance);
    app.on('open-url', this.handleOpenURL);
  }

  public teardown(): void {
    this._handlers = {};
    app.off('second-instance', this.handleSecondInstance);
    app.off('open-url', this.handleOpenURL);
  }

  private handleSecondInstance = ((_ev: Event, argv: string[]) => {
    const uri = argv.find((arg) => arg.startsWith('stagewise://'));
    if (uri) {
      this.handleURI(uri);
    }
  }).bind(this);

  private handleOpenURL = ((ev: Event, uri: string) => {
    ev.preventDefault();
    this.handleURI(uri);
  }).bind(this);

  private async handleURI(uri: string): Promise<void> {
    this.logger.debug(`[URIHandlerService] Handling URI: ${uri}`);

    const extractedPath = uri.trim().replace('stagewise://', '');
    for (const handler of Object.values(this._handlers)) {
      if (extractedPath.startsWith(handler.pathPrefix)) {
        this.logger.debug(
          `[URIHandlerService] Handler found for URI: ${extractedPath}`,
        );
        try {
          void handler.handler(extractedPath);
        } catch (err) {
          this.logger.error(`[URIHandlerService] Error handling URI: ${err}`);
        }
      }
    }
  }

  /**
   * Register a handler for a specific uri pattern. If the pattern matches, the handler is called with the uri.
   *
   * Info: The uri will only be sent to the first matching handler. If no handler matches, the uri is ignored.
   *
   * @param pathPrefix The path prefix that the handler is interested in. If the incoming uri starts with this prefix, the handler is called.
   * @param handler A function that is called when the uri matches the matcher
   * @returns The ID of the registered handler
   */
  public registerHandler(
    pathPrefix: string,
    handler: (uri: string) => void | Promise<void>,
  ): string {
    this.logger.debug(
      `[URIHandlerService] Registering handler for path prefix: ${pathPrefix}`,
    );
    const id = crypto.randomUUID();
    this._handlers[id] = { pathPrefix, handler };
    return id;
  }

  /**
   * Unregister a handler by its ID.
   * @param id The ID of the handler to unregister
   */
  public unregisterHandler(id: string): void {
    delete this._handlers[id];
  }
}
