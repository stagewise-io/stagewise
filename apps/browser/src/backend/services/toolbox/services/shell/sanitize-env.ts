import { normalizeWindowsPath } from './normalize-windows-path';
import type { ShellType } from './types';

const WHITELIST = new Set([
  'PATH',
  'HOME',
  'USER',
  'USERNAME',
  'LOGNAME',
  'SHELL',
  'TERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'EDITOR',
  'VISUAL',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'NODE_ENV',
  'npm_config_registry',
]);

/**
 * Additional Windows-essential env vars that must pass through to child
 * processes (especially PTY-spawned bash / pnpm / node). Without these,
 * Git Bash / MSYS2 cannot bootstrap MSYSTEM paths, pnpm cannot locate its
 * store (`%LOCALAPPDATA%\pnpm`), and tooling that shells out to Windows
 * binaries fails with obscure errors.
 */
const WINDOWS_WHITELIST = new Set([
  'SYSTEMROOT',
  'WINDIR',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'LOCALAPPDATA',
  'APPDATA',
  'ALLUSERSPROFILE',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMW6432',
  'PUBLIC',
  'COMMONPROGRAMFILES',
  'COMMONPROGRAMFILES(X86)',
  'COMMONPROGRAMW6432',
  'PATHEXT',
  'COMSPEC',
  'SYSTEMDRIVE',
  'PROCESSOR_ARCHITECTURE',
  'PROCESSOR_IDENTIFIER',
  'PROCESSOR_LEVEL',
  'PROCESSOR_REVISION',
  'NUMBER_OF_PROCESSORS',
  'OS',
  'COMPUTERNAME',
  'USERDOMAIN',
  'USERDOMAIN_ROAMINGPROFILE',
  'SESSIONNAME',
  'LOGONSERVER',
  'MSYSTEM',
  'CHERE_INVOKING',
  // Node / package manager related
  'PNPM_HOME',
  'NPM_CONFIG_PREFIX',
  'NPM_CONFIG_CACHE',
  'NODE_PATH',
  'NVM_HOME',
  'NVM_SYMLINK',
  'FNM_DIR',
  'FNM_MULTISHELL_PATH',
  'FNM_NODE_DIST_MIRROR',
  'FNM_VERSION_FILE_STRATEGY',
]);

const SENSITIVE_PATTERNS = [
  'SECRET',
  'TOKEN',
  'KEY',
  'PASSWORD',
  'CREDENTIAL',
  'AUTH',
  'PRIVATE',
];

function isSensitive(key: string): boolean {
  const upper = key.toUpperCase();
  return SENSITIVE_PATTERNS.some((p) => upper.includes(p));
}

function isWhitelisted(key: string): boolean {
  if (WHITELIST.has(key)) return true;
  if (process.platform === 'win32') {
    const upper = key.toUpperCase();
    if (WINDOWS_WHITELIST.has(upper)) return true;
  }
  return false;
}

export function sanitizeEnv(
  resolvedEnv?: Record<string, string> | null,
  shellType?: ShellType,
): Record<string, string> {
  const env: Record<string, string> = {};
  const base: Record<string, string | undefined> =
    resolvedEnv ?? (process.env as Record<string, string | undefined>);

  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;

    if (key.startsWith('ELECTRON_') || key.startsWith('ELECTRON ')) continue;

    if (!isWhitelisted(key) && isSensitive(key)) continue;

    env[key] = value;
  }

  if (process.platform === 'win32') {
    // Ensure `PATH` is the authoritative variable (MSYS2 bash reads uppercase
    // `PATH` only). `resolveWindowsEnv` already normalizes its output, so this
    // call is usually a no-op — it's a defensive fallback for when
    // `resolveWindowsEnv` returns `null` (timeout, spawn error) and the base
    // env falls back to `process.env`, which may still contain mixed-case
    // `Path`. Do not remove without adjusting the upstream path.
    normalizeWindowsPath(env);

    // Locale overrides target MSYS2 / Git Bash Unicode rendering. PowerShell
    // ignores them itself but would pass them unchanged to spawned children
    // (node, python, pnpm), silently altering their locale-dependent
    // behavior. Skip them for PowerShell; apply for bash/zsh/sh or when the
    // shell type is unknown (conservative default matching prior behavior).
    if (shellType !== 'powershell') {
      env.LC_ALL = 'C.UTF-8';
      env.LC_CTYPE = 'C.UTF-8';
      env.LANG = 'C.UTF-8';
    }
  }

  // Defense-in-depth: disable persistent shell history for agent PTYs.
  // The integration scripts also do this (and override anything rc files
  // set), but env-level values cover the `sh` branch and the rare fallback
  // where integration sourcing fails. User rc files that unconditionally
  // export HISTFILE will beat this — that case is handled by the scripts.
  env.HISTFILE = '/dev/null';
  env.HISTSIZE = '0';
  env.SAVEHIST = '0';

  env.STAGEWISE_SHELL = '1';

  return env;
}
