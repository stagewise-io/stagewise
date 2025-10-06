import type { Logger } from '@/services/logger';
import type { Server } from 'node:http';
import { stagewiseAppPrefix, stagewiseKartonPath } from './shared';
import type { WorkspaceManagerService } from '@/services/workspace-manager';
import type { ProxyWSUpgradeHandler } from './dev-app-proxy-utils';
import type { WebSocketServer } from 'ws';

export const configureWebSocketUpgrade = (
  server: Server,
  proxyUpgradeHandler: ProxyWSUpgradeHandler,
  kartonWebSocketServer: WebSocketServer,
  logger: Logger,
  workspaceManager: WorkspaceManagerService,
) => {
  server.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    const { pathname } = new URL(url, 'http://localhost');
    logger.debug(`WebSocket upgrade request for: ${url}`);

    // For all other requests (except toolbar app paths), proxy them
    if (!pathname.startsWith(stagewiseAppPrefix)) {
      const targetPort =
        workspaceManager.workspace?.configService?.get().appPort;
      if (!targetPort) {
        throw new Error(
          "[WebSocketUpgrade] Proxy request received while no app port is configured. This shouldn't happen...",
        );
      }
      logger.debug(
        `[WebSocketUpgrade] Proxying WebSocket request to app port ${targetPort}`,
      );
      proxyUpgradeHandler(request, socket as any, head);
    } else if (pathname === stagewiseKartonPath) {
      // The only websocket that stagewise uses internally is the karton websocket, so if that fits, we simply forward to that
      kartonWebSocketServer.handleUpgrade(request, socket, head, (ws) => {
        kartonWebSocketServer.emit('connection', ws, request);
      });
    } else {
      logger.debug(`[WebSocketUpgrade] Unknown WebSocket path: ${pathname}`);
      socket.destroy();
    }
  });
};
