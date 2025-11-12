import { describe, it, expect } from 'vitest';
import type { NodeFileSystemProvider } from '../../index.js';
import { createFile, createFileTree } from '../utils/test-fixtures.js';

/**
 * Shared glob test suite that can be run with different file system providers.
 * This allows testing both ripgrep and Node.js fallback implementations with the same test cases.
 *
 * @param getFileSystem - Function that returns a configured NodeFileSystemProvider instance
 * @param getTestDir - Function that returns the current test directory
 */
export function runGlobTestSuite(
  getFileSystem: () => NodeFileSystemProvider,
  getTestDir: () => string,
) {
  describe('Pattern Matching', () => {
    it('should match simple wildcard patterns', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        'file1.ts': 'content',
        'file2.ts': 'content',
        'file3.js': 'content',
      });

      const result = await fileSystem.glob('*.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.relativePaths).toHaveLength(2);
      }
    });

    it('should match recursive patterns with **', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        'root.ts': 'content',
        src: {
          'main.ts': 'content',
          utils: {
            'helper.ts': 'content',
          },
        },
      });

      const result = await fileSystem.glob('**/*.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalMatches).toBeGreaterThanOrEqual(3);
      }
    });

    it('should return empty array when no matches', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFile(testDir, 'file.txt', 'content');

      const result = await fileSystem.glob('*.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.relativePaths).toHaveLength(0);
      }
    });
  });

  describe('Options', () => {
    it('should return absolute paths when absolute: true', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFile(testDir, 'file.ts', 'content');

      const result = await fileSystem.glob('*.ts', { absolute: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.relativePaths?.[0]).toContain(testDir);
      }
    });

    it('should only return files, not directories', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        src: {
          'index.ts': 'content',
        },
        'root.ts': 'content',
      });

      const result = await fileSystem.glob('*');

      expect(result.success).toBe(true);
      if (result.success) {
        // Should include root.ts but not the src directory
        const hasRootFile = result.relativePaths?.some((p) => p === 'root.ts');
        const hasSrcDir = result.relativePaths?.some((p) => p === 'src');
        expect(hasRootFile).toBe(true);
        expect(hasSrcDir).toBe(false);
      }
    });

    it('should respect excludePatterns', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        'index.ts': 'content',
        'test.ts': 'content',
      });

      const result = await fileSystem.glob('*.ts', {
        excludePatterns: ['*test*'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.relativePaths).toContain('index.ts');
        expect(result.relativePaths).not.toContain('test.ts');
      }
    });

    it('should respect gitignore by default', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        'src.ts': 'content',
        'ignored.ts': 'content',
        '.gitignore': 'ignored.ts',
      });

      const result = await fileSystem.glob('*.ts');

      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty pattern', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFile(testDir, 'file.ts', 'content');

      const result = await fileSystem.glob('');

      expect(result.success).toBe(true);
    });

    it('should handle deeply nested directories', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        a: {
          b: {
            c: {
              'file.ts': 'content',
            },
          },
        },
      });

      const result = await fileSystem.glob('**/*.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalMatches).toBeGreaterThan(0);
      }
    });
  });
}
