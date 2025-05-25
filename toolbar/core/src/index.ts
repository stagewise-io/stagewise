// SPDX-License-Identifier: AGPL-3.0-only
// Toolbar index
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

import { render, createElement } from 'preact';
import appStyle from './app.css?inline';
import { App } from './app.tsx';

import { companionAnchorTagName } from './utils.tsx';
import { findPort, getToolbarBridge } from './srpc';

import type { ToolbarConfig } from './config.ts';
import type { McpServerConfig, ToolbarPlugin } from './plugin.ts';
import { collectMcpServersFromPlugins } from './plugin.ts';

export * from './plugin.ts';
export type { ToolbarConfig } from './config.ts';

/**
 * Core MCP server that provides completion notification tools
 * Configuration is sent to extension regardless of environment
 */
function createCoreMcpServer(): {
  name: string;
  config: McpServerConfig;
} {
  // Always provide the MCP server configuration - the extension will handle execution
  // In browser environments, we can't resolve paths, so use the published package approach

  const isBrowser =
    typeof window !== 'undefined' || typeof require === 'undefined';

  if (isBrowser) {
    // Use pnpm exec with the linked package for browser/development environments
    return {
      name: 'stagewise-core',
      config: {
        command: 'pnpm',
        args: ['exec', 'stagewise-mcp-server'],
        env: {
          STAGEWISE_CORE: 'true',
          DEBUG: 'stagewise:*',
          MCP_SERVER_NAME: 'stagewise-core',
        },
      },
    };
  }

  try {
    // In Node.js environment, try to resolve the development path
    const isDevelopment = process.env.NODE_ENV !== 'production';

    if (isDevelopment) {
      // Use pnpm exec with the linked package for development
      return {
        name: 'stagewise-core',
        config: {
          command: 'pnpm',
          args: ['exec', 'stagewise-mcp-server'],
          env: {
            STAGEWISE_CORE: 'true',
            DEBUG: 'stagewise:*',
            MCP_SERVER_NAME: 'stagewise-core',
          },
        },
      };
    } else {
      // In production, use npx with the binary
      return {
        name: 'stagewise-core',
        config: {
          command: 'npx',
          args: ['stagewise-mcp-server'],
          env: {
            STAGEWISE_CORE: 'true',
            DEBUG: 'stagewise:*',
            MCP_SERVER_NAME: 'stagewise-core',
          },
        },
      };
    }
  } catch (error) {
    console.warn(
      'Failed to resolve MCP server path, falling back to npx:',
      error,
    );
    // Fallback to npx approach if path resolution fails
    return {
      name: 'stagewise-core',
      config: {
        command: 'npx',
        args: ['stagewise-mcp-server'],
        env: {
          STAGEWISE_CORE: 'true',
          DEBUG: 'stagewise:*',
          MCP_SERVER_NAME: 'stagewise-core',
        },
      },
    };
  }
}

/**
 * Registers MCP servers with the extension via SRPC
 */
async function registerMcpServersWithExtension(
  servers: Array<{ name: string; config: McpServerConfig }>,
): Promise<void> {
  if (servers.length === 0) {
    console.log('No MCP servers to register');
    return;
  }

  try {
    // Use existing port finding logic
    const port = await findPort();

    if (!port) {
      console.warn(
        'Could not find Stagewise extension to register MCP servers. Extension may not be running.',
      );
      return;
    }

    console.log(`Found Stagewise extension on port ${port}`);

    // Use the proper SRPC bridge and connect it
    const bridge = getToolbarBridge(port);
    await bridge.connect();

    try {
      // Register MCP servers using the SRPC contract
      await bridge.call.registerMCP(
        {
          servers: servers,
          source: 'toolbar-initialization',
        },
        {
          onUpdate: (update) => {
            console.log('MCP registration update:', update.updateText);
          },
        },
      );

      console.log(
        `Successfully registered ${servers.length} MCP servers with extension`,
      );
    } finally {
      // Always close the bridge when done
      await bridge.close();
    }
  } catch (error) {
    console.error('Failed to register MCP servers with extension:', error);
  }
}

