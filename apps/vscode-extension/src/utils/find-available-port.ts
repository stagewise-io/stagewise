import net from 'node:net';

export async function findAvailablePort(
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
