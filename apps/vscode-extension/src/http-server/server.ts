import express from 'express';
import cors from 'cors';
import { handleStreamableHttp } from './handlers/mcp';
import { handleSse, handleSsePost } from './handlers/sse';
import { errorHandler } from './middleware/error';
import { WebSocketManager } from '../websocket/extension-socket';

export const DEFAULT_PORT = 5746;

let webSocketManager: WebSocketManager | null = null;

const createServer = (port: number) => {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
    }),
  );

  // Routes
  // Ping-route which will allow the toolbar to find out the correct port, starting with DEFAULT_PORT
  app.get('/ping/stagewise', (_req: express.Request, res: express.Response) => {
    res.send('stagewise');
  });
  app.all('/mcp', handleStreamableHttp);
  app.get('/sse', handleSse);
  app.post('/sse-messages', handleSsePost);

  // Error handling
  app.use(errorHandler);

  // 404 handler
  app.use(
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      _res.status(404).json({ error: 'Not found' });
    },
  );

  return app;
};

let server: ReturnType<typeof express.application.listen> | null = null;

export const startServer = (port: number): Promise<void> => {
  const app = createServer(port);
  return new Promise((resolve) => {
    server = app.listen(port, () => {
      console.error(`>>> HTTP server listening on port ${port}`);
      // Initialize WebSocket server after HTTP server is started
      if (server) {
        webSocketManager = new WebSocketManager(server);
      }
      resolve();
    });
  });
};

export const stopServer = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    if (webSocketManager) {
      webSocketManager.close();
      webSocketManager = null;
    }
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
    server = null;
  });
};

export const getWebSocketManager = (): WebSocketManager | null => {
  return webSocketManager;
};
