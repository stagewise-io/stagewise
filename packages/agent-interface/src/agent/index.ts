// Agents import the server implementation
// They should receive a pre-defined server instance with the options to register all the procedures in a nice and simple way

import { WebSocketServer } from 'ws';
import { type AgentInterfaceImplementation, interfaceRouter } from '../router';
import net from 'node:net';

export type { AgentInterfaceImplementation } from '../router';
import { applyWSSHandler } from '@trpc/server/adapters/ws';

const DEFAULT_STARTING_PORT = 5746;

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
export const createAgentServer = async (
  implementation: AgentInterfaceImplementation,
) => {
  // Step 1: Find the first open port based on the initial port we have available (starting with 5746)
  const port = await findAvailablePort(DEFAULT_STARTING_PORT);

  // Step 2: Start the server on the lowest available port
  const server = new WebSocketServer({
    port,
  });

  // Step 3: Register the implementation with the server
  const handler = applyWSSHandler({
    wss: server,
    router: interfaceRouter(implementation),
    // Enable heartbeat messages to keep connection open (disabled by default)
    keepAlive: {
      enabled: true,
      // server ping message interval in milliseconds
      pingMs: 30000,
      // connection is terminated if pong message is not received in this many milliseconds
      pongWaitMs: 5000,
    },
  });

  return {
    server,
    handler,
    port, // Return the port so consumers know which port was used
  };
};
