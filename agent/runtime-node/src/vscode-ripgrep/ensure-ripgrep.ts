import os from 'node:os';
import fs from 'node:fs';
import util from 'node:util';

import { downloadRipgrep } from './download.js';
import { getRipgrepPath, getRipgrepBinDir } from './get-path.js';

const fsExists = util.promisify(fs.exists);
const mkdir = util.promisify(fs.mkdir);

const VERSION = 'v15.0.0';
const MULTI_ARCH_LINUX_VERSION = 'v13.0.0-4'; // use this for arm-unknown-linux-gnueabihf and powerpc64le-unknown-linux-gnu until we can fix https://github.com/microsoft/ripgrep-prebuilt/issues/24 and https://github.com/microsoft/ripgrep-prebuilt/issues/32 respectively.

/**
 * Determine the target platform for ripgrep binary
 */
async function getTarget(): Promise<string> {
  const arch = process.env.npm_config_arch || os.arch();

  switch (os.platform()) {
    case 'darwin':
      return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
    case 'win32':
      return arch === 'x64'
        ? 'x86_64-pc-windows-msvc'
        : arch === 'arm64'
          ? 'aarch64-pc-windows-msvc'
          : 'i686-pc-windows-msvc';
    case 'linux':
      return arch === 'x64'
        ? 'x86_64-unknown-linux-musl'
        : arch === 'arm'
          ? 'arm-unknown-linux-gnueabihf'
          : arch === 'armv7l'
            ? 'arm-unknown-linux-gnueabihf'
            : arch === 'arm64'
              ? 'aarch64-unknown-linux-musl'
              : arch === 'ppc64'
                ? 'powerpc64le-unknown-linux-gnu'
                : arch === 'riscv64'
                  ? 'riscv64gc-unknown-linux-gnu'
                  : arch === 's390x'
                    ? 's390x-unknown-linux-gnu'
                    : 'i686-unknown-linux-musl';
    default:
      throw new Error(`Unknown platform: ${os.platform()}`);
  }
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
async function retry(
  fn: () => Promise<void>,
  maxRetries = 5,
  onLog?: (message: string) => void,
): Promise<void> {
  let retries = 0;
  let lastError: unknown;

  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      retries++;

      if (retries >= maxRetries) {
        break;
      }

      const delay = Math.pow(2, retries) * 1000;
      onLog?.(
        `Download attempt ${retries} failed, retrying in ${delay / 1000} seconds...`,
      );
      await sleep(delay);
    }
  }

  throw lastError as Error;
}

export type EnsureRipgrepResult = {
  success: boolean;
  rgPath: string | null;
  error?: string;
};

export type EnsureRipgrepOptions = {
  rgBinaryBasePath: string;
  force?: boolean;
  onLog?: (message: string) => void;
};

/**
 * Ensures ripgrep binary is installed and available.
 * This function can be called from application code to ensure ripgrep is available.
 *
 * @param options.rgBinaryBasePath - Base directory where ripgrep should be installed (e.g., ~/.stagewise)
 * @param options.force - Force reinstallation even if binary exists
 * @param options.onLog - Optional logging callback
 * @returns Result object with success status, path to ripgrep binary, and optional error message
 */
export async function ensureRipgrepInstalled(
  options: EnsureRipgrepOptions,
): Promise<EnsureRipgrepResult> {
  const { rgBinaryBasePath, force = false, onLog = () => {} } = options;

  try {
    const binDir = getRipgrepBinDir(rgBinaryBasePath);
    const rgPath = getRipgrepPath(rgBinaryBasePath);

    // Check if binary already exists
    const binExists = await fsExists(binDir);
    if (!force && binExists) {
      onLog('Ripgrep binary already exists');
      return {
        success: true,
        rgPath,
      };
    }

    // Create bin directory if it doesn't exist
    if (!binExists) await mkdir(binDir, { recursive: true });

    // Determine target platform
    const target = await getTarget();

    // Prepare download options
    const downloadOpts = {
      version:
        target === 'arm-unknown-linux-gnueabihf' ||
        target === 'powerpc64le-unknown-linux-gnu' ||
        target === 's390x-unknown-linux-gnu'
          ? MULTI_ARCH_LINUX_VERSION
          : VERSION,
      token: process.env.GITHUB_TOKEN,
      target,
      destDir: binDir,
      force,
      onLog,
    };

    // Download ripgrep with retry logic
    await retry(() => downloadRipgrep(downloadOpts));

    onLog('Ripgrep installed successfully');

    return {
      success: true,
      rgPath,
    };
  } catch (err) {
    const errorMessage = `Failed to install ripgrep: ${err instanceof Error ? err.message : String(err)}`;

    onLog(errorMessage);

    return {
      success: false,
      rgPath: null,
      error: errorMessage,
    };
  }
}
