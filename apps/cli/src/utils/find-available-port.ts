import { createServer } from 'node:net';

const MAX_PORT = 65535;

/**
 * Find the first available TCP port starting from startPort up to maxPort.
 * Returns the port number if found, otherwise null.
 */
export async function findAvailablePort(
  startPort: number,
  maxPort?: number,
): Promise<number | null> {
  const normalizedStart = Number.isFinite(startPort)
    ? Math.max(1, Math.min(MAX_PORT, Math.trunc(startPort)))
    : 1;
  const endPort = Number.isFinite(maxPort || undefined)
    ? Math.max(normalizedStart, Math.min(MAX_PORT, Math.trunc(maxPort!)))
    : MAX_PORT;

  for (let port = normalizedStart; port <= endPort; port++) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  return null;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    // Set up error handler
    server.once('error', () => {
      server.close();
      resolve(false);
    });

    // Set up listening handler
    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    // Attempt to listen
    try {
      server.listen(port);
    } catch {
      server.close();
      resolve(false);
    }
  });
}

export default findAvailablePort;
