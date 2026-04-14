import { spawn } from 'node:child_process';
import { homedir, userInfo } from 'node:os';
import type { DetectedShell } from './types';

const DEFAULT_RESOLVE_TIMEOUT_MS = 10_000;

function safeUsername(): string {
  try {
    return userInfo().username;
  } catch {
    return '';
  }
}

/**
 * Parse null-delimited `env -0` output into a key-value record.
 * Each entry is `KEY=VALUE` separated by `\0`. Values may contain
 * newlines, equals signs, or any other character — the null delimiter
 * makes parsing unambiguous.
 */
function parseEnv0(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const entries = raw.split('\0').filter(Boolean);
  for (const entry of entries) {
    const eqIdx = entry.indexOf('=');
    if (eqIdx === -1) continue;
    const key = entry.slice(0, eqIdx);
    const value = entry.slice(eqIdx + 1);
    result[key] = value;
  }
  return result;
}

/**
 * Resolve the user's full shell environment by spawning a login shell
 * and capturing its environment via `env -0`.
 *
 * Uses `env -0` (null-delimited output) instead of running the Electron
 * binary with `ELECTRON_RUN_AS_NODE=1`, because the `RunAsNode` fuse is
 * disabled in packaged builds.
 */
export async function resolveShellEnv(
  shell: DetectedShell,
  timeoutMs = DEFAULT_RESOLVE_TIMEOUT_MS,
): Promise<Record<string, string> | null> {
  if (process.platform === 'win32') return null;

  // `env -0` prints all environment variables null-delimited.
  // Supported natively on macOS (/usr/bin/env) and Linux (GNU coreutils).
  const command = 'env -0';

  let shellArgs: string[];
  switch (shell.type) {
    case 'bash':
    case 'zsh':
    case 'sh':
      shellArgs = ['-ilc', command];
      break;
    case 'powershell':
      return null;
  }

  // On macOS/Linux, desktop-launched Electron apps may inherit a nearly
  // empty process.env (no HOME, USER, PATH, etc.). Seed essential vars so
  // the login shell can bootstrap, locate ~/.profile / ~/.zprofile, and
  // produce a fully populated environment.
  const env: Record<string, string> = {
    PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/opt/homebrew/sbin',
    HOME: homedir(),
    USER: safeUsername(),
    SHELL: shell.path,
    ...process.env,
    STAGEWISE_RESOLVING_ENVIRONMENT: '1',
  } as Record<string, string>;

  return new Promise<Record<string, string> | null>((resolve) => {
    const child = spawn(shell.path, shellArgs, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve(null);
    }, timeoutMs);

    const stdoutChunks: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0 && code !== null) {
        resolve(null);
        return;
      }

      const raw = Buffer.concat(stdoutChunks).toString('utf-8');
      if (!raw.length) {
        resolve(null);
        return;
      }

      try {
        const parsed = parseEnv0(raw);
        delete parsed.STAGEWISE_RESOLVING_ENVIRONMENT;
        resolve(parsed);
      } catch {
        resolve(null);
      }
    });
  });
}
