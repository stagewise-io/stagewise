import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyToolExecute } from './copy';
import type { MountedClientRuntimes } from '../../utils';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a temporary directory for a test run.
 */
function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Create a file inside `baseDir` with the given relative path and content.
 * Creates parent directories as needed.
 */
function createFile(baseDir: string, relPath: string, content: string): void {
  const full = path.join(baseDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

/**
 * Build a minimal `MountedClientRuntimes` map backed by a real directory.
 * The mock provides only the methods that `copyToolExecute` actually calls.
 */
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

describe('copyToolExecute', () => {
  let testDir: string;
  let mountedRuntimes: MountedClientRuntimes;

  beforeEach(() => {
    testDir = createTempDir('copy-tool-test-');
    mountedRuntimes = buildMountedRuntimes('w1', testDir);
  });

  afterEach(async () => {
    await fsPromises.rm(testDir, { recursive: true, force: true });
  });

  // ─────────────────── Single-file copy ───────────────────

  describe('copy file', () => {
    it('copies a single file to a new path', async () => {
      createFile(testDir, 'src/utils.ts', 'export const x = 1;');

      const result = await copyToolExecute(
        {
          input_path: 'w1/src/utils.ts',
          output_path: 'w1/lib/utils.ts',
          move: false,
        },
        mountedRuntimes,
      );

      expect(result.message).toContain('Copied');
      expect(result.message).toContain('file');

      // Source still exists
      expect(fs.existsSync(path.join(testDir, 'src/utils.ts'))).toBe(true);
      // Destination exists with same content
      expect(fs.readFileSync(path.join(testDir, 'lib/utils.ts'), 'utf-8')).toBe(
        'export const x = 1;',
      );
    });

    it('copies a file into an existing directory (auto-resolves filename)', async () => {
      createFile(testDir, 'src/helpers.ts', 'export const y = 2;');
      fs.mkdirSync(path.join(testDir, 'dest'), { recursive: true });

      const result = await copyToolExecute(
        {
          input_path: 'w1/src/helpers.ts',
          output_path: 'w1/dest',
          move: false,
        },
        mountedRuntimes,
      );

      expect(result.message).toContain('Copied');
      expect(
        fs.readFileSync(path.join(testDir, 'dest/helpers.ts'), 'utf-8'),
      ).toBe('export const y = 2;');
    });

    it('creates parent directories when they do not exist', async () => {
      createFile(testDir, 'a.txt', 'hello');

      await copyToolExecute(
        {
          input_path: 'w1/a.txt',
          output_path: 'w1/deep/nested/dir/a.txt',
          move: false,
        },
        mountedRuntimes,
      );

      expect(
        fs.readFileSync(path.join(testDir, 'deep/nested/dir/a.txt'), 'utf-8'),
      ).toBe('hello');
    });
  });

  // ─────────────────── Single-file move ───────────────────

  describe('move file', () => {
    it('moves a single file (source removed)', async () => {
      createFile(testDir, 'old.ts', 'content');

      const result = await copyToolExecute(
        { input_path: 'w1/old.ts', output_path: 'w1/new.ts', move: true },
        mountedRuntimes,
      );

      expect(result.message).toContain('Moved');
      expect(fs.existsSync(path.join(testDir, 'old.ts'))).toBe(false);
      expect(fs.readFileSync(path.join(testDir, 'new.ts'), 'utf-8')).toBe(
        'content',
      );
    });

    it('moves a file into an existing directory', async () => {
      createFile(testDir, 'file.ts', 'data');
      fs.mkdirSync(path.join(testDir, 'target'), { recursive: true });

      const result = await copyToolExecute(
        { input_path: 'w1/file.ts', output_path: 'w1/target', move: true },
        mountedRuntimes,
      );

      expect(result.message).toContain('Moved');
      expect(fs.existsSync(path.join(testDir, 'file.ts'))).toBe(false);
      expect(
        fs.readFileSync(path.join(testDir, 'target/file.ts'), 'utf-8'),
      ).toBe('data');
    });
  });

  // ─────────────────── Directory copy ───────────────────

  describe('copy directory', () => {
    it('recursively copies a directory', async () => {
      createFile(testDir, 'components/Button.tsx', '<Button />');
      createFile(testDir, 'components/Card.tsx', '<Card />');
      createFile(testDir, 'components/forms/Input.tsx', '<Input />');

      const result = await copyToolExecute(
        {
          input_path: 'w1/components',
          output_path: 'w1/backup/components',
          move: false,
        },
        mountedRuntimes,
      );

      expect(result.message).toContain('Copied');
      expect(result.message).toContain('directory');

      // Source still exists
      expect(fs.existsSync(path.join(testDir, 'components/Button.tsx'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(testDir, 'components/Card.tsx'))).toBe(
        true,
      );
      expect(
        fs.existsSync(path.join(testDir, 'components/forms/Input.tsx')),
      ).toBe(true);

      // Destination has all files
      expect(
        fs.readFileSync(
          path.join(testDir, 'backup/components/Button.tsx'),
          'utf-8',
        ),
      ).toBe('<Button />');
      expect(
        fs.readFileSync(
          path.join(testDir, 'backup/components/Card.tsx'),
          'utf-8',
        ),
      ).toBe('<Card />');
      expect(
        fs.readFileSync(
          path.join(testDir, 'backup/components/forms/Input.tsx'),
          'utf-8',
        ),
      ).toBe('<Input />');
    });

    it('preserves nested directory structure when copying', async () => {
      createFile(testDir, 'src/a/b/c/deep.ts', 'deep');
      createFile(testDir, 'src/a/sibling.ts', 'sibling');

      await copyToolExecute(
        { input_path: 'w1/src/a', output_path: 'w1/dest/a', move: false },
        mountedRuntimes,
      );

      expect(
        fs.readFileSync(path.join(testDir, 'dest/a/b/c/deep.ts'), 'utf-8'),
      ).toBe('deep');
      expect(
        fs.readFileSync(path.join(testDir, 'dest/a/sibling.ts'), 'utf-8'),
      ).toBe('sibling');
    });
  });

  // ─────────────────── Directory move ───────────────────

  describe('move directory', () => {
    it('moves an entire directory (source removed)', async () => {
      createFile(testDir, 'old-dir/a.ts', 'aaa');
      createFile(testDir, 'old-dir/sub/b.ts', 'bbb');

      const result = await copyToolExecute(
        {
          input_path: 'w1/old-dir',
          output_path: 'w1/new-dir',
          move: true,
        },
        mountedRuntimes,
      );

      expect(result.message).toContain('Moved');
      expect(result.message).toContain('directory');

      // Source directory is gone
      expect(fs.existsSync(path.join(testDir, 'old-dir'))).toBe(false);

      // Destination has files
      expect(fs.readFileSync(path.join(testDir, 'new-dir/a.ts'), 'utf-8')).toBe(
        'aaa',
      );
      expect(
        fs.readFileSync(path.join(testDir, 'new-dir/sub/b.ts'), 'utf-8'),
      ).toBe('bbb');
    });

    it('moves a directory with deeply nested files', async () => {
      createFile(testDir, 'utils/deep/a/b/c.ts', 'nested-content');
      createFile(testDir, 'utils/top.ts', 'top-content');

      await copyToolExecute(
        { input_path: 'w1/utils', output_path: 'w1/lib', move: true },
        mountedRuntimes,
      );

      expect(fs.existsSync(path.join(testDir, 'utils'))).toBe(false);
      expect(
        fs.readFileSync(path.join(testDir, 'lib/deep/a/b/c.ts'), 'utf-8'),
      ).toBe('nested-content');
      expect(fs.readFileSync(path.join(testDir, 'lib/top.ts'), 'utf-8')).toBe(
        'top-content',
      );
    });
  });

  // ─────────────────── Error cases ───────────────────

  describe('error handling', () => {
    it('throws when source does not exist', async () => {
      await expect(
        copyToolExecute(
          {
            input_path: 'w1/nonexistent.ts',
            output_path: 'w1/dest.ts',
            move: false,
          },
          mountedRuntimes,
        ),
      ).rejects.toThrow('Source not found');
    });

    it('throws when copying a directory into an existing file', async () => {
      createFile(testDir, 'src-dir/a.ts', 'a');
      createFile(testDir, 'existing-file.ts', 'file');

      await expect(
        copyToolExecute(
          {
            input_path: 'w1/src-dir',
            output_path: 'w1/existing-file.ts',
            move: false,
          },
          mountedRuntimes,
        ),
      ).rejects.toThrow('Cannot copy directory into existing file');
    });

    it('throws when mount prefix is invalid', async () => {
      createFile(testDir, 'a.ts', 'content');

      await expect(
        copyToolExecute(
          {
            input_path: 'invalid/a.ts',
            output_path: 'w1/b.ts',
            move: false,
          },
          mountedRuntimes,
        ),
      ).rejects.toThrow('Mount invalid not found');
    });
  });

  // ─────────────────── Edge cases ───────────────────

  describe('edge cases', () => {
    it('handles an empty directory copy', async () => {
      fs.mkdirSync(path.join(testDir, 'empty-dir'), { recursive: true });

      const result = await copyToolExecute(
        {
          input_path: 'w1/empty-dir',
          output_path: 'w1/empty-copy',
          move: false,
        },
        mountedRuntimes,
      );

      expect(result.message).toContain('Copied');
      expect(fs.existsSync(path.join(testDir, 'empty-copy'))).toBe(true);
      const entries = fs.readdirSync(path.join(testDir, 'empty-copy'));
      expect(entries).toHaveLength(0);
    });

    it('handles an empty directory move', async () => {
      fs.mkdirSync(path.join(testDir, 'empty-dir'), { recursive: true });

      await copyToolExecute(
        {
          input_path: 'w1/empty-dir',
          output_path: 'w1/moved-empty',
          move: true,
        },
        mountedRuntimes,
      );

      expect(fs.existsSync(path.join(testDir, 'empty-dir'))).toBe(false);
      expect(fs.existsSync(path.join(testDir, 'moved-empty'))).toBe(true);
    });

    it('overwrites destination file when copying a file to an existing path', async () => {
      createFile(testDir, 'src.ts', 'new content');
      createFile(testDir, 'dest.ts', 'old content');

      await copyToolExecute(
        { input_path: 'w1/src.ts', output_path: 'w1/dest.ts', move: false },
        mountedRuntimes,
      );

      expect(fs.readFileSync(path.join(testDir, 'dest.ts'), 'utf-8')).toBe(
        'new content',
      );
      // Source untouched
      expect(fs.readFileSync(path.join(testDir, 'src.ts'), 'utf-8')).toBe(
        'new content',
      );
    });

    it('copies a directory with mixed file types (binary-like content)', async () => {
      createFile(testDir, 'assets/readme.md', '# Hello');
      // Simulate binary-ish content
      fs.mkdirSync(path.join(testDir, 'assets'), { recursive: true });
      fs.writeFileSync(
        path.join(testDir, 'assets/image.bin'),
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );

      await copyToolExecute(
        {
          input_path: 'w1/assets',
          output_path: 'w1/assets-backup',
          move: false,
        },
        mountedRuntimes,
      );

      expect(
        fs.readFileSync(path.join(testDir, 'assets-backup/readme.md'), 'utf-8'),
      ).toBe('# Hello');
      const bin = fs.readFileSync(
        path.join(testDir, 'assets-backup/image.bin'),
      );
      expect(bin).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
  });
});
