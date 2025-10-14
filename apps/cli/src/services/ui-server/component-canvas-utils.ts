/**
 * This file contains all utility function to generate all necessary route handlers for loading the toolbar app.
 */

import express, { type Request, type Response } from 'express';
import { stagewiseAppPrefix } from './shared';
import { resolve } from 'node:path';
import type { WorkspaceManagerService } from '@/services/workspace-manager';

export async function setupComponentConvasRoutes(
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
    '/stagewise-toolbar-app/component-canvas/preview-compiled/:componentId',
    createComponentCanvasHandler(),
  );

  app.get(
    '/stagewise-toolbar-app/component-canvas/preview-module/:componentId',
    createComponentModuleHandler(workspaceManager),
  );
}

async function getBootstrapHtmlDocument(componentId: string) {
  const importMap = await getImportMap(componentId);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>stagewise Component Preview Canvas</title>
  <script type="importmap">${JSON.stringify(importMap)}</script>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <script type="module">
/* Create initial component */
import { createRoot } from "react-dom/client";
import { createElement } from "react";

import CreatedComponent from "stagewise-preview-component";

const appRoot = createRoot(document.body);
appRoot.render(createElement(CreatedComponent, {}, null));
</script>
</head>
<body className="fixed size-full inset-0 bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center justify-center p-4">
</body>
</html>`;

  return html;
}

const getImportMap = async (componentId: string) => {
  // Dynamically generate a importmap.json file based on the vite app entries, config and external react deps
  const reactDepsDevSuffix =
    process.env.NODE_ENV === 'development' ? '?dev' : '';
  return {
    imports: {
      react: `https://esm.sh/react@19.1.0${reactDepsDevSuffix}`,
      'react-dom': `https://esm.sh/react-dom@19.1.0${reactDepsDevSuffix}`,
      'react-dom/client': `https://esm.sh/react-dom@19.1.0/client${reactDepsDevSuffix}`,
      'react/jsx-runtime': `https://esm.sh/react@19.1.0/jsx-runtime${reactDepsDevSuffix}`,
      'lucide-react': `https://esm.sh/lucide-react`,
      'framer-motion': `https://esm.sh/framer-motion`,
      'stagewise-preview-component': `/stagewise-toolbar-app/component-canvas/preview-module/${componentId}`,
    },
  };
};

function createComponentCanvasHandler() {
  return async (req: Request, res: Response) => {
    try {
      const componentId = req.params.componentId as string;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(await getBootstrapHtmlDocument(componentId));
    } catch (_error) {
      res.status(500).send('Error generating config');
    }
  };
}

function createComponentModuleHandler(
  workspaceManager: WorkspaceManagerService,
) {
  return async (req: Request, res: Response) => {
    try {
      const componentId = req.params.componentId as string;

      const inspirationComponent = workspaceManager.workspace?.agentService
        ?.getInspirationComponents()
        .find((c) => c.id === componentId);

      if (!inspirationComponent) {
        res.status(404).send('Component not found');
        return;
      }

      const responseContent = inspirationComponent.compiledCode;

      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.send(responseContent);
    } catch (_error) {
      res.status(500).send('Error generating config');
    }
  };
}
