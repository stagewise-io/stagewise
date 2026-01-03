#!/usr/bin/env tsx

/**
 * Bundle ESLint LSP Server
 *
 * Downloads vscode-eslint from GitHub, builds the server,
 * and copies it to bundled/eslint-server/ for packaging.
 *
 * Key fixes applied:
 * 1. Uses system temp directory to avoid Node module resolution conflicts with monorepo
 * 2. Uses a specific release tag instead of main branch for stability
 * 3. Uses pnpm for consistency with the monorepo
 * 4. Patches ts-loader with transpileOnly to avoid TypeScript version compatibility issues
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a specific release tag instead of main branch to avoid
// TypeScript version compatibility issues (main may have untested changes)
const VSCODE_ESLINT_VERSION = '3.0.10';
const VSCODE_ESLINT_REPO = `https://github.com/microsoft/vscode-eslint/archive/refs/tags/release/${VSCODE_ESLINT_VERSION}.zip`;
const BUNDLE_DIR = path.join(__dirname, '..', 'bundled', 'eslint-server');
// Use system temp directory to avoid Node module resolution
// walking up to the monorepo's node_modules and finding wrong webpack
const TEMP_DIR = path.join(os.tmpdir(), 'stagewise-eslint-build');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function main() {
  log('\n===========================================', colors.cyan);
  log('  Bundling ESLint LSP Server', colors.cyan);
  log('===========================================\n', colors.cyan);

  // 1. Check if already bundled (skip if exists)
  // Use .cjs extension to force CommonJS mode since apps/browser has "type": "module"
  const serverPath = path.join(BUNDLE_DIR, 'eslintServer.cjs');
  if (await fileExists(serverPath)) {
    log('ESLint server already bundled, skipping.\n', colors.green);
    return;
  }

  // 2. Clean temp directory
  log('Cleaning temp directory...', colors.blue);
  await fs.rm(TEMP_DIR, { recursive: true, force: true });
  await fs.mkdir(TEMP_DIR, { recursive: true });

  // 3. Download vscode-eslint zip
  log('Downloading vscode-eslint from GitHub...', colors.blue);
  const zipPath = path.join(TEMP_DIR, 'vscode-eslint.zip');
  await downloadFile(VSCODE_ESLINT_REPO, zipPath);
  log('  Downloaded\n', colors.green);

  // 4. Extract zip
  log('Extracting archive...', colors.blue);
  execSync(`unzip -q "${zipPath}" -d "${TEMP_DIR}"`);
  log('  Extracted\n', colors.green);

  // 5. Install dependencies and build
  // The extracted folder name matches the tag: vscode-eslint-release-{version}
  const extractedDir = path.join(
    TEMP_DIR,
    `vscode-eslint-release-${VSCODE_ESLINT_VERSION}`,
  );
  const serverDir = path.join(extractedDir, 'server');

  // Install root dependencies first (needed for shared.webpack.config.js which requires merge-options)
  // Using pnpm for consistency with the monorepo's package manager
  log('Installing root dependencies...', colors.blue);
  execSync('pnpm install', {
    cwd: extractedDir,
    stdio: 'inherit',
  });

  log('Installing server dependencies...', colors.blue);
  execSync('pnpm install', {
    cwd: serverDir,
    stdio: 'inherit',
  });

  // Explicitly install webpack and webpack-cli to avoid interactive prompts
  // on CI runners and ensure local packages are used
  // Also pin TypeScript to 5.1.x to avoid MapIterator/Symbol.dispose compatibility issues
  // (TypeScript 5.2+ introduced breaking changes to Map iterator types)
  log('Installing webpack build tools...', colors.blue);
  execSync('pnpm add -D webpack webpack-cli typescript@5.1.6', {
    cwd: serverDir,
    stdio: 'inherit',
  });
  log('  Dependencies installed\n', colors.green);

  // Patch shared.webpack.config.js to add transpileOnly: true to ts-loader
  // This is needed because Node.js 22+ has new MapIterator types with Symbol.dispose
  // that are incompatible with the vscode-eslint code. transpileOnly skips type checking entirely.
  log('Patching webpack config for compatibility...', colors.blue);
  const sharedWebpackPath = path.join(extractedDir, 'shared.webpack.config.js');
  let sharedWebpackContent = await fs.readFile(sharedWebpackPath, 'utf-8');
  // The ts-loader config already has options: { compilerOptions: {...} }
  // We need to add transpileOnly: true to the existing options object
  sharedWebpackContent = sharedWebpackContent.replace(
    /loader:\s*'ts-loader',\s*options:\s*\{/g,
    "loader: 'ts-loader', options: { transpileOnly: true,",
  );
  await fs.writeFile(sharedWebpackPath, sharedWebpackContent);

  log('Building ESLint server...', colors.blue);

  // Run webpack directly via pnpm exec to use local installation
  // First clean the output directory using fs.rm (no external dependency needed)
  const outDir = path.join(serverDir, 'out');
  await fs.rm(outDir, { recursive: true, force: true });

  execSync('pnpm exec webpack --mode production --config ./webpack.config.js', {
    cwd: serverDir,
    stdio: 'inherit',
  });
  log('  Server built\n', colors.green);

  // 6. Copy built server to bundled directory
  log('Copying server to bundled/eslint-server/...', colors.blue);
  await fs.mkdir(BUNDLE_DIR, { recursive: true });

  const serverOutDir = path.join(serverDir, 'out');
  await copyDir(serverOutDir, BUNDLE_DIR);

  // Rename .js to .cjs to force CommonJS mode (apps/browser has "type": "module")
  const jsPath = path.join(BUNDLE_DIR, 'eslintServer.js');
  const cjsPath = path.join(BUNDLE_DIR, 'eslintServer.cjs');
  if (await fileExists(jsPath)) {
    await fs.rename(jsPath, cjsPath);
    log('  Renamed to .cjs for CommonJS compatibility\n', colors.green);
  }
  log('  Server copied\n', colors.green);

  // 7. Cleanup temp directory
  log('Cleaning up temp files...', colors.blue);
  await fs.rm(TEMP_DIR, { recursive: true, force: true });
  log('  Cleanup complete\n', colors.green);

  log('===========================================', colors.cyan);
  log('  ESLint LSP Server bundled successfully!', colors.green);
  log('===========================================\n', colors.cyan);
  log(`Location: ${BUNDLE_DIR}`, colors.blue);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download: ${response.status} ${response.statusText}`,
    );
  }
  const fileStream = createWriteStream(dest);
  // @ts-expect-error - Node.js stream compatibility
  await pipeline(response.body, fileStream);
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

main().catch((error) => {
  log(`\nFailed to bundle ESLint server: ${error}`, colors.red);
  process.exit(1);
});
