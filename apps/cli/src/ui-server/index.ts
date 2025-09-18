import type { Logger } from '@/services/logger';
import express from 'express';
import type { WebSocketServer } from 'ws';
import { findAvailablePort } from '@/utils/find-available-port';
import { setupAppLoaderRoutes } from './app-loader-utils';
import { getProxyMiddleware } from './dev-app-proxy-utils';
import type { WorkspaceManager } from '@/workspace/workspace-manager';
import { createServer, type Server } from 'node:http';
import { configureWebSocketUpgrade } from './websocket-upgrade';

/**
 * This class orchestrates the startup of the server that hosts the UI.
 *
 * It contains the logic for proxying requests to the original dev app as well as loading the toolbar app and handling all other authentication urls etc.
 */
export class UIServer {
  private _logger: Logger;
  private _kartonWebSocketServer: WebSocketServer;
  private _workspaceManager: WorkspaceManager;
  private _app: express.Application;
  private _port: number | undefined = undefined;
  private _server: Server | null = null;

  constructor(
    logger: Logger,
    kartonWebSocketServer: WebSocketServer,
    workspaceManager: WorkspaceManager,
    port?: number,
  ) {
    this._logger = logger;
    this._kartonWebSocketServer = kartonWebSocketServer;
    this._workspaceManager = workspaceManager;
    this._app = express();

    // If the user provides a port, use it. Otherwise, search through all parts starting from 3100 onwards and set the first available port.
    if (port) {
      this._port = port;
    }
  }

  async start(): Promise<void> {
    // TODO: Start the UI server on the configured port. If no port exists, search through all parts starting from 3100 onwards and set the first available port.
    if (!this._port) {
      const foundPort = await findAvailablePort(3100);
      if (!foundPort) {
        throw new Error('No available port found');
      }
      this._port = foundPort;
    }

    // Make some default configs for the app
    this.app.disable('x-powered-by');

    // We first configure the proxy because the app routes will override the proxy routes
    const proxyMiddleware = getProxyMiddleware(
      this._logger,
      this._workspaceManager,
    );
    proxyMiddleware.upgrade;
    this.app.use(proxyMiddleware);

    setupAppLoaderRoutes(this.app, this._workspaceManager);

    // Now, we start the server that serves the app
    this._server = createServer(this.app);

    // Last up, we configure the server to proxy websocket requests either to the proxy, or the karton server (if the path is right)
    configureWebSocketUpgrade(
      this._server,
      proxyMiddleware.upgrade,
      this._kartonWebSocketServer,
      this._logger,
      this._workspaceManager,
    );

    this._server.listen(this._port, () => {
      this._logger.info(`UI server listening on port ${this._port}`);
    });
  }

  async shutdown(): Promise<void> {
    // TODO: Shutdown the server
    this._server?.close();
  }

  get app(): express.Application {
    return this._app;
  }
}
