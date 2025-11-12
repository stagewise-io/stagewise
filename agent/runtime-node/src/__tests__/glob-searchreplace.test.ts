import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeFileSystemProvider } from '../index.js';
import {
  createTempDir,
  createFile,
  createFileTree,
} from './utils/test-fixtures.js';
import { createCleanupHandler } from './utils/cleanup.js';

describe('glob', () => {
  const cleanup = createCleanupHandler();
  let fileSystem: NodeFileSystemProvider;
  let testDir: string;

  beforeEach(() => {
    testDir = createTempDir('glob-test-');
    cleanup.register(testDir);
    fileSystem = new NodeFileSystemProvider({
      workingDirectory: testDir,
      ripgrepBasePath: testDir,
    });
  });

  afterEach(async () => {
    await cleanup.cleanup();
  });

  describe('Pattern Matching', () => {
    it('should match simple wildcard patterns', async () => {
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
      createFile(testDir, 'file.ts', 'content');

      const result = await fileSystem.glob('*.ts', { absolute: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.relativePaths?.[0]).toContain(testDir);
      }
    });

    it('should only return files, not directories', async () => {
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
      createFile(testDir, 'file.ts', 'content');

      const result = await fileSystem.glob('');

      expect(result.success).toBe(true);
    });

    it('should handle deeply nested directories', async () => {
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
});

describe('searchAndReplace', () => {
  const cleanup = createCleanupHandler();
  let fileSystem: NodeFileSystemProvider;
  let testDir: string;

  beforeEach(() => {
    testDir = createTempDir('search-replace-test-');
    cleanup.register(testDir);
    fileSystem = new NodeFileSystemProvider({
      workingDirectory: testDir,
      ripgrepBasePath: testDir,
    });
  });

  afterEach(async () => {
    await cleanup.cleanup();
  });

  describe('Basic Replacement', () => {
    it('should replace simple string', async () => {
      createFile(testDir, 'test.txt', 'hello world\nhello again');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'hello',
        'goodbye',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(2);
        expect(result.fileModified).toBe(true);
      }
    });

    it('should be case insensitive by default', async () => {
      createFile(testDir, 'test.txt', 'Hello HELLO hello');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'hello',
        'hi',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(3);
      }
    });

    it('should be case sensitive when caseSensitive: true', async () => {
      createFile(testDir, 'test.txt', 'Hello hello HELLO');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'hello',
        'hi',
        {
          caseSensitive: true,
        },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(1);
      }
    });

    it('should match whole words when wholeWord: true', async () => {
      createFile(testDir, 'test.txt', 'hello helloworld worldhello');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'hello',
        'hi',
        {
          wholeWord: true,
        },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(1); // Only standalone "hello"
      }
    });

    it('should return match details', async () => {
      createFile(testDir, 'test.txt', 'line1: hello\nline2: hello');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'hello',
        'goodbye',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.replacements).toHaveLength(2);
        expect(result.replacements?.[0]?.line).toBe(1);
        expect(result.replacements?.[0]?.oldText).toBe('hello');
        expect(result.replacements?.[0]?.newText).toBe('goodbye');
      }
    });
  });

  describe('Regex Replacement', () => {
    it('should support regex patterns when regex: true', async () => {
      createFile(testDir, 'test.txt', 'test123 test456 test789');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'test\\d+',
        'number',
        { regex: true },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(3);
      }
    });

    it('should handle complex regex patterns', async () => {
      createFile(
        testDir,
        'test.txt',
        'email: user@example.com\nemail: admin@test.org',
      );

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        '\\w+@\\w+\\.\\w+',
        '[REDACTED]',
        { regex: true },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(2);
      }
    });
  });

  describe('Options', () => {
    it('should preserve case when preserveCase: true', async () => {
      createFile(testDir, 'test.txt', 'Hello HELLO hello');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'hello',
        'hi',
        {
          preserveCase: true,
        },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.replacements).toHaveLength(3);
      }
    });

    it('should limit replacements with maxReplacements', async () => {
      createFile(testDir, 'test.txt', 'a a a a a');

      const result = await fileSystem.searchAndReplace('test.txt', 'a', 'b', {
        maxReplacements: 3,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(3);
      }
    });

    it('should not modify file when dryRun: true', async () => {
      const originalContent = 'hello world';
      createFile(testDir, 'test.txt', originalContent);

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'hello',
        'goodbye',
        { dryRun: true },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(1);
        expect(result.fileModified).toBe(false);
      }

      // Verify file wasn't modified
      const readResult = await fileSystem.readFile('test.txt');
      if (readResult.success) {
        expect(readResult.content).toBe(originalContent);
      }
    });
  });

  describe('Multiple Matches', () => {
    it('should replace multiple matches on same line', async () => {
      createFile(testDir, 'test.txt', 'hello hello hello');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'hello',
        'hi',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(3);
      }
    });

    it('should maintain correct column positions', async () => {
      createFile(testDir, 'test.txt', '  hello  hello');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'hello',
        'hi',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Replacements are reported (check both positions exist)
        const columns = result.replacements?.map((r) => r.column);
        expect(columns).toContain(3); // First hello after 2 spaces
        expect(columns).toContain(10); // Second hello
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file', async () => {
      createFile(testDir, 'test.txt', '');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'hello',
        'hi',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(0);
      }
    });

    it('should handle file with no matches', async () => {
      createFile(testDir, 'test.txt', 'goodbye world');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'hello',
        'hi',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(0);
        expect(result.fileModified).toBe(false);
      }
    });

    it('should handle non-existent file', async () => {
      const result = await fileSystem.searchAndReplace(
        'nonexistent.txt',
        'hello',
        'hi',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle unicode characters', async () => {
      createFile(testDir, 'test.txt', '你好 world 🚀');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        'world',
        '世界',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(1);
      }
    });

    it('should handle empty replacement string', async () => {
      createFile(testDir, 'test.txt', 'hello world');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        ' world',
        '',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(1);
      }
    });

    it('should escape special regex characters in literal search', async () => {
      createFile(testDir, 'test.txt', 'price: $100 (USD)');

      const result = await fileSystem.searchAndReplace(
        'test.txt',
        '$100',
        '$200',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalReplacements).toBe(1);
      }
    });
  });
});
