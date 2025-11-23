import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeFileSystemProvider } from '../index.js';
import { grepWithRipgrep } from '../grep/grep-ripgrep.js';
import { createTempDir, createFile } from './utils/test-fixtures.js';
import { createCleanupHandler } from './utils/cleanup.js';
import { runGrepTestSuite } from './shared/grep-test-suite.js';

describe('grep with Node.js fallback', () => {
  const cleanupHandler = createCleanupHandler();
  let testDir: string;
  let fileSystem: NodeFileSystemProvider;

  beforeEach(() => {
    testDir = createTempDir('grep-fallback-test-');
    cleanupHandler.register(testDir);
    // Use testDir as rgBinaryBasePath - ripgrep binary won't exist there
    // This forces fallback to Node.js implementation
    fileSystem = new NodeFileSystemProvider({
      workingDirectory: testDir,
      rgBinaryBasePath: testDir, // Invalid path - no binary here!
    });
  });

  afterEach(() => {
    cleanupHandler.cleanup();
  });

  it('should verify ripgrep binary is NOT available and returns null', async () => {
    // First test: verify grepWithRipgrep returns NULL
    // This confirms the Node.js fallback will be used
    createFile(testDir, 'test.txt', 'test content with MATCH');

    const result = await grepWithRipgrep(
      fileSystem,
      'MATCH',
      testDir, // Invalid path - ripgrep binary doesn't exist here
    );

    // Should return null since ripgrep is not available
    expect(result).toBeNull();
  });

  // Run all shared grep tests with Node.js fallback
  // The fileSystem.grep() method will detect that grepWithRipgrep returns null
  // and automatically fall back to Node.js implementation
  runGrepTestSuite(
    () => fileSystem,
    () => testDir,
  );
});
