import express from 'express';
import type { Server } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import cors from 'cors';
import { handleStreamableHttp } from './handlers/mcp';
import { handleSse, handleSsePost } from './handlers/sse';
import { errorHandler } from './middleware/error';
import { startHttpsServer } from './https-server';
import type { CertificateData } from '../utils/certificate-manager';
import {
  DEFAULT_PORT,
  PING_ENDPOINT,
  PING_RESPONSE,
} from '@stagewise/extension-toolbar-srpc-contract';

export interface ServerOptions {
  useHttps: boolean;
  certificates?: CertificateData;
}

const createApp = () => {
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
      next: express.NextFunction,
    ) => {
      _res.status(404).json({ error: 'Not found' });
    },
  );

  return app;
};

let server: Server | HttpsServer | null = null;

export const startServer = async (
  port: number = DEFAULT_PORT,
  options: ServerOptions = { useHttps: false },
): Promise<Server | HttpsServer> => {
  const app = createApp();

  if (options.useHttps && options.certificates) {
    const httpsServer = await startHttpsServer(app, port, options.certificates);
    server = httpsServer;
    return httpsServer;
  } else {
    const httpServer = await app.listen(port, () => {});
    server = httpServer;
    return httpServer;
  }
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
