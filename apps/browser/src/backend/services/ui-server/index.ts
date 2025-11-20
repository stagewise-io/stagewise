import type { Logger } from '@/services/logger';
import express from 'express';
import type { WebSocketServer } from 'ws';
import { findAvailablePort } from '@/utils/find-available-port';
import { getProxyMiddleware } from './dev-app-proxy-utils';
import type { WorkspaceManagerService } from '../workspace-manager';
import { createServer, type Server } from 'node:http';
import { configureWebSocketUpgrade } from './websocket-upgrade';
import type { AuthService } from '../auth';
import { setupAuthRoutes } from './auth-handlers';
import { setupComponentConvasRoutes } from './component-canvas-utils';

/**
 * This class orchestrates the startup of the server that hosts the UI.
 *
 * It contains the logic for proxying requests to the original dev app as well as loading the toolbar app and handling all other authentication urls etc.
 */
export class UIServerService {
  private _logger: Logger;
  private _kartonWebSocketServer: WebSocketServer;
  private _workspaceManager: WorkspaceManagerService;
  private _authService: AuthService;
  private _app: express.Application;

  private _port: number;
  private _server: Server | null = null;

  private constructor(
    logger: Logger,
    kartonWebSocketServer: WebSocketServer,
    workspaceManager: WorkspaceManagerService,
    authService: AuthService,
    port?: number,
  ) {
    this._logger = logger;
    this._kartonWebSocketServer = kartonWebSocketServer;
    this._workspaceManager = workspaceManager;
    this._authService = authService;
    this._app = express();

    // If the user provides a port, use it. Otherwise, search through all parts starting from 3100 onwards and set the first available port.
    if (port) {
      this._port = port;
    }
  }

  public static async create(
    logger: Logger,
    kartonWebSocketServer: WebSocketServer,
    workspaceManager: WorkspaceManagerService,
    authService: AuthService,
    port?: number,
  ) {
    const instance = new UIServerService(
      logger,
      kartonWebSocketServer,
      workspaceManager,
      authService,
      port,
    );
    await instance.start();
    return instance;
  }

  private async start(): Promise<void> {
    if (!this._port) {
      const foundPort = await findAvailablePort(3100);
      if (!foundPort) {
        throw new Error('No available port found');
      }
      this._logger.debug(
        `[UIServerService] Found available port: ${foundPort}`,
      );
      this._port = foundPort;
    }
    this._logger.debug(`[UIServerService] Using port: ${this._port}`);

    // Make some default configs for the app
    this.app.disable('x-powered-by');

    this._logger.debug(`[UIServerService] Configuring proxy middleware...`);

    // We first configure the proxy because the app routes will override the proxy routes
    const proxyMiddleware = getProxyMiddleware(
      this._logger,
      this._workspaceManager,
    );
    proxyMiddleware.upgrade;
    this.app.use(proxyMiddleware);

    this._logger.debug(`[UIServerService] Setting up auth routes...`);

    setupAuthRoutes(this.app, this._authService);

    this._logger.debug(
      `[UIServerService] Setting up component canvas routes...`,
    );
    setupComponentConvasRoutes(this.app, this._workspaceManager);

    //this._logger.debug(`[UIServerService] Setting up app loader routes...`);

    // This must happen last in setup because it includes a catch-all
    // setupAppLoaderRoutes(this.app, this._workspaceManager);

    this._logger.debug(`[UIServerService] Starting server...`);

    // Now, we start the server that serves the app
    this._server = createServer(this.app);

    this._logger.debug(`[UIServerService] Configuring web socket upgrade...`);

    // Last up, we configure the server to proxy websocket requests either to the proxy, or the karton server (if the path is right)
    configureWebSocketUpgrade(
      this._server,
      proxyMiddleware.upgrade,
      this._kartonWebSocketServer,
      this._logger,
      this._workspaceManager,
    );

    this._logger.debug(
      `[UIServerService] Binding server to port ${this._port}...`,
    );

    this._server.listen(this._port, () => {
      this._logger.info(`✓ stagewise ready on http://localhost:${this._port}`);
      this._logger.debug(`[UIServerService] Server started`);
    });
  }

  public async tearDown(): Promise<void> {
    // TODO: Shutdown the server
    this._logger.debug(`[UIServerService] Shutting down server...`);
    this._server?.close();
    this._logger.debug(`[UIServerService] Server shut down`);
  }

  get app(): express.Application {
    return this._app;
  }

  get port(): number {
    return this._port;
  }
}
