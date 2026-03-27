import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirToolExecute } from './mkdir';
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
          const stat = await fsPromises.stat(absolutePath);
          return stat.isFile();
        } catch {
          return false;
        }
      },
      async isDirectory(absolutePath: string): Promise<boolean> {
        try {
          const stat = await fsPromises.stat(absolutePath);
          return stat.isDirectory();
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

describe('mkdirToolExecute', () => {
  let testDir: string;
  let mountedRuntimes: MountedClientRuntimes;

  beforeEach(() => {
    testDir = createTempDir('mkdir-tool-test-');
    mountedRuntimes = buildMountedRuntimes('w1', testDir);
  });

  afterEach(async () => {
    await fsPromises.rm(testDir, { recursive: true, force: true });
  });

  it('creates a single directory', async () => {
    const result = await mkdirToolExecute(
      { path: 'w1/new-dir' },
      mountedRuntimes,
    );

    expect(result.message).toBe('Created directory: w1/new-dir');
    const stat = await fsPromises.stat(path.join(testDir, 'new-dir'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('creates nested directories recursively', async () => {
    const result = await mkdirToolExecute(
      { path: 'w1/a/b/c/d' },
      mountedRuntimes,
    );

    expect(result.message).toBe('Created directory: w1/a/b/c/d');
    const stat = await fsPromises.stat(path.join(testDir, 'a/b/c/d'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('returns no-op message when directory already exists', async () => {
    fs.mkdirSync(path.join(testDir, 'existing'), { recursive: true });

    const result = await mkdirToolExecute(
      { path: 'w1/existing' },
      mountedRuntimes,
    );

    expect(result.message).toBe('Directory already exists: w1/existing');
  });

  it('throws when a file exists at the path', async () => {
    createFile(testDir, 'some-file', 'content');

    await expect(
      mkdirToolExecute({ path: 'w1/some-file' }, mountedRuntimes),
    ).rejects.toThrow(
      'A file already exists at w1/some-file. Cannot create directory.',
    );
  });

  it('throws when mount prefix is invalid', async () => {
    await expect(
      mkdirToolExecute({ path: 'invalid/new-dir' }, mountedRuntimes),
    ).rejects.toThrow(/Mount invalid not found/);
  });
});
