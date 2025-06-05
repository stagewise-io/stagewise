import {
  DEFAULT_PORT,
  PING_ENDPOINT,
  PING_RESPONSE,
} from '@stagewise/extension-toolbar-srpc-contract';
import { createSRPCClientBridge } from '@stagewise/srpc/client';
import { contract } from '@stagewise/extension-toolbar-srpc-contract';
import type { z } from 'zod';

export async function findPort(
  protocol: 'http' | 'https' | 'auto' = 'auto',
  maxAttempts = 10,
  timeout = 300,
): Promise<{ port: number; protocol: 'http' | 'https' } | null> {
  const protocolsToTry = protocol === 'auto' ? ['https', 'http'] : [protocol];

  for (const currentProtocol of protocolsToTry) {
    const result = await tryProtocol(currentProtocol, maxAttempts, timeout);
    if (result)
      return { port: result, protocol: currentProtocol as 'http' | 'https' };
  }

  return null;
}

async function tryProtocol(
  protocol: string,
  maxAttempts: number,
  timeout: number,
): Promise<number | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = DEFAULT_PORT + attempt;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(
          `${protocol}://localhost:${port}${PING_ENDPOINT}`,
          {
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          const text = await response.text();
          if (text === PING_RESPONSE) {
            return port;
          }
        }
      } catch (error) {
        clearTimeout(timeoutId);
        // Handle HTTPS certificate errors gracefully
        if (protocol === 'https' && isSSLError(error)) {
          console.warn(
            `HTTPS certificate not trusted for port ${port}:`,
            error,
          );
        }
        continue;
      }
    } catch (error) {
      // Continue to next port if any other error occurs
      continue;
    }
  }

  return null;
}

function isSSLError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message).toLowerCase();
    return (
      message.includes('certificate') ||
      message.includes('ssl') ||
      message.includes('tls') ||
      message.includes('self signed') ||
      message.includes('net::err_cert')
    );
  }
  return false;
}

export type VSCodeContext = z.infer<
  typeof contract.server.getSessionInfo.response
>;

/**
 * Discover all available VS Code windows by scanning ports and getting session info
 */
export async function discoverVSCodeWindows(
  protocol: 'http' | 'https' | 'auto' = 'auto',
  maxAttempts = 10,
  timeout = 300,
): Promise<VSCodeContext[]> {
  const windows: VSCodeContext[] = [];
  const protocolsToTry = protocol === 'auto' ? ['https', 'http'] : [protocol];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = DEFAULT_PORT + attempt;

    for (const currentProtocol of protocolsToTry) {
      try {
        // First check if the port responds to ping
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(
          `${currentProtocol}://localhost:${port}${PING_ENDPOINT}`,
          {
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        if (response.ok && (await response.text()) === PING_RESPONSE) {
          // Port is active, now get session info
          try {
            const wsProtocol = currentProtocol === 'https' ? 'wss' : 'ws';
            const bridge = createSRPCClientBridge(
              `${wsProtocol}://localhost:${port}`,
              contract,
            );
            await bridge.connect();

            const sessionInfo = await bridge.call.getSessionInfo(
              {},
              {
                onUpdate: () => {},
              },
            );
            windows.push(sessionInfo);

            await bridge.close();
            break; // Successfully connected with this protocol, move to next port
          } catch (error) {
            console.warn(
              `Failed to get session info from port ${port} using ${currentProtocol}:`,
              error,
            );
          }
        }
      } catch (error) {
        // Continue with next protocol or port
        if (currentProtocol === 'https' && isSSLError(error)) {
          console.warn(
            `HTTPS certificate not trusted for port ${port}:`,
            error,
          );
        }
        continue;
      }
    }
  }

  return windows;
}
