import { accessSync, constants } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import type { DetectedShell, ShellType } from './types';

const BLACKLISTED_SHELLS = new Set(['fish', 'nu', 'nushell']);

function fileExists(p: string): boolean {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function extractBasename(shellPath: string): string {
  const base =
    process.platform === 'win32'
      ? path.win32.basename(shellPath)
      : path.basename(shellPath);
  return base.replace(/\.exe$/i, '').toLowerCase();
}

function isBlacklisted(shellPath: string): boolean {
  return BLACKLISTED_SHELLS.has(extractBasename(shellPath));
}

function deriveShellType(shellPath: string): ShellType {
  const name = extractBasename(shellPath);
  if (name === 'zsh') return 'zsh';
  if (name === 'bash') return 'bash';
  if (name === 'sh') return 'sh';
  if (name === 'pwsh' || name === 'powershell') return 'powershell';
  return 'sh';
}

function tryCandidate(shellPath: string): DetectedShell | null {
  if (!fileExists(shellPath)) return null;
  if (isBlacklisted(shellPath)) return null;
  return { type: deriveShellType(shellPath), path: shellPath };
}

function whereLookup(binary: string): string | null {
  try {
    return (
      execSync(`where ${binary}`, {
        encoding: 'utf-8',
        timeout: 5_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .split(/\r?\n/)[0]
        ?.trim() || null
    );
  } catch {
    return null;
  }
}

function detectGitBashWindows(): string | null {
  const commonPaths = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ];
  for (const p of commonPaths) {
    if (fileExists(p)) return p;
  }

  const gitExe = whereLookup('git');
  if (gitExe) {
    const bashPath = path.resolve(
      path.dirname(gitExe),
      '..',
      '..',
      'bin',
      'bash.exe',
    );
    if (fileExists(bashPath)) return bashPath;
  }

  return null;
}

function detectDarwin(): DetectedShell | null {
  const envShell = process.env.SHELL;
  if (envShell) {
    const candidate = tryCandidate(envShell);
    if (candidate) return candidate;
  }
  for (const p of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    const candidate = tryCandidate(p);
    if (candidate) return candidate;
  }
  return null;
}

function detectLinux(): DetectedShell | null {
  const envShell = process.env.SHELL;
  if (envShell) {
    const candidate = tryCandidate(envShell);
    if (candidate) return candidate;
  }
  for (const p of ['/bin/bash', '/usr/bin/zsh', '/bin/sh']) {
    const candidate = tryCandidate(p);
    if (candidate) return candidate;
  }
  return null;
}

function detectWindows(): DetectedShell | null {
  const envShell = process.env.SHELL;
  if (envShell) {
    const candidate = tryCandidate(envShell);
    if (candidate) return candidate;
  }

  const gitBash = detectGitBashWindows();
  if (gitBash) return { type: 'bash', path: gitBash };

  for (const binary of ['pwsh', 'powershell']) {
    const found = whereLookup(binary);
    if (found && fileExists(found)) {
      return { type: 'powershell', path: found };
    }
  }

  return null;
}

export function detectShell(): DetectedShell | null {
  switch (process.platform) {
    case 'darwin':
      return detectDarwin();
    case 'linux':
      return detectLinux();
    case 'win32':
      return detectWindows();
    default:
      return detectLinux();
  }
}
