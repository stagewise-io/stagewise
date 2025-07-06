import express from 'express';
import type { Server } from 'node:http';
import cors from 'cors';
import { handleStreamableHttp } from './handlers/mcp';
import { handleSse, handleSsePost } from './handlers/sse';
import { errorHandler } from './middleware/error';
import {
  DEFAULT_PORT,
  PING_ENDPOINT,
  PING_RESPONSE,
} from '@stagewise/extension-toolbar-srpc-contract';

const createServer = (_port: number) => {
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
  app.get(PING_ENDPOINT, (_req: express.Request, res: express.Response) => {
    res.send(PING_RESPONSE);
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
      _next: express.NextFunction,
    ) => {
      _res.status(404).json({ error: 'Not found' });
    },
  );

  return app;
};

let server: ReturnType<typeof express.application.listen> | null = null;

export const startServer = async (
  port: number = DEFAULT_PORT,
): Promise<Server> => {
  const app = createServer(port);
  return await app.listen(port, () => {});
};

export const stopServer = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
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
