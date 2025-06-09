import {
  DEFAULT_PORT,
  PING_ENDPOINT,
  PING_RESPONSE,
} from '@stagewise/extension-toolbar-srpc-contract';
import { createSRPCClientBridge } from '@stagewise/srpc/client';
import { contract } from '@stagewise/extension-toolbar-srpc-contract';
import type { z } from 'zod';

/**
 * Maximum number of consecutive connection errors before stopping the discovery process.
 * This prevents unnecessary network requests when no IDE instances are running.
 */
const MAX_CONSECUTIVE_ERRORS = 2;

export type VSCodeContext = z.infer<
  typeof contract.server.getSessionInfo.response
>;

/**
 * Discover all available IDE windows by scanning ports and getting session info
 */
export async function discoverVSCodeWindows(
  maxAttempts = 10,
  timeout = 300,
): Promise<VSCodeContext[]> {
  const windows: VSCodeContext[] = [];
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = DEFAULT_PORT + attempt;

    try {
      // First check if the port responds to ping
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`http://localhost:${port}${PING_ENDPOINT}`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Reset consecutive errors on successful response
      consecutiveErrors = 0;

      if (response.ok && (await response.text()) === PING_RESPONSE) {
        // Port is active, now get session info
        try {
          const bridge = createSRPCClientBridge(
            `ws://localhost:${port}`,
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
        } catch (error) {
          console.warn(`Failed to get session info from port ${port}:`, error);
        }
      } else {
        // Port is available but it's another service running on it, so we continue searching
        continue;
      }
    } catch (error) {
      consecutiveErrors++;

      // Stop searching after 2 consecutive connection errors
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.warn(
          `⬆️⬆️⬆️ Those two errors are expected! (Everything is fine, they are part of stagewise's discovery mechanism!) ✅`,
        );
        break;
      }

      // Any other error occurs, continue searching
      continue;
    }
  }

  if (windows.length === 0) {
    console.warn(
      `No IDE windows found, please start an IDE with the stagewise extension installed! ❌`,
    );
  }

  return windows;
}
