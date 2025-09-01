import {
  CodebaseIndexer,
  type IndexProgress,
  type IndexConfig,
} from './index-codebase.js';
import type { FileWatcher, FileChangeEvent } from './watcher.js';

export type { IndexProgress, IndexConfig, FileChangeEvent };

let indexerInstance: CodebaseIndexer | null = null;

/**
 * Indexes the codebase, only re-indexing files that have changed.
 * Returns an async iterator that yields progress updates.
 *
 * @param apiKey - Google AI API key for embeddings
 * @param options - Optional configuration
 * @returns Async iterator yielding IndexProgress
 *
 * @example
 * ```typescript
 * for await (const progress of indexCodebase(apiKey)) {
 *   console.log(`${progress.type}: ${progress.message}`);
 *   if (progress.type === 'error') {
 *     console.error(progress.error);
 *   }
 * }
 * ```
 */
export async function* indexCodebase(
  apiKey: string,
  options?: Omit<IndexConfig, 'apiKey'>,
): AsyncGenerator<IndexProgress> {
  // Create or reuse indexer instance
  if (!indexerInstance) {
    indexerInstance = new CodebaseIndexer({
      ...options,
      apiKey,
      rootDir: options?.rootDir || process.cwd(),
    });
  }

  // Run indexing
  yield* indexerInstance.indexCodebase();
}

/**
 * Creates a file watcher that automatically re-indexes changed files.
 *
 * @param apiKey - Google AI API key for embeddings
 * @param options - Optional configuration
 * @param onFileChange - Optional callback for file changes
 * @returns FileWatcher instance
 *
 * @example
 * ```typescript
 * const watcher = createWatcher(apiKey, {}, (event) => {
 *   console.log(`File ${event.type}: ${event.file.relativePath}`);
 * });
 *
 * // Later, to stop watching:
 * await watcher.stop();
 * ```
 */
export function createWatcher(
  apiKey: string,
  options?: Omit<IndexConfig, 'apiKey'>,
  onFileChange?: (event: FileChangeEvent) => void,
): FileWatcher {
  // Create or reuse indexer instance
  if (!indexerInstance) {
    indexerInstance = new CodebaseIndexer({
      ...options,
      apiKey,
      rootDir: options?.rootDir || process.cwd(),
    });
  }

  return indexerInstance.startWatcher(onFileChange);
}

/**
 * Stops the file watcher if it's running.
 */
export async function stopWatcher(): Promise<void> {
  if (indexerInstance) {
    await indexerInstance.stopWatcher();
  }
}

/**
 * Searches the indexed codebase for files similar to the query.
 *
 * @param apiKey - Google AI API key for embeddings
 * @param query - The search query string
 * @param options - Optional configuration
 * @returns Array of matching files sorted by similarity
 *
 * @example
 * ```typescript
 * const results = await searchCodebase(apiKey, "authentication logic", {
 *   limit: 5
 * });
 * results.forEach(r => {
 *   console.log(`${r.relativePath} (distance: ${r.distance})`);
 * });
 * ```
 */
export async function searchCodebase(
  apiKey: string,
  query: string,
  options?: {
    limit?: number;
    rootDir?: string;
    baseUrl?: string;
    headers?: Record<string, string>;
    dbPath?: string;
  },
): Promise<
  Array<{
    filePath: string;
    relativePath: string;
    content: string;
    distance: number;
    extension: string;
  }>
> {
  // Create or reuse indexer instance
  if (!indexerInstance) {
    indexerInstance = new CodebaseIndexer({
      apiKey,
      rootDir: options?.rootDir || process.cwd(),
      baseUrl: options?.baseUrl,
      headers: options?.headers,
      dbPath: options?.dbPath,
    });
  }

  return indexerInstance.searchCodebase(query, { limit: options?.limit });
}

/**
 * Cleans up all resources (database connections, file watchers, etc.)
 */
export async function cleanup(): Promise<void> {
  if (indexerInstance) {
    await indexerInstance.close();
    indexerInstance = null;
  }
}
