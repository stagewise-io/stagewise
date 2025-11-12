import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeFileSystemProvider } from '../index.js';
import { globWithRipgrep } from '../glob/glob-ripgrep.js';
import { createTempDir, createFile } from './utils/test-fixtures.js';
import { createCleanupHandler } from './utils/cleanup.js';
import { runGlobTestSuite } from './shared/glob-test-suite.js';

describe('glob with Node.js fallback', () => {
  const cleanupHandler = createCleanupHandler();
  let testDir: string;
  let fileSystem: NodeFileSystemProvider;

  beforeEach(() => {
    testDir = createTempDir('glob-fallback-test-');
    cleanupHandler.register(testDir);
    // Use testDir as ripgrepBasePath - ripgrep binary won't exist there
    // This forces fallback to Node.js implementation
    fileSystem = new NodeFileSystemProvider({
      workingDirectory: testDir,
      ripgrepBasePath: testDir, // Invalid path - no binary here!
    });
  });

  afterEach(() => {
    cleanupHandler.cleanup();
  });

  it('should verify ripgrep binary is NOT available and returns null', async () => {
    // First test: verify globWithRipgrep returns NULL
    // This confirms the Node.js fallback will be used
    createFile(testDir, 'test.ts', 'content');
    createFile(testDir, 'test.js', 'content');

    const result = await globWithRipgrep(
      fileSystem,
      '*.ts',
      testDir, // Invalid path - ripgrep binary doesn't exist here
    );

    // Should return null since ripgrep is not available
    expect(result).toBeNull();
  });

  // Run all shared glob tests with Node.js fallback
  // The fileSystem.glob() method will detect that globWithRipgrep returns null
  // and automatically fall back to Node.js implementation
  runGlobTestSuite(
    () => fileSystem,
    () => testDir,
  );
});
