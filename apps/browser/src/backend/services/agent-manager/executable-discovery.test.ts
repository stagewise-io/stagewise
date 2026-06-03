import type { PathLike } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findExecutableOnPath } from './executable-discovery';

function createAccess(existingExecutablePaths: Set<string>) {
  return async (candidatePath: PathLike) => {
    const normalizedPath = String(candidatePath);
    if (!existingExecutablePaths.has(normalizedPath)) {
      throw new Error(`ENOENT: ${normalizedPath}`);
    }
  };
}

describe('findExecutableOnPath', () => {
  it('returns null when PATH is missing', async () => {
    await expect(
      findExecutableOnPath('claude', {
        env: {},
        platform: 'darwin',
        access: createAccess(new Set()),
      }),
    ).resolves.toBeNull();
  });

  it('searches later PATH entries', async () => {
    const executablePath = path.join('/opt/bin', 'claude');

    await expect(
      findExecutableOnPath('claude', {
        env: { PATH: ['/usr/bin', '/opt/bin'].join(path.delimiter) },
        platform: 'darwin',
        access: createAccess(new Set([executablePath])),
      }),
    ).resolves.toBe(executablePath);
  });

  it('requires POSIX execute access', async () => {
    await expect(
      findExecutableOnPath('codex', {
        env: { PATH: '/usr/local/bin' },
        platform: 'linux',
        access: createAccess(new Set()),
      }),
    ).resolves.toBeNull();
  });

  it('honors Windows PATHEXT suffixes', async () => {
    const executablePath = path.join('C:/Tools', 'codex.EXE');

    await expect(
      findExecutableOnPath('codex', {
        env: { PATH: 'C:/Tools', PATHEXT: '.COM;.EXE;.BAT;.CMD' },
        platform: 'win32',
        access: createAccess(new Set([executablePath])),
      }),
    ).resolves.toBe(executablePath);
  });
});
