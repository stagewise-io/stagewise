// Agents import the server implementation
// They should receive a pre-defined server instance with the options to register all the procedures in a nice and simple way

import { WebSocketServer } from 'ws';
import { type TransportInterface, interfaceRouter } from '../router';
import net from 'node:net';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import type { StagewiseInfo } from '../info';
import { DEFAULT_STARTING_PORT } from '../constants';

export type { TransportInterface } from '../router';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import type { AgentInterface } from './interface';
import { AgentTransportAdapter } from './adapter';

export type AgentServer = Awaited<ReturnType<typeof createAgentServer>>;
export type { StagewiseInfo } from '../info';
export {
  AgentAvailabilityError,
  type AgentAvailability,
} from '../router/capabilities/availability/types';
export {
  AgentStateType,
  type AgentState,
} from '../router/capabilities/state/types';
export type * from '../router/capabilities/messaging/types';
export type * from '../router/capabilities/tool-calling/types';

/**
 * Find the first available port starting from the given port
 */
async function findAvailablePort(
  startPort: number,
  maxPort: number = startPort + 30,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      if (port > maxPort) {
        reject(
          new Error(
            `No available ports found between ${startPort} and ${maxPort}`,
          ),
        );
        return;
      }

      const server = net.createServer();
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Port is in use, try next port
          server.close();
          tryPort(port + 1);
        } else {
          reject(err);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(port);
      });

      server.listen(port);
    };

    tryPort(startPort);
  });
}

/**
 * Creates a new agent server and returns the server instance, the handler and the port it is running on.
 * @param implementation - The implementation of the agent interface.
 * @returns The server instance, the handler and the port it is running on.
 */
export const createAgentServer = async () => {
  // Step 1: Find the first open port based on the initial port we have available (starting with 5746)
  const port = await findAvailablePort(DEFAULT_STARTING_PORT);

  // Step 2: Create Express app
  const app = express();

  // Add JSON middleware for parsing request bodies
  app.use(express.json());

  // Add CORS middleware with the same configuration as the extension http-server
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
    }),
  );

  const impl: TransportInterface = new AgentTransportAdapter();

  // Create the info object that will be returned by the /stagewise/info endpoint
  const info: StagewiseInfo = {
    name: 'Stagewise Agent',
    description: 'A example stagewise agent',
    capabilities: {
      toolCalling: impl.toolCalling !== undefined,
      chatHistory: false,
    },
  };

  // Step 3: Add the /stagewise/info endpoint
  app.get('/stagewise/info', (_req: Request, res: Response) => {
    res.json(info);
  });

  // Step 4: Create HTTP server from Express app
  const httpServer = createServer(app);

  // Step 5: Create WebSocket server that uses the same HTTP server
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/stagewise/ws',
  });

  wss.on('connection', () => {
    console.log('New connection to toolbar.');
  });
  wss.on('close', () => {
    console.log('Connection to toolbar closed.');
  });

  // Step 6: Register the tRPC implementation with the WebSocket server
  const handler = applyWSSHandler({
    wss,
    router: interfaceRouter(impl),
    // Enable heartbeat messages to keep connection open (disabled by default)
    keepAlive: {
      enabled: true,
      // server ping message interval in milliseconds
      pingMs: 30000,
      // connection is terminated if pong message is not received in this many milliseconds
      pongWaitMs: 5000,
    },
    onError: (error) => {
      console.error('Error in tRPC handler:', error);
    },
  });

  // Step 7: Start the HTTP server (which also handles WebSocket upgrades)
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', (error: NodeJS.ErrnoException) => {
      console.error(`Failed to start HTTP server on port ${port}:`, error);
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${port} is already in use. The port finder may have encountered a race condition.`,
          ),
        );
      } else {
        reject(new Error(`Failed to start HTTP server: ${error.message}`));
      }
    });

    httpServer.once('listening', () => {
      console.log(`HTTP server started successfully on port ${port}`);
      resolve();
    });

    httpServer.listen(port);
  });

  const agentInterface: AgentInterface = (
    impl as AgentTransportAdapter
  ).getAgent();

  return {
    server: httpServer,
    wss,
    handler,
    port, // Return the port so consumers know which port was used
    interface: agentInterface,
    setAgentName: (name: string) => {
      info.name = name;
    },
    setAgentDescription: (description: string) => {
      info.description = description;
    },
  };
};
