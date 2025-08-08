// Agents import the server implementation
// They should receive a pre-defined server instance with the options to register all the procedures in a nice and simple way

import { WebSocketServer } from 'ws';
import { type TransportInterface, interfaceRouter } from '../router';
import net from 'node:net';
import express, {
  type Request,
  type Response,
  type Application,
} from 'express';
import cors from 'cors';
import { createServer, type Server as HttpServer } from 'node:http';
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

/**
 * Configuration options for creating an agent server
 */
export interface AgentServerConfig {
  /** Custom agent name */
  name?: string;
  /** Custom agent description */
  description?: string;
  /** Custom starting port for standalone server */
  port?: number;
  /** Custom info endpoint path */
  infoPath?: string;
  /** Custom WebSocket endpoint path */
  wsPath?: string;
  /** Custom CORS configuration */
  cors?: cors.CorsOptions;
}

/**
 * Configuration for hooking into an existing Express server
 */
export interface AgentServerHookConfig extends AgentServerConfig {
  /** Existing Express application to hook into */
  app: Application;
  /** Existing HTTP server to attach WebSocket to */
  server: HttpServer;
  /** Whether to start the server (default: false when hooking) */
  startServer?: boolean;
}

/**
 * Configuration for creating a standalone server
 */
export interface AgentServerStandaloneConfig extends AgentServerConfig {
  /** Whether to start the server (default: true for standalone) */
  startServer?: boolean;
}

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
 * Creates agent endpoints and WebSocket handler for an existing Express server
 * @param config - Configuration for hooking into existing server
 * @returns The WebSocket server, handler, and control functions
 */
export const createAgentHook = async (config: AgentServerHookConfig) => {
  const {
    app,
    server,
    name = 'Stagewise Agent',
    description = 'A stagewise agent',
    infoPath = '/stagewise/info',
    wsPath = '/stagewise/ws',
  } = config;

  const impl: TransportInterface = new AgentTransportAdapter();

  // Create the info object that will be returned by the info endpoint
  const info: StagewiseInfo = {
    name,
    description,
    capabilities: {
      toolCalling: false,
      chatHistory: false,
    },
  };

  // Add the info endpoint
  app.get(infoPath, (_req: Request, res: Response) => {
    res.json(info);
  });

  // Create WebSocket server with noServer: true to handle upgrades manually
  const wss = new WebSocketServer({
    noServer: true,
  });

  // Register the tRPC implementation with the WebSocket server
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

  const agentInterface: AgentInterface = (
    impl as AgentTransportAdapter
  ).getAgent();

  return {
    standalone: false,
    server: server,
    wss,
    wsPath,
    handler,
    port: 0,
    interface: agentInterface,
    setAgentName: (newName: string) => {
      info.name = newName;
    },
    setAgentDescription: (newDescription: string) => {
      info.description = newDescription;
    },
  };
};

/**
 * Creates a new standalone agent server and returns the server instance, the handler and the port it is running on.
 * @param config - Configuration for the standalone server
 * @returns The server instance, the handler and the port it is running on.
 */
export const createAgentServer = async (
  config: AgentServerStandaloneConfig = {},
) => {
  const {
    name = 'Stagewise Agent',
    description = 'A stagewise agent',
    port: requestedPort = DEFAULT_STARTING_PORT,
    infoPath = '/stagewise/info',
    wsPath = '/stagewise/ws',
    cors: corsConfig = {
      origin: '*',
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
    },
    startServer = true,
  } = config;

  // Step 1: Find the first open port based on the requested port
  const port = await findAvailablePort(requestedPort);

  // Step 2: Create Express app
  const app = express();

  // Add JSON middleware for parsing request bodies
  app.use(express.json());

  // Add CORS middleware
  app.use(cors(corsConfig));

  const impl: TransportInterface = new AgentTransportAdapter();

  // Create the info object that will be returned by the info endpoint
  const info: StagewiseInfo = {
    name,
    description,
    capabilities: {
      toolCalling: false,
      chatHistory: false,
    },
  };

  // Step 3: Add the info endpoint
  app.get(infoPath, (_req: Request, res: Response) => {
    res.json(info);
  });

  // Step 4: Create HTTP server from Express app
  const httpServer = createServer(app);

  // Step 5: Create WebSocket server that uses the same HTTP server
  const wss = new WebSocketServer({
    server: httpServer,
    path: wsPath,
  });

  wss.on('connection', () => {
    console.log('.');
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

  // Step 7: Start the HTTP server if requested
  if (startServer) {
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
  }

  const agentInterface: AgentInterface = (
    impl as AgentTransportAdapter
  ).getAgent();

  return {
    standalone: true,
    server: httpServer,
    wss,
    handler,
    port, // Return the port so consumers know which port was used
    interface: agentInterface,
    setAgentName: (newName: string) => {
      info.name = newName;
    },
    setAgentDescription: (newDescription: string) => {
      info.description = newDescription;
    },
  };
};
