import { spawn } from 'node:child_process';
import { homedir, userInfo } from 'node:os';
import { normalizeWindowsPath } from './normalize-windows-path';
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
 * Parse `cmd.exe /d /c set` output into a key-value record.
 * Each line is `KEY=VALUE`. Values may contain `=`; the first `=` is the split.
 * Blank lines and malformed entries are skipped.
 *
 * Limitation: `cmd.exe set` emits one logical entry per line with no
 * continuation syntax. Values that contain embedded newlines (possible via
 * `setx`, registry, or PowerShell) are truncated at the first `\n`. Rare in
 * practice, but worth knowing when debugging missing env vars.
 */
function parseCmdSet(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx);
    const value = line.slice(eqIdx + 1);
    result[key] = value;
  }
  return result;
}

/**
 * Resolve the real Windows user environment by spawning `cmd.exe /d /c set`.
 *
 * Why this is necessary: on Windows, Electron apps launched from shortcuts,
 * auto-start, or npm scripts frequently inherit a stripped `process.env`
 * (no PATH, no USERPROFILE, no LOCALAPPDATA). `child_process.spawn` on
 * Windows forwards the parent's native env block at the Win32 level even
 * when it looks empty in Node — but `node-pty` (ConPTY/winpty) does not.
 * So we must explicitly resolve the real user env here and forward it.
 *
 * `cmd.exe` reads the session env from the Win32 env block, which includes
 * the full user + system PATH via registry, regardless of what Node sees
 * in `process.env`.
 */
async function resolveWindowsEnv(
  timeoutMs: number,
): Promise<Record<string, string> | null> {
  return new Promise<Record<string, string> | null>((resolve) => {
    const comspec = process.env.COMSPEC || 'cmd.exe';
    // `/u` forces cmd's built-in output (here: `set`) to UTF-16LE, bypassing
    // the active console code page entirely. Without it, Windows defaults to
    // the system locale (CP1252 on Western installs, CP932 Japanese, CP936
    // Chinese, CP949 Korean, CP1251 Russian, etc.), producing mojibake for
    // non-ASCII env values like `C:\Users\François`. UTF-16LE is cmd's
    // native internal encoding, so no re-encoding takes place — the most
    // deterministic option for programmatic parsing.
    const child = spawn(comspec, ['/u', '/d', '/c', 'set'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Deliberately NOT passing `env` — we want cmd.exe to inherit the
      // native Win32 env block, which carries the user+system PATH even
      // if `process.env.PATH` is empty.
    });

    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve(null);
    }, timeoutMs);

    const chunks: Buffer[] = [];
    child.stdout?.on('data', (c: Buffer) => {
      chunks.push(c);
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
      // Decode UTF-16LE output from `cmd.exe /u`. Strip a possible BOM
      // (`0xFF 0xFE`); `cmd.exe` typically does not emit one on pipe output,
      // but handle it defensively for robustness across Windows versions.
      const buffer = Buffer.concat(chunks);
      const startOffset =
        buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe ? 2 : 0;
      const raw = buffer.toString('utf16le', startOffset);
      if (!raw.length) {
        resolve(null);
        return;
      }
      try {
        const parsed = parseCmdSet(raw);
        normalizeWindowsPath(parsed);
        resolve(parsed);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Resolve the user's full shell environment by spawning a login shell
 * and capturing its environment.
 *
 * On Windows, delegates to `cmd.exe /d /c set` to read the native Win32
 * env block. On macOS/Linux, uses `env -0` (null-delimited output)
 * instead of running the Electron binary with `ELECTRON_RUN_AS_NODE=1`,
 * because the `RunAsNode` fuse is disabled in packaged builds.
 */
export async function resolveShellEnv(
  shell: DetectedShell,
  timeoutMs = DEFAULT_RESOLVE_TIMEOUT_MS,
): Promise<Record<string, string> | null> {
  if (process.platform === 'win32') {
    return resolveWindowsEnv(timeoutMs);
  }

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