/**
 * Initialize the toolbar UI components with full DOM manipulation
 */
function initializeToolbarUI(config?: ToolbarConfig): void {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    console.warn(
      'Stagewise toolbar: Not in browser environment, skipping UI initialization',
    );
    return;
  }

  if (!document.body) {
    throw new Error('stagewise companion cannot find document.body');
  }

  // If a stagewise companion anchor already exists, we abort this instance.
  if (document.body.querySelector(companionAnchorTagName)) {
    console.warn(
      'A stagewise companion anchor already exists. Aborting this instance.',
    );
    throw new Error('A stagewise companion anchor already exists.');
  }

  const shadowDomAnchor = document.createElement(companionAnchorTagName);
  shadowDomAnchor.style.position = 'fixed';
  shadowDomAnchor.style.top = '0px';
  shadowDomAnchor.style.left = '0px';
  shadowDomAnchor.style.right = '0px';
  shadowDomAnchor.style.bottom = '0px';
  shadowDomAnchor.style.pointerEvents = 'none';
  shadowDomAnchor.style.zIndex = '2147483647';

  const eventBlocker = (ev: Event) => {
    ev.stopPropagation();
  };

  // We block all kinds of events to prevent the anchor from interfering with the website as much as possible.
  // We want the website to basically freeze upon interacting with the companion.
  shadowDomAnchor.onclick = eventBlocker;
  shadowDomAnchor.onmousedown = eventBlocker;
  shadowDomAnchor.onmouseup = eventBlocker;
  shadowDomAnchor.onmousemove = eventBlocker;
  shadowDomAnchor.ondblclick = eventBlocker;
  shadowDomAnchor.oncontextmenu = eventBlocker;
  shadowDomAnchor.onwheel = eventBlocker;
  shadowDomAnchor.onfocus = eventBlocker;
  shadowDomAnchor.onblur = eventBlocker;

  document.body.appendChild(shadowDomAnchor);

  const fontLinkNode = document.createElement('link');
  fontLinkNode.rel = 'stylesheet';
  fontLinkNode.href = `https://rsms.me/inter/inter.css`;
  document.head.appendChild(fontLinkNode);

  /** Insert generated css into shadow dom */
  const styleNode = document.createElement('style');
  styleNode.append(document.createTextNode(appStyle));
  document.head.appendChild(styleNode);

  render(createElement(App, config), shadowDomAnchor);

  console.log('Stagewise toolbar UI initialized');
}

/**
 * Initialize the Stagewise toolbar with plugins and MCP server support
 */
export async function initToolbar(
  config: ToolbarConfig = { plugins: [] },
): Promise<void> {
  try {
    console.log('Initializing Stagewise toolbar...');

    // Collect MCP servers from plugins
    const pluginMcpServers = collectMcpServersFromPlugins(config.plugins);

    // Add core MCP server (always included)
    const coreMcpServer = createCoreMcpServer();

    // Combine core MCP server with plugin MCP servers
    const allMcpServers = [coreMcpServer, ...pluginMcpServers];

    console.log(
      `Found ${allMcpServers.length} MCP servers to register:`,
      allMcpServers.map((s) => s.name).join(', '),
    );

    // Register MCP servers with the extension
    await registerMcpServersWithExtension(allMcpServers);

    // Initialize the UI with full DOM manipulation
    initializeToolbarUI(config);

    console.log('Stagewise toolbar initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Stagewise toolbar:', error);
    throw error;
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use initToolbar instead
 */
export function setupToolbar(config: ToolbarConfig = { plugins: [] }): void {
  console.warn('setupToolbar is deprecated. Use initToolbar instead.');
  initializeToolbarUI(config);
}

// Export types and utilities
export type { ToolbarPlugin, McpServerConfig };
