// SPDX-License-Identifier: AGPL-3.0-only
// Toolbar SRPC
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import {
  DEFAULT_PORT,
  PING_ENDPOINT,
  PING_RESPONSE,
} from '@stagewise/extension-toolbar-srpc-contract';
import { createSRPCClientBridge } from '@stagewise/srpc/client';
import { contract } from '@stagewise/extension-toolbar-srpc-contract';
import type { z } from 'zod';

export async function findPort(
  maxAttempts = 10,
  timeout = 300,
): Promise<number | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = DEFAULT_PORT + attempt;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(
          `http://localhost:${port}${PING_ENDPOINT}`,
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
        // Continue to next port if request fails
        continue;
      }
    } catch (error) {
      // Continue to next port if any other error occurs
      continue;
    }
  }

  return null;
}

export type VSCodeContext = z.infer<
  typeof contract.server.getSessionInfo.response
>;

/**
 * Discover all available VS Code windows by scanning ports and getting session info
 */
export async function discoverVSCodeWindows(
  maxAttempts = 10,
  timeout = 300,
): Promise<VSCodeContext[]> {
  const windows: VSCodeContext[] = [];

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
      }
    } catch (error) {
      // Port not available, continue to next
      continue;
    }
  }

  return windows;
}
