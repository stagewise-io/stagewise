import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { lsToolExecute } from './ls';
import type { MountedClientRuntimes } from '../../utils';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createFile(baseDir: string, relPath: string, content: string): void {
  const full = path.join(baseDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

function buildMountedRuntimes(
  mountPrefix: string,
  rootDir: string,
): MountedClientRuntimes {
  const runtime = {
    fileSystem: {
      resolvePath(relativePath: string): string {
        return path.join(rootDir, relativePath);
      },
      async fileExists(absolutePath: string): Promise<boolean> {
        try {
          await fsPromises.stat(absolutePath);
          return true;
        } catch {
          return false;
        }
      },
    },
  };
  return new Map([[mountPrefix, runtime]]) as unknown as MountedClientRuntimes;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lsToolExecute', () => {
  let testDir: string;
  let mountedRuntimes: MountedClientRuntimes;

  beforeEach(() => {
    testDir = createTempDir('ls-tool-test-');
    mountedRuntimes = buildMountedRuntimes('w1', testDir);
  });

  afterEach(async () => {
    await fsPromises.rm(testDir, { recursive: true, force: true });
  });

  it('succeeds for an existing directory', async () => {
    fs.mkdirSync(path.join(testDir, 'my-dir'), { recursive: true });

    // Should not throw — returns void
    const result = await lsToolExecute({ path: 'w1/my-dir' }, mountedRuntimes);
    expect(result).toBeUndefined();
  });

  it('succeeds for the mount root directory', async () => {
    const result = await lsToolExecute({ path: 'w1/' }, mountedRuntimes);
    expect(result).toBeUndefined();
  });

  it('throws for a non-existent directory', async () => {
    await expect(
      lsToolExecute({ path: 'w1/does-not-exist' }, mountedRuntimes),
    ).rejects.toThrow(/does not exist/);
  });

  it('succeeds even if path is a file (validation is lightweight)', async () => {
    createFile(testDir, 'file.txt', 'hello');

    // The tool only checks existence — deeper type validation happens
    // in the pathReferences pipeline downstream
    const result = await lsToolExecute(
      { path: 'w1/file.txt' },
      mountedRuntimes,
    );
    expect(result).toBeUndefined();
  });

  it('throws for an invalid mount prefix', async () => {
    await expect(
      lsToolExecute({ path: 'invalid/some-dir' }, mountedRuntimes),
    ).rejects.toThrow();
  });
});
