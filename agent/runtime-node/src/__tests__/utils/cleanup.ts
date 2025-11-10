import * as fs from 'node:fs';

/**
 * Cleans up a test directory and all its contents
 */
export function cleanupTestDir(dir: string): void {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup test directory ${dir}:`, error);
    }
  }
}

/**
 * Creates a cleanup handler that can be registered with afterEach
 */
export function createCleanupHandler(): {
  register: (dir: string) => void;
  cleanup: () => void;
} {
  const dirs: string[] = [];

  return {
    register: (dir: string) => {
      dirs.push(dir);
    },
    cleanup: () => {
      for (const dir of dirs) {
        cleanupTestDir(dir);
      }
      dirs.length = 0; // Clear the array
    },
  };
}
