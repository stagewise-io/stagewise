import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LspServerInfo, LspServerHandle } from '../types';
import { ESLINT_EXTENSIONS } from '../language-map';
import {
  hasAnyFile,
  fileExists,
  isPackageInstalled,
} from './utils/root-finder';
import { spawnStdioLspServer } from './utils/spawn-helpers';

// FIX: Use ES module compatible __dirname (same pattern as plugin.ts, app-menu.ts, etc.)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ESLINT_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintrc.json',
  '.eslintrc',
];

/**
 * ESLint Language Server definition
 *
 * Uses the bundled vscode-eslint server.
 * Only activates if ESLint config exists AND eslint is installed.
 */
export const eslintServer: LspServerInfo = {
  id: 'eslint',
  name: 'ESLint Language Server',
  extensions: ESLINT_EXTENSIONS,

  async shouldActivate(projectRoot: string): Promise<boolean> {
    // Check for ESLint config files
    const hasConfig = await hasAnyFile(projectRoot, ESLINT_CONFIG_FILES);

    // Also need eslint installed
    const hasEslint = await isPackageInstalled(projectRoot, 'eslint');

    return hasConfig && hasEslint;
  },

  async spawn(
    projectRoot: string,
    resolvedEnv?: Record<string, string> | null,
  ): Promise<LspServerHandle | undefined> {
    try {
      const serverPath = await findBundledEslintServer();

      if (!serverPath) {
        console.warn(
          '[ESLint Server] Bundled server not found. ESLint support disabled.',
        );
        return undefined;
      }

      return spawnEslintServer(
        serverPath,
        projectRoot,
        resolvedEnv ?? globalThis.process.env,
      );
    } catch (error) {
      console.error('[ESLint Server] Failed to spawn:', error);
      return undefined;
    }
  },
};

async function findBundledEslintServer(): Promise<string | undefined> {
  const possiblePaths = [
    // Production path (all platforms) - extraResource location
    // Use .cjs extension to force CommonJS mode (apps/browser has "type": "module")
    path.join(
      process.resourcesPath,
      'bundled',
      'eslint-server',
      'eslintServer.cjs',
    ),
    // Development path (from compiled location in .vite/build/)
    path.join(
      __dirname,
      '..',
      '..',
      'bundled',
      'eslint-server',
      'eslintServer.cjs',
    ),
  ];

  for (const serverPath of possiblePaths) {
    const exists = await fileExists(serverPath);
    if (exists) return serverPath;
  }

  return undefined;
}

function spawnEslintServer(
  serverPath: string,
  root: string,
  env: Record<string, string> | NodeJS.ProcessEnv,
): Promise<LspServerHandle | undefined> {
  const workspaceFolderName = path.basename(root);

  return spawnStdioLspServer('node', [serverPath, '--stdio'], {
    cwd: root,
    env: {
      ...env,
      ESLINT_WORKSPACE_FOLDER: root,
    },
    initializationOptions: {
      validate: 'on', // 'on' | 'off' | 'probe'
      packageManager: null, // Let ESLint auto-detect
      useESLintClass: true, // Use the new ESLint class API
      experimental: {
        useFlatConfig: true, // For eslint.config.js projects
      },
      codeActionOnSave: { mode: 'all' },
      format: false,
      quiet: false,
      onIgnoredFiles: 'off',
      options: {},
      rulesCustomizations: [],
      run: 'onType', // 'onType' | 'onSave'
      problems: { shortenToSingleLine: false },
      nodePath: null,
      // CRITICAL: workspaceFolder tells ESLint where to find node_modules/eslint
      workspaceFolder: {
        name: workspaceFolderName,
        uri: `file://${root}`,
      },
      codeAction: {
        disableRuleComment: {
          enable: true,
          location: 'separateLine',
          commentStyle: 'line',
        },
        showDocumentation: { enable: true },
      },
    },
  });
}
