/**
 * This file contains all utility function to generate all necessary route handlers for loading the toolbar app.
 */

import express, { type Request, type Response } from 'express';
import { stagewiseAppPrefix } from './shared';
import path, { resolve } from 'node:path';
import type { WorkspaceManagerService } from '@/services/workspace-manager';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

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

const container = document.getElementById("root");
if (container) {
  const appRoot = createRoot(container);
  appRoot.render(createElement(CreatedComponent, {}, null));
}
</script>
</head>
<body className="fixed size-full inset-0 bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center justify-center p-4">
  <div id="root" className="w-full h-full"></div>
</body>
</html>`;

  return html;
}

const getImportMap = async (componentId: string) => {
  // Dynamically generate a importmap.json file based on the vite app entries, config and external react deps
  // Use React 18.3.1 for better library compatibility (especially Framer Motion)
  // Always use production builds for consistency - esm.sh builds libraries expecting production React,
  // and mixing dev/prod builds causes "Cannot read properties of null (reading 'useContext')" errors
  const reactVersion = '18.3.1';

  // Dependency hints tell esm.sh to externalize React (don't bundle it)
  // The import map below ensures all packages use the same React instance
  const reactDeps = `deps=react@${reactVersion},react-dom@${reactVersion}`;

  return {
    imports: {
      react: `https://esm.sh/react@${reactVersion}`,
      'react-dom': `https://esm.sh/react-dom@${reactVersion}`,
      'react-dom/client': `https://esm.sh/react-dom@${reactVersion}/client`,
      'react/jsx-runtime': `https://esm.sh/react@${reactVersion}/jsx-runtime`,
      'lucide-react': `https://esm.sh/lucide-react?${reactDeps}`,
      'framer-motion': `https://esm.sh/framer-motion@11?${reactDeps}&external=react,react-dom`,
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
