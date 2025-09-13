import express, { type Request, type Response } from 'express';
import type { WebSocketServer, WebSocket } from 'ws';
import { createKartonServer } from '@stagewise/karton/server';
import { createServer } from 'node:http';
import { configResolver } from '../config/index.js';
import { proxy } from './proxy.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { oauthManager } from '../auth/oauth.js';
import { log } from '../utils/logger.js';
import { loadAndInitializeAgent, getAgentInstance } from './agent-loader.js';
import type { Config } from '../config/types.js';
import {
  loadPlugins,
  generatePluginImportMapEntries,
  type Plugin,
} from './plugin-loader.js';
import { analyticsEvents } from '../utils/telemetry.js';

// ATTENTION: keep in sync with @stagewise/karton-contract-bridged - can't import because types aren't bundled -.-
type KartonContract = {
  state: {
    noop: boolean;
  };
  clientProcedures: {
    noop: () => Promise<void>;
  };
  serverProcedures: {
    trackCopyToClipboard: () => Promise<void>;
  };
};

const __dirname = dirname(fileURLToPath(import.meta.url));

const getImportMap = async (plugins: Plugin[], config: Config) => {
  const manifestPath = config.bridgeMode
    ? process.env.NODE_ENV === 'production'
      ? resolve(__dirname, 'toolbar-bridged/.vite/manifest.json')
      : resolve(
          'node_modules/@stagewise/toolbar-bridged/dist/toolbar-main/.vite/manifest.json',
        )
    : process.env.NODE_ENV === 'production'
      ? resolve(__dirname, 'toolbar-app/.vite/manifest.json')
      : resolve(
          'node_modules/@stagewise/toolbar/dist/toolbar-main/.vite/manifest.json',
        );

  const mainAppManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  const mainAppEntries: Record<string, string> = {};
  for (const [_, entry] of Object.entries(mainAppManifest) as [
    string,
    { file: string },
  ][]) {
    if (entry.file.endsWith('.js')) {
      mainAppEntries[entry.file] = `/stagewise-toolbar-app/${entry.file}`;
    }
  }
  // Dynamically generate a importmap.json file based on the vite app entries, config and external react deps
  const reactDepsDevSuffix =
    process.env.NODE_ENV === 'development' ? '?dev' : '';
  return {
    imports: {
      react: `https://esm.sh/react@19.1.0${reactDepsDevSuffix}`,
      'react-dom': `https://esm.sh/react-dom@19.1.0${reactDepsDevSuffix}`,
      'react-dom/client': `https://esm.sh/react-dom@19.1.0/client${reactDepsDevSuffix}`,
      'react/jsx-runtime': `https://esm.sh/react@19.1.0/jsx-runtime${reactDepsDevSuffix}`,
      ...mainAppEntries,
      '@stagewise/toolbar/config': '/stagewise-toolbar-app/config.js',
      '@stagewise/plugin-sdk': '/stagewise-toolbar-app/plugin-sdk.js',
      ...generatePluginImportMapEntries(plugins),
    },
  };
};

const createToolbarConfigHandler =
  (plugins: Plugin[]) => async (_req: Request, res: Response) => {
    try {
      const availablePlugins = plugins.filter((p) => p.available !== false);
      const pluginImports: string[] = [];
      const pluginExports: string[] = [];
      const errorHandlers: string[] = [];

      availablePlugins.forEach((plugin, index) => {
        // Generate safe imports with error handling
        pluginImports.push(`let plugin${index} = null;`);
        errorHandlers.push(`
try {
  const module${index} = await import('plugin-entry-${index}');
  plugin${index} = module${index}.default || module${index};
  console.debug('[stagewise] Successfully loaded plugin: ${plugin.name}');
} catch (error) {
  console.error('[stagewise] Failed to load plugin ${plugin.name}:', error.message);
  console.error('[stagewise] Plugin path: ${JSON.stringify(plugin.path || plugin.url)}');
}`);
        pluginExports.push(`plugin${index}`);
      });

      // Log warnings for unavailable plugins
      const unavailablePlugins = plugins.filter((p) => p.available === false);
      const unavailableWarnings = unavailablePlugins
        .map(
          (p) =>
            `console.warn('[stagewise] Plugin "${p.name}" is not available: ${p.error || 'Unknown error'}');`,
        )
        .join('\n');

      // Filter out null plugins in the array
      const convertedPluginArray = `[${pluginExports.join(', ')}].filter(p => p !== null)`;

      const config = configResolver.getConfig();
      const convertedConfig: Record<string, any> = {
        plugins: '__PLUGIN_PLACEHOLDER__',
        devAppPort: config.appPort,
      };

      // Add eddyMode if it exists
      if (config.eddyMode !== undefined) {
        convertedConfig.eddyMode = config.eddyMode;
      }

      let configString = JSON.stringify(convertedConfig);
      configString = configString.replace(
        '"__PLUGIN_PLACEHOLDER__"',
        convertedPluginArray,
      );

      const responseContent = `${pluginImports.join('\n')}

// Log unavailable plugins
${unavailableWarnings}

// Load available plugins with error handling
${errorHandlers.join('')}

const config = ${configString};

export default config;
`;

      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.send(responseContent);
    } catch (_error) {
      res.status(500).send('Error generating config');
    }
  };

