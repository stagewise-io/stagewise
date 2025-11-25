/**
 * This file contains all utility function to generate all necessary route handlers for loading the toolbar app.
 */

import express, { type Request, type Response } from 'express';
import { stagewiseAppPrefix } from './shared';
import path, { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { WorkspaceManagerService } from '@/services/workspace-manager';
import type { WorkspacePlugin } from '@/shared/plugins';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export async function setupAppLoaderRoutes(
  app: express.Application,
  workspaceManager: WorkspaceManagerService,
) {
  // First, we serve the UI app in the defined path
  const toolbarPath =
    process.env.NODE_ENV === 'production'
      ? resolve(__dirname, 'toolbar-app')
      : resolve('node_modules/@stagewise/toolbar/dist/toolbar-main');
  app.use(stagewiseAppPrefix, express.static(toolbarPath));

  // Serve dynamically generated routes for config etc.
  app.get(
    '/stagewise-toolbar-app/config.js',
    createToolbarConfigHandler(workspaceManager),
  );

  // Serve all loaded plugins from the plugins directory. We need to resolve plugins JIT because the served plugins change whenever the loaded plugins change.
  // TODO

  // Last, we register the doc handler for the bootstrap HTML document which should be loaded from the root path
  app.get('/', async (_, res) => {
    const plugins =
      workspaceManager.workspace?.pluginService?.loadedPlugins || [];
    const html = await getBootstrapHtmlDocument(plugins);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(html);
  });
  app.get('*', async (_, res) => {
    res.redirect('/');
  });
}

async function getBootstrapHtmlDocument(plugins: WorkspacePlugin[]) {
  const importMap = await getImportMap(plugins);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>stagewise</title>
  <link rel="icon" href="https://stagewise.io/icon.png">
  <link rel="preconnect" href="https://rsms.me/">
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css">
  <script type="importmap">${JSON.stringify(importMap)}</script>
  <script type="module">import "index.js";</script>
</head>
<body></body>
</html>`;

  return html;
}

const getImportMap = async (plugins: WorkspacePlugin[]) => {
  const manifestPath =
    process.env.NODE_ENV === 'production'
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
      mainAppEntries[entry.file] = `${stagewiseAppPrefix}/${entry.file}`;
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
      '@stagewise/toolbar/config': `${stagewiseAppPrefix}/config.js`,
      '@stagewise/plugin-sdk': `${stagewiseAppPrefix}/plugin-sdk.js`,
      ...generatePluginImportMapEntries(plugins),
    },
  };
};

function generatePluginImportMapEntries(
  plugins: WorkspacePlugin[],
): Record<string, string> {
  const entries: Record<string, string> = {};

  // Only include available plugins in the import map
  const availablePlugins = plugins.filter((p) => p.available !== false);

  availablePlugins.forEach((plugin, index) => {
    const entryName = `plugin-entry-${index}`;

    if ('url' in plugin) {
      // External URL (including esm.sh)
      entries[entryName] = plugin.url;
    } else if ('path' in plugin) {
      // Local path - served by dev server
      const pluginName = plugin.name.replace(/[@/]/g, '-');
      entries[entryName] =
        `${stagewiseAppPrefix}/plugins/${pluginName}/index.js`;
    }
  });

  return entries;
}

function createToolbarConfigHandler(workspaceManager: WorkspaceManagerService) {
  return async (_req: Request, res: Response) => {
    try {
      const plugins =
        workspaceManager.workspace?.pluginService?.loadedPlugins || [];
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
  console.error('[stagewise] Plugin path: "${'path' in plugin ? plugin.path : plugin.url}"');
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

      const convertedConfig: Record<string, any> = {
        plugins: '__PLUGIN_PLACEHOLDER__',
        devAppPort: workspaceManager.workspace?.configService?.get().appPort,
      };

      // Add eddyMode if it exists
      if (
        workspaceManager.workspace?.configService?.get().eddyMode !== undefined
      ) {
        convertedConfig.eddyMode =
          workspaceManager.workspace?.configService?.get().eddyMode;
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
}
