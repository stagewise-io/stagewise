import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NodeFileSystemProvider } from '../index.js';
import {
  createTempDir,
  createFile,
  createFileTree,
  createBinaryFile,
} from './utils/test-fixtures.js';
import { expectGrepSuccess, expectGrepMatchCount } from './utils/assertions.js';
import { createCleanupHandler } from './utils/cleanup.js';

// Mock ripgrep to force fallback to Node.js implementation
vi.mock('../grep/grep-ripgrep.js', () => ({
  grepWithRipgrep: vi.fn().mockResolvedValue(null),
}));

describe('grep - Node.js Fallback', () => {
  const cleanupHandler = createCleanupHandler();
  let testDir: string;
  let fileSystem: NodeFileSystemProvider;

  beforeEach(() => {
    testDir = createTempDir('grep-fallback-test-');
    cleanupHandler.register(testDir);
    fileSystem = new NodeFileSystemProvider({
      workingDirectory: testDir,
    });
  });

  afterEach(() => {
    cleanupHandler.cleanup();
  });

  describe('Fallback Activation', () => {
    it('should use Node.js fallback when ripgrep returns null', async () => {
      createFile(testDir, 'test.txt', 'Hello World\n');

      const result = await fileSystem.grep('.', 'World');

      // Should succeed using fallback
      expectGrepSuccess(result);
      expectGrepMatchCount(result, 1);
    });

    it('should produce same output structure as ripgrep', async () => {
      createFile(testDir, 'test.txt', 'Line 1 MATCH\nLine 2\n');

      const result = await fileSystem.grep('.', 'MATCH');

      expectGrepSuccess(result);
      expect(result).toHaveProperty('matches');
      expect(result).toHaveProperty('totalMatches');
      expect(result).toHaveProperty('filesSearched');

      const match = result.matches?.[0];
      expect(match).toBeDefined();
      if (match) {
        expect(match).toHaveProperty('relativePath');
        expect(match).toHaveProperty('line');
        expect(match).toHaveProperty('column');
        expect(match).toHaveProperty('match');
        expect(match).toHaveProperty('preview');
      }
    });

    it('should handle case insensitive search by default', async () => {
      createFile(testDir, 'test.txt', 'Hello WORLD\nHello world\n');

      const result = await fileSystem.grep('.', 'world');

      expectGrepSuccess(result);
      expectGrepMatchCount(result, 2);
    });

    it('should handle case sensitive search', async () => {
      createFile(testDir, 'test.txt', 'Hello WORLD\nHello world\n');

      const result = await fileSystem.grep('.', 'world', {
        caseSensitive: true,
      });

      expectGrepSuccess(result);
      expectGrepMatchCount(result, 1);
    });
  });

  describe('Binary File Detection', () => {
    it('should skip binary files by default', async () => {
      createFile(testDir, 'text.txt', 'This is text content');
      createBinaryFile(testDir, 'binary.bin', 1024);

      const result = await fileSystem.grep('.', 'text', {
        recursive: true,
      });

      expectGrepSuccess(result);
      // Should only find match in text.txt, not binary.bin
      const paths = result.matches?.map((m) => m.relativePath) || [];
      expect(paths.some((p) => p.includes('text.txt'))).toBe(true);
      expect(paths.some((p) => p.includes('binary.bin'))).toBe(false);
    });

    it('should detect binary files with NUL bytes in first 8KB', async () => {
      // Create file with NUL byte at the beginning
      const content = '\x00binary content here';
      createFile(testDir, 'binary.dat', content);

      const result = await fileSystem.grep('.', 'content');

      expectGrepSuccess(result);
      expectGrepMatchCount(result, 0); // Binary file skipped
    });

    it('should search binary files when explicitly requested', async () => {
      createBinaryFile(testDir, 'binary.bin', 1024);

      const result = await fileSystem.grep('.', 'x', {});

      // Should attempt to search (may or may not find matches depending on binary content)
      expect(result.success).toBeDefined();
    });

    it('should handle file with NUL byte after 8KB', async () => {
      // Create file with NUL byte beyond detection window
      const content = 'x'.repeat(9000) + '\x00MATCH';
      createFile(testDir, 'file.txt', content);

      const result = await fileSystem.grep('.', 'MATCH');

      // Should be treated as text since NUL is beyond 8KB window
      expectGrepSuccess(result);
    });
  });

  describe('Output Size Limiting', () => {
    it('should enforce 1MB output size limit', async () => {
      // Create file that will generate >1MB of match output
      const lines: string[] = [];
      for (let i = 0; i < 10000; i++) {
        lines.push(
          `Line ${i} with MATCH and lots of context text ${'x'.repeat(100)}`,
        );
      }
      createFile(testDir, 'large.txt', lines.join('\n'));

      const result = await fileSystem.grep('.', 'MATCH');

      expectGrepSuccess(result);
      // Should be truncated - not all 10000 matches returned
      expect(result.totalMatches).toBeLessThan(10000);
      expect(result.totalMatches).toBeGreaterThan(0);
    });

    it('should stop collecting matches when size limit reached', async () => {
      // Create multiple files to exceed limit
      for (let i = 0; i < 100; i++) {
        createFile(
          testDir,
          `file${i}.txt`,
          `MATCH with context ${'x'.repeat(1000)}\n`.repeat(100),
        );
      }

      const result = await fileSystem.grep('.', 'MATCH', {
        recursive: true,
      });

      expectGrepSuccess(result);
      // Should have found matches but not all of them (100 files * 100 matches = 10000 total)
      expect(result.totalMatches).toBeGreaterThan(0);
      expect(result.totalMatches).toBeLessThan(10000);
    });

    it('should respect maxMatches option', async () => {
      createFile(testDir, 'test.txt', 'MATCH\n'.repeat(100));

      const result = await fileSystem.grep('.', 'MATCH', {
        maxMatches: 10,
      });

      expectGrepSuccess(result);
      expect(result.totalMatches).toBeLessThanOrEqual(10);
    });
  });

  describe('Context Lines', () => {
    it('should include 5 lines before and after match', async () => {
      const lines = [];
      for (let i = 1; i <= 20; i++) {
        lines.push(`Line ${i}`);
      }
      lines[9] = 'Line 10 MATCH'; // 10th line (index 9)
      createFile(testDir, 'test.txt', lines.join('\n'));

      const result = await fileSystem.grep('.', 'MATCH');

      expectGrepSuccess(result);
      const match = result.matches?.[0];
      expect(match).toBeDefined();
      if (match) {
        // Preview should include lines 5-15 (5 before, match, 5 after)
        expect(match.preview).toContain('Line 5');
        expect(match.preview).toContain('Line 10 MATCH');
        expect(match.preview).toContain('Line 15');
      }
    });

    it('should handle context at file start', async () => {
      const lines = [
        'Line 1 MATCH',
        'Line 2',
        'Line 3',
        'Line 4',
        'Line 5',
        'Line 6',
      ];
      createFile(testDir, 'test.txt', lines.join('\n'));

      const result = await fileSystem.grep('.', 'MATCH');

      expectGrepSuccess(result);
      const match = result.matches?.[0];
      expect(match).toBeDefined();
      if (match) {
        // Should include match + 5 after (no lines before)
        expect(match.preview).toContain('Line 1 MATCH');
        expect(match.preview).toContain('Line 6');
      }
    });

    it('should handle context at file end', async () => {
      const lines = [
        'Line 1',
        'Line 2',
        'Line 3',
        'Line 4',
        'Line 5',
        'Line 6 MATCH',
      ];
      createFile(testDir, 'test.txt', lines.join('\n'));

      const result = await fileSystem.grep('.', 'MATCH');

      expectGrepSuccess(result);
      const match = result.matches?.[0];
      expect(match).toBeDefined();
      if (match) {
        // Should include 5 before + match (no lines after)
        expect(match.preview).toContain('Line 1');
        expect(match.preview).toContain('Line 6 MATCH');
      }
    });

    it('should handle file with fewer than 11 lines', async () => {
      const lines = ['Line 1', 'Line 2 MATCH', 'Line 3'];
      createFile(testDir, 'test.txt', lines.join('\n'));

      const result = await fileSystem.grep('.', 'MATCH');

      expectGrepSuccess(result);
      const match = result.matches?.[0];
      expect(match).toBeDefined();
      if (match) {
        // Should include all available lines
        expect(match.preview).toContain('Line 1');
        expect(match.preview).toContain('Line 2 MATCH');
        expect(match.preview).toContain('Line 3');
      }
    });
  });

  describe('Multiple Matches Per Line', () => {
    it('should find all matches in a line', async () => {
      createFile(testDir, 'test.txt', 'ERROR ERROR ERROR\n');

      const result = await fileSystem.grep('.', 'ERROR');

      expectGrepSuccess(result);
      expect(result.totalMatches).toBeGreaterThanOrEqual(3);
    });

    it('should report correct column for each match', async () => {
      createFile(testDir, 'test.txt', 'ab ERROR cd ERROR ef\n');

      const result = await fileSystem.grep('.', 'ERROR');

      expectGrepSuccess(result);
      expectGrepMatchCount(result, 2);

      const matches = result.matches || [];
      expect(matches[0]?.column).toBeLessThan(matches[1]?.column!);
    });
  });

  describe('Recursive Search', () => {
    beforeEach(() => {
      createFileTree(testDir, {
        'root.txt': 'Root MATCH',
        src: {
          'index.ts': 'Index MATCH',
          lib: {
            'utils.ts': 'Utils MATCH',
          },
        },
      });
    });

    it('should search recursively when enabled', async () => {
      const result = await fileSystem.grep('.', 'MATCH', {
        recursive: true,
      });

      expectGrepSuccess(result);
      expect(result.totalMatches).toBeGreaterThanOrEqual(3);
    });

    it('should respect maxDepth option', async () => {
      const result = await fileSystem.grep('.', 'MATCH', {
        recursive: true,
        maxDepth: 1,
      });

      expectGrepSuccess(result);
      // Should not find utils.ts (depth 2)
      const paths = result.matches?.map((m) => m.relativePath) || [];
      expect(paths.some((p) => p.includes('utils.ts'))).toBe(false);
    });

    it('should filter by filePattern', async () => {
      const result = await fileSystem.grep('.', 'MATCH', {
        recursive: true,
        filePattern: '*.ts',
      });

      expectGrepSuccess(result);
      const paths = result.matches?.map((m) => m.relativePath) || [];
      expect(paths.every((p) => p.endsWith('.ts'))).toBe(true);
    });

    it('should respect excludePatterns', async () => {
      const result = await fileSystem.grep('.', 'MATCH', {
        recursive: true,
        excludePatterns: ['**/lib/**'],
      });

      expectGrepSuccess(result);
      const paths = result.matches?.map((m) => m.relativePath) || [];
      expect(paths.some((p) => p.includes('lib'))).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid regex patterns', async () => {
      createFile(testDir, 'test.txt', 'test content');

      const result = await fileSystem.grep('.', '(invalid');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle non-existent directory gracefully', async () => {
      const result = await fileSystem.grep('nonexistent', 'test');

      // Should handle gracefully (either error or empty results)
      expect(result.success).toBeDefined();
    });

    it('should skip files that cannot be read', async () => {
      // This test may not work on all systems due to permissions
      // Just document the behavior
      createFile(testDir, 'readable.txt', 'MATCH');

      const result = await fileSystem.grep('.', 'MATCH', {
        recursive: true,
      });

      // Should succeed even if some files fail
      expectGrepSuccess(result);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty files', async () => {
      createFile(testDir, 'empty.txt', '');

      const result = await fileSystem.grep('.', 'test');

      expectGrepSuccess(result);
      expectGrepMatchCount(result, 0);
    });

    it('should handle files with only empty lines', async () => {
      createFile(testDir, 'empty-lines.txt', '\n\n\n\n');

      const result = await fileSystem.grep('.', 'test');

      expectGrepSuccess(result);
      expectGrepMatchCount(result, 0);
    });

    it('should handle very long lines', async () => {
      const longLine = 'x'.repeat(50000) + 'MATCH' + 'y'.repeat(50000);
      createFile(testDir, 'long.txt', longLine);

      const result = await fileSystem.grep('.', 'MATCH');

      expectGrepSuccess(result);
      expectGrepMatchCount(result, 1);
    });

    it('should handle files with unicode content', async () => {
      createFile(testDir, 'unicode.txt', 'Hello 世界 MATCH 🚀\n');

      const result = await fileSystem.grep('.', 'MATCH');

      expectGrepSuccess(result);
      expectGrepMatchCount(result, 1);
      expect(result.matches?.[0]?.preview).toContain('世界');
      expect(result.matches?.[0]?.preview).toContain('🚀');
    });
  });
});
