import express, { type Request, type Response } from 'express';
import { createServer } from 'node:http';
import { proxy } from './proxy.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { log } from '../utils/logger.js';
import { generatePluginImportMapEntries, type Plugin } from './plugin-loader.js';
import { KartonManager } from '../karton/karton-manager.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';
import { oauthManager } from '../auth/oauth.js';
import type { Config } from '../config/types.js';
import type { Server } from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class UnifiedServer {
  private app: express.Application;
  private server: Server;
  private kartonManager: KartonManager;
  private workspaceManager: WorkspaceManager;
  private config: Config;
  private port: number;

  constructor(config: Config) {
    this.config = config;
    this.port = config.port;
    this.app = express();
    this.server = createServer(this.app);
    this.kartonManager = KartonManager.getInstance();
    this.workspaceManager = WorkspaceManager.getInstance();
  }

  async initialize(): Promise<void> {
    log.info(`Initializing unified server on port ${this.port}`);

    // Initialize Karton server first (core component)
    const kartonServer = await this.kartonManager.initialize(this.port);

    // Set up OAuth routes
    this.setupAuthRoutes();

    // Set up proxy middleware
    this.app.use(proxy);

    // Set up toolbar routes
    this.setupToolbarRoutes();

    // Set up WebSocket handling
    this.setupWebSocketHandling(kartonServer);

    // Initialize workspace if we have auth
    await this.initializeWorkspace();

    // Add wildcard route LAST
    this.app.get(
      /^(?!\/stagewise-toolbar-app).*$/,
      this.createToolbarHtmlHandler(),
    );

    log.info('Unified server initialized');
  }

  private setupAuthRoutes(): void {
    // OAuth callback route
    this.app.get('/auth/callback', async (req: Request, res: Response) => {
      try {
        const { code, state } = req.query;
        
        if (!code || typeof code !== 'string') {
          throw new Error('No authorization code provided');
        }

        // Handle OAuth callback
        await oauthManager.handleCallback(code as string, state as string);
        
        // Redirect to success page
        res.redirect('/auth/success');
      } catch (error) {
        log.error(`OAuth callback error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        res.redirect('/auth/error');
      }
    });

    // Success page
    this.app.get('/auth/success', (_req: Request, res: Response) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { text-align: center; }
            h1 { color: #22c55e; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✓ Authentication Successful</h1>
            <p>You can now close this window and return to your terminal.</p>
          </div>
        </body>
        </html>
      `);
    });

    // Error page
    this.app.get('/auth/error', (_req: Request, res: Response) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { text-align: center; }
            h1 { color: #ef4444; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✗ Authentication Failed</h1>
            <p>Please try again or check your terminal for more information.</p>
          </div>
        </body>
        </html>
      `);
    });
  }

  private setupToolbarRoutes(): void {
    const workspace = this.workspaceManager.getCurrentWorkspace();
    
    // Serve toolbar static files
    const toolbarPath = this.config.bridgeMode
      ? process.env.NODE_ENV === 'production'
        ? resolve(__dirname, 'toolbar-bridged')
        : resolve('node_modules/@stagewise/toolbar-bridged/dist/toolbar-main')
      : process.env.NODE_ENV === 'production'
        ? resolve(__dirname, 'toolbar-app')
        : resolve('node_modules/@stagewise/toolbar/dist/toolbar-main');
    
    this.app.use('/stagewise-toolbar-app', express.static(toolbarPath));

    // Serve plugin directories if workspace is initialized
    if (workspace) {
      for (const plugin of workspace.getPlugins()) {
        if (plugin.path && plugin.available !== false) {
          const pluginName = plugin.name.replace(/[@/]/g, '-');
          this.app.use(
            `/stagewise-toolbar-app/plugins/${pluginName}`,
            express.static(plugin.path),
          );
          log.debug(`Serving local plugin ${plugin.name} from ${plugin.path}`);
        }
      }
    }

    // Dynamic config endpoint
    this.app.get(
      '/stagewise-toolbar-app/config.js',
      this.createToolbarConfigHandler(),
    );

    this.app.disable('x-powered-by');
  }

  private setupWebSocketHandling(kartonServer: any): void {
    this.server.on('upgrade', (request, socket, head) => {
      const url = request.url || '';
      log.debug(`WebSocket upgrade request for: ${url}`);

      if (url === '/stagewise-toolbar-app/karton') {
        // Handle Karton WebSocket
        log.debug('Handling Karton WebSocket upgrade');
        kartonServer.wss.handleUpgrade(request, socket, head, (ws: any) => {
          kartonServer.wss.emit('connection', ws, request);
        });
      } else if (!url.startsWith('/stagewise-toolbar-app')) {
        // Proxy non-toolbar WebSocket requests
        log.debug(`Proxying WebSocket request to app port ${this.config.appPort}`);
        proxy.upgrade?.(request, socket as any, head);
      } else {
        log.debug(`Unknown WebSocket path: ${url}`);
        socket.destroy();
      }
    });
  }

  private async initializeWorkspace(): Promise<void> {
    try {
      const authState = await oauthManager.getAuthState();
      
      if (authState?.isAuthenticated && authState.accessToken && authState.refreshToken) {
        // Set auth tokens in workspace manager
        this.workspaceManager.setAuthTokens(
          authState.accessToken,
          authState.refreshToken,
        );

        // Initialize default workspace
        const workspace = await this.workspaceManager.initializeWorkspace(this.config);
        log.info(`Workspace initialized at: ${workspace.getPath()}`);
      } else {
        log.info('No authentication found - workspace features disabled');
        log.info('Authenticate through the UI to enable workspace features');
      }
    } catch (error) {
      log.error(`Failed to initialize workspace: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createToolbarConfigHandler() {
    return async (_req: Request, res: Response) => {
      try {
        const workspace = this.workspaceManager.getCurrentWorkspace();
        const plugins = workspace ? workspace.getPlugins() : [];
        const availablePlugins = plugins.filter((p) => p.available !== false);
        
        const pluginImports: string[] = [];
        const pluginExports: string[] = [];
        const errorHandlers: string[] = [];

        availablePlugins.forEach((plugin, index) => {
          pluginImports.push(`let plugin${index} = null;`);
          errorHandlers.push(`
try {
  const module${index} = await import('plugin-entry-${index}');
  plugin${index} = module${index}.default || module${index};
  console.debug('[stagewise] Successfully loaded plugin: ${plugin.name}');
} catch (error) {
  console.error('[stagewise] Failed to load plugin ${plugin.name}:', error.message);
}`);
          pluginExports.push(`plugin${index}`);
        });

        const convertedPluginArray = `[${pluginExports.join(', ')}].filter(p => p !== null)`;

        const convertedConfig: Record<string, any> = {
          plugins: '__PLUGIN_PLACEHOLDER__',
          devAppPort: this.config.appPort,
        };

        if (this.config.eddyMode !== undefined) {
          convertedConfig.eddyMode = this.config.eddyMode;
        }

        let configString = JSON.stringify(convertedConfig);
        configString = configString.replace(
          '"__PLUGIN_PLACEHOLDER__"',
          convertedPluginArray,
        );

        const responseContent = `${pluginImports.join('\n')}

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
  }

  private createToolbarHtmlHandler() {
    return async (_req: Request, res: Response) => {
      try {
        const workspace = this.workspaceManager.getCurrentWorkspace();
        const plugins = workspace ? workspace.getPlugins() : [];
        const importMap = await this.getImportMap(plugins);

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
  }

  private async getImportMap(plugins: Plugin[]) {
    const manifestPath = this.config.bridgeMode
      ? process.env.NODE_ENV === 'production'
        ? resolve(__dirname, 'toolbar-bridged/.vite/manifest.json')
        : resolve('node_modules/@stagewise/toolbar-bridged/dist/toolbar-main/.vite/manifest.json')
      : process.env.NODE_ENV === 'production'
        ? resolve(__dirname, 'toolbar-app/.vite/manifest.json')
        : resolve('node_modules/@stagewise/toolbar/dist/toolbar-main/.vite/manifest.json');

    const mainAppManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    const mainAppEntries: Record<string, string> = {};
    
    for (const [_, entry] of Object.entries(mainAppManifest) as [string, { file: string }][]) {
      if (entry.file.endsWith('.js')) {
        mainAppEntries[entry.file] = `/stagewise-toolbar-app/${entry.file}`;
      }
    }

    const reactDepsDevSuffix = process.env.NODE_ENV === 'development' ? '?dev' : '';
    
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
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        log.info(`Server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async shutdown(): Promise<void> {
    log.info('Shutting down server');
    
    // Shutdown workspace manager
    await this.workspaceManager.shutdown();
    
    // Shutdown Karton
    await this.kartonManager.shutdown();
    
    // Close HTTP server
    return new Promise((resolve) => {
      this.server.close(() => {
        log.info('Server shut down');
        resolve();
      });
    });
  }

  getExpressApp(): express.Application {
    return this.app;
  }

  getHttpServer(): Server {
    return this.server;
  }
}