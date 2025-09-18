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
    // Do not keep the event loop alive if we happen to hang here
    server.unref();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });
}

export default findAvailablePort;
