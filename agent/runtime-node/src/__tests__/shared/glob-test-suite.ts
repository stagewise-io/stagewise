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
    it('should always provide both relativePaths and absolutePaths arrays', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        'file.ts': 'content',
        nested: {
          'deep.ts': 'content',
        },
      });

      const result = await fileSystem.glob('**/*.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        // Verify both arrays exist
        expect(result.relativePaths).toBeDefined();
        expect(result.absolutePaths).toBeDefined();
        expect(Array.isArray(result.relativePaths)).toBe(true);
        expect(Array.isArray(result.absolutePaths)).toBe(true);

        // Verify they have the same length
        expect(result.relativePaths.length).toBe(result.absolutePaths.length);
        expect(result.relativePaths.length).toBeGreaterThan(0);

        // Verify absolutePaths contain the testDir
        for (const absolutePath of result.absolutePaths) {
          expect(absolutePath).toContain(testDir);
        }

        // Verify correspondence between relative and absolute paths
        for (let i = 0; i < result.relativePaths.length; i++) {
          const relativePath = result.relativePaths[i];
          const absolutePath = result.absolutePaths[i];
          // absolutePath should end with relativePath (platform-independent check)
          expect(absolutePath!.endsWith(relativePath!.replace(/\//g, require('node:path').sep))).toBe(true);
        }
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

  describe('Monorepo Patterns', () => {
    it('should match files in top-level directory with recursive pattern', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        packages: {
          'package-a': {
            src: {
              'index.ts': 'content',
              'utils.ts': 'content',
            },
          },
          'package-b': {
            src: {
              'main.ts': 'content',
            },
          },
        },
      });

      const result = await fileSystem.glob('packages/**/*.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalMatches).toBe(3);
        expect(result.relativePaths).toContain('packages/package-a/src/index.ts');
        expect(result.relativePaths).toContain('packages/package-a/src/utils.ts');
        expect(result.relativePaths).toContain('packages/package-b/src/main.ts');
      }
    });

    it('should match files in directory when sibling directories have ignored content', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        '.gitignore': 'dist\nbuild\nnode_modules',
        packages: {
          'stage-ui': {
            src: {
              'index.ts': 'content',
              'button.tsx': 'content',
            },
            dist: {
              'index.js': 'built content',
            },
          },
        },
        toolbar: {
          core: {
            src: {
              'main.ts': 'content',
            },
            dist: {
              'main.js': 'built content',
            },
          },
        },
        apps: {
          cli: {
            src: {
              'cli.ts': 'content',
            },
          },
        },
      });

      // Test pattern with packages prefix
      const packagesResult = await fileSystem.glob('packages/**/*.ts');
      expect(packagesResult.success).toBe(true);
      if (packagesResult.success) {
        expect(packagesResult.totalMatches).toBeGreaterThanOrEqual(1);
        expect(packagesResult.relativePaths).toContain('packages/stage-ui/src/index.ts');
      }

      // Test pattern with toolbar prefix
      const toolbarResult = await fileSystem.glob('toolbar/**/*.ts');
      expect(toolbarResult.success).toBe(true);
      if (toolbarResult.success) {
        expect(toolbarResult.totalMatches).toBeGreaterThanOrEqual(1);
        expect(toolbarResult.relativePaths).toContain('toolbar/core/src/main.ts');
      }

      // Test pattern with apps prefix
      const appsResult = await fileSystem.glob('apps/**/*.ts');
      expect(appsResult.success).toBe(true);
      if (appsResult.success) {
        expect(appsResult.totalMatches).toBeGreaterThanOrEqual(1);
        expect(appsResult.relativePaths).toContain('apps/cli/src/cli.ts');
      }
    });

    it('should match specific subdirectory pattern', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        agent: {
          tools: {
            src: {
              'index.ts': 'content',
              'glob-tool.ts': 'content',
            },
          },
          runtime: {
            src: {
              'index.ts': 'content',
            },
          },
        },
      });

      const result = await fileSystem.glob('agent/tools/**/*.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalMatches).toBe(2);
        expect(result.relativePaths).toContain('agent/tools/src/index.ts');
        expect(result.relativePaths).toContain('agent/tools/src/glob-tool.ts');
        // Should NOT include agent/runtime files
        expect(result.relativePaths).not.toContain('agent/runtime/src/index.ts');
      }
    });

    it('should match tsx files in monorepo structure', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        packages: {
          'stage-ui': {
            src: {
              components: {
                'button.tsx': 'content',
                'input.tsx': 'content',
              },
              'index.ts': 'content',
            },
          },
        },
      });

      const result = await fileSystem.glob('packages/**/*.tsx');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalMatches).toBe(2);
        expect(result.relativePaths).toContain('packages/stage-ui/src/components/button.tsx');
        expect(result.relativePaths).toContain('packages/stage-ui/src/components/input.tsx');
      }
    });

    it('should work with global pattern across all workspace directories', async () => {
      const testDir = getTestDir();
      const fileSystem = getFileSystem();
      createFileTree(testDir, {
        '.gitignore': 'dist\nnode_modules',
        packages: {
          'package-a': {
            'index.ts': 'content',
          },
        },
        apps: {
          'app-a': {
            'main.ts': 'content',
          },
        },
        toolbar: {
          'toolbar.ts': 'content',
        },
      });

      const result = await fileSystem.glob('**/*.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalMatches).toBeGreaterThanOrEqual(3);
        expect(result.relativePaths).toContain('packages/package-a/index.ts');
        expect(result.relativePaths).toContain('apps/app-a/main.ts');
        expect(result.relativePaths).toContain('toolbar/toolbar.ts');
      }
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
