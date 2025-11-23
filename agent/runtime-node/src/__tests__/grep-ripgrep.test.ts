import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { NodeFileSystemProvider } from '../index.js';
import { grepWithRipgrep } from '../grep/grep-ripgrep.js';
import { ensureRipgrepInstalled } from '../vscode-ripgrep/ensure-ripgrep.js';
import { createTempDir, createFile } from './utils/test-fixtures.js';
import { cleanupTestDir, createCleanupHandler } from './utils/cleanup.js';
import { runGrepTestSuite } from './shared/grep-test-suite.js';

describe('grep with ripgrep', () => {
  const cleanupHandler = createCleanupHandler();
  let rgBinaryBasePath: string;
  let testDir: string;
  let fileSystem: NodeFileSystemProvider;

  beforeAll(async () => {
    // Download ripgrep ONCE to temp directory
    rgBinaryBasePath = createTempDir('ripgrep-install-');

    const result = await ensureRipgrepInstalled({
      rgBinaryBasePath,
      onLog: (msg) => console.log(`[ripgrep-install] ${msg}`),
    });

    expect(result.success).toBe(true);
    expect(result.rgPath).toBeDefined();

    if (!result.success) {
      throw new Error(
        `Failed to install ripgrep: ${result.error || 'Unknown error'}`,
      );
    }
  }, 60000); // 60 second timeout for download

  beforeEach(() => {
    testDir = createTempDir('grep-test-');
    cleanupHandler.register(testDir);
    fileSystem = new NodeFileSystemProvider({
      workingDirectory: testDir,
      rgBinaryBasePath, // Use the downloaded ripgrep binary
    });
  });

  afterEach(() => {
    cleanupHandler.cleanup();
  });

  afterAll(() => {
    cleanupTestDir(rgBinaryBasePath);
  });

  it('should verify ripgrep binary is available and returns results', async () => {
    // First test: verify grepWithRipgrep returns NOT NULL
    createFile(testDir, 'test.txt', 'test content with MATCH');

    const result = await grepWithRipgrep(
      fileSystem,
      'MATCH',
      rgBinaryBasePath,
    );

    // Ripgrep should be available and return a valid result
    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
    expect(result?.totalMatches).toBeGreaterThan(0);
  });

  // Run all shared grep tests with ripgrep
  runGrepTestSuite(
    () => fileSystem,
    () => testDir,
  );
});