const createToolbarHtmlHandler =
  (plugins: Plugin[], config: Config) =>
  async (_req: Request, res: Response) => {
    try {
      const importMap = await getImportMap(plugins, config);

      const html = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <title>stagewise</title>
    <link rel="preconnect" href="https://rsms.me/">
    <link rel="stylesheet" href="https://rsms.me/inter/inter.css">
    <script type="importmap">${JSON.stringify(importMap)}</script>
    <script type="module">import "index.js";</script>
  </head>
  <body></body>
  </html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(html);
    } catch (error) {
      console.error(error);
      res.status(500).send('Error generating HTML');
    }
  };

export const getServer = async () => {
  try {
    const app = express();
    const config = configResolver.getConfig();

    // Load plugins based on configuration and dependencies
    const plugins = await loadPlugins(config);

    const unavailablePlugins = plugins.filter((p) => p.available === false);

    if (unavailablePlugins.length > 0) {
      log.warn('The following plugins are not available:');
      unavailablePlugins.forEach((p) => {
        log.warn(`  - ${p.name}: ${p.error || 'Unknown error'}`);
      });
    }

    // Set up proxy middleware first
    app.use(proxy);

    // Serve local plugin directories
    for (const plugin of plugins) {
      if (plugin.path && plugin.available !== false) {
        const pluginName = plugin.name.replace(/[@/]/g, '-');
        app.use(
          `/stagewise-toolbar-app/plugins/${pluginName}`,
          express.static(plugin.path),
        );
        log.debug(`Serving local plugin ${plugin.name} from ${plugin.path}`);
      }
    }

    // Set up basic middleware and static routes
    const toolbarPath = config.bridgeMode
      ? process.env.NODE_ENV === 'production'
        ? resolve(__dirname, 'toolbar-bridged')
        : resolve('node_modules/@stagewise/toolbar-bridged/dist/toolbar-main')
      : process.env.NODE_ENV === 'production'
        ? resolve(__dirname, 'toolbar-app')
        : resolve('node_modules/@stagewise/toolbar/dist/toolbar-main');
    app.use('/stagewise-toolbar-app', express.static(toolbarPath));
    app.get(
      '/stagewise-toolbar-app/config.js',
      createToolbarConfigHandler(plugins),
    );

    app.disable('x-powered-by');

    // Create HTTP server from Express app
    const server = createServer(app);

    // Initialize agent server if not in bridge mode (BEFORE wildcard route)
    let bridgeModeWss: WebSocketServer | null = null;
    let bridgeModeWsPath: string | null = null;
    let agentWss: WebSocketServer | null = null;
    let agentWsPath: string | null = null;

    if (!config.bridgeMode) {
      try {
        // Get access token for agent
        const token = await oauthManager.getToken();
        if (token) {
          // Load and initialize agent using the loader module
          // This will register agent routes at /stagewise-toolbar-app/server/*
          const agentResult = await loadAndInitializeAgent(
            token.accessToken,
            token.refreshToken,
          );
          if (agentResult.success && agentResult.wss) {
            agentWss = agentResult.wss;
            log.debug('Received websocket server from agent loader');
            agentWsPath = '/stagewise-toolbar-app/karton';
            log.debug(
              `Agent WebSocket server configured for path: ${agentWsPath}`,
            );
          }
        } else {
          log.debug(
            'Agent server not initialized - no authentication token available',
          );
          log.debug('Run "stagewise auth login" to enable agent functionality');
        }
      } catch (error) {
        log.error(
          `Failed to initialize agent server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        // Continue without agent server - it's not critical for basic functionality
      }
    }

    if (config.bridgeMode) {
      const kartonServer = await createKartonServer<KartonContract>({
        initialState: {
          noop: false,
        },
        procedures: {
          trackCopyToClipboard: async () => {
            await analyticsEvents.trackCopyToClipboard();
          },
        },
      });
      bridgeModeWss = kartonServer.wss;
      bridgeModeWsPath = '/stagewise-toolbar-app/karton';
      log.debug(
        `Bridge mode WebSocket server configured for path: ${bridgeModeWsPath}`,
      );
    }

    // Add wildcard route LAST, after all other routes including agent routes
    app.get(
      /^(?!\/stagewise-toolbar-app).*$/,
      createToolbarHtmlHandler(plugins, config),
    );

    // Set up WebSocket upgrade handling
    server.on('upgrade', (request, socket, head) => {
      const url = request.url || '';
      const { pathname } = new URL(url, 'http://localhost');
      log.debug(`WebSocket upgrade request for: ${url}`);

      // For all other requests (except toolbar app paths), proxy them
      if (!pathname.startsWith('/stagewise-toolbar-app')) {
        log.debug(`Proxying WebSocket request to app port ${config.appPort}`);
        proxy.upgrade?.(request, socket as any, head);
      } else {
        if (agentWss && pathname === agentWsPath) {
          // Handle agent WebSocket requests
          log.debug('Handling agent WebSocket upgrade');
          agentWss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
            agentWss.emit('connection', ws, request);
          });
        } else if (bridgeModeWss && pathname === bridgeModeWsPath) {
          // Handle bridge mode WebSocket requests
          log.debug('Handling bridge mode WebSocket upgrade');
          bridgeModeWss.handleUpgrade(
            request,
            socket,
            head,
            (ws: WebSocket) => {
              bridgeModeWss.emit('connection', ws, request);
            },
          );
        } else {
          log.debug(`Unknown WebSocket path: ${pathname}`);
          socket.destroy();
        }
      }
    });

    return { app, server, agent: getAgentInstance(), agentWss, plugins };
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
