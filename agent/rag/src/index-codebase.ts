import { FileScanner } from './file-scanner.js';
import { EmbeddingGenerator } from './embeddings.js';
import { DatabaseManager } from './database.js';
import { FileWatcher, type FileChangeEvent } from './watcher.js';
import * as path from 'node:path';

export type IndexProgressType =
  | 'scanning'
  | 'embedding'
  | 'storing'
  | 'complete'
  | 'error';

export interface IndexProgress {
  type: IndexProgressType;
  current: number;
  total: number;
  currentFile?: string;
  message: string;
  error?: Error;
}

export interface IndexConfig {
  rootDir: string;
  apiKey: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  dbPath?: string;
  respectGitignore?: boolean;
  maxFileSize?: number;
  batchSize?: number;
}

export class CodebaseIndexer {
  private scanner: FileScanner;
  private embedder: EmbeddingGenerator;
  private database: DatabaseManager;
  private watcher: FileWatcher | null = null;
  private config: IndexConfig;
  private isIndexing = false;

  constructor(config: IndexConfig) {
    this.config = {
      rootDir: config.rootDir || process.cwd(),
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      headers: config.headers || {},
      dbPath:
        config.dbPath || path.join(process.cwd(), '.stagewise', 'index-db'),
      respectGitignore: config.respectGitignore !== false,
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024,
      batchSize: config.batchSize || 10,
    };

    this.scanner = new FileScanner({
      rootDir: this.config.rootDir,
      respectGitignore: this.config.respectGitignore,
      maxFileSize: this.config.maxFileSize,
    });

    this.embedder = new EmbeddingGenerator({
      apiKey: this.config.apiKey,
      batchSize: this.config.batchSize,
      baseUrl: this.config.baseUrl,
      headers: this.config.headers,
    });

    this.database = new DatabaseManager({
      dbPath: this.config.dbPath,
    });
  }

  async *indexCodebase(): AsyncGenerator<IndexProgress> {
    if (this.isIndexing) {
      yield {
        type: 'error',
        current: 0,
        total: 0,
        message: 'Indexing already in progress',
        error: new Error('Indexing already in progress'),
      };
      return;
    }

    this.isIndexing = true;

    try {
      // Connect to database
      yield {
        type: 'scanning',
        current: 0,
        total: 0,
        message: 'Connecting to database...',
      };
      await this.database.connect();
      await this.database.createOrUpdateTable();

      // Scan for files
      yield {
        type: 'scanning',
        current: 0,
        total: 0,
        message: 'Scanning for files...',
      };

      const allFiles = await this.scanner.getAllFiles();
      const totalFiles = allFiles.length;

      yield {
        type: 'scanning',
        current: totalFiles,
        total: totalFiles,
        message: `Found ${totalFiles} files to index`,
      };

      // Check which files need updating
      const changedFiles = await this.database.getChangedFiles(allFiles);
      const filesToIndex = changedFiles.length;

      if (filesToIndex === 0) {
        yield {
          type: 'complete',
          current: totalFiles,
          total: totalFiles,
          message: 'All files are up to date',
        };
        return;
      }

      yield {
        type: 'embedding',
        current: 0,
        total: filesToIndex,
        message: `Processing ${filesToIndex} changed files...`,
      };

      // Generate embeddings and store them
      let processed = 0;
      const filePaths = changedFiles.map((f) => f.absolutePath);

      for await (const embedding of this.embedder.generateFileEmbeddings(
        filePaths,
      )) {
        processed++;

        // Find the corresponding file info
        const fileInfo = changedFiles.find(
          (f) => f.absolutePath === embedding.filePath,
        );
        if (!fileInfo) continue;

        // Store in database
        yield {
          type: 'storing',
          current: processed,
          total: filesToIndex,
          currentFile: fileInfo.relativePath,
          message: `Storing ${fileInfo.relativePath}`,
        };

        await this.database.upsertFileRecord(fileInfo, embedding);

        yield {
          type: 'embedding',
          current: processed,
          total: filesToIndex,
          currentFile: fileInfo.relativePath,
          message: `Processed ${processed}/${filesToIndex} files`,
        };
      }

      // Get final stats
      const stats = await this.database.getTableStats();

      yield {
        type: 'complete',
        current: filesToIndex,
        total: filesToIndex,
        message: `Indexing complete! Indexed ${filesToIndex} files. Total: ${stats.totalFiles} files`,
      };
    } catch (error) {
      yield {
        type: 'error',
        current: 0,
        total: 0,
        message: `Indexing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      this.isIndexing = false;
    }
  }

  async *reindexFile(filePath: string): AsyncGenerator<IndexProgress> {
    if (this.isIndexing) {
      yield {
        type: 'error',
        current: 0,
        total: 0,
        message: 'Indexing already in progress',
        error: new Error('Indexing already in progress'),
      };
      return;
    }

    this.isIndexing = true;

    try {
      yield {
        type: 'embedding',
        current: 0,
        total: 1,
        currentFile: filePath,
        message: `Processing ${path.basename(filePath)}...`,
      };

      // Generate embedding
      const embedding = await this.embedder.generateSingleEmbedding(filePath);

      // Get file info
      const fs = await import('node:fs/promises');
      const stats = await fs.stat(filePath);
      const fileInfo = {
        absolutePath: filePath,
        relativePath: path.relative(this.config.rootDir, filePath),
        size: stats.size,
        modifiedTime: stats.mtime,
        extension: path.extname(filePath).toLowerCase(),
      };

      // Store in database
      yield {
        type: 'storing',
        current: 1,
        total: 1,
        currentFile: fileInfo.relativePath,
        message: `Storing ${fileInfo.relativePath}`,
      };

      await this.database.upsertFileRecord(fileInfo, embedding);

      yield {
        type: 'complete',
        current: 1,
        total: 1,
        message: `Successfully indexed ${fileInfo.relativePath}`,
      };
    } catch (error) {
      yield {
        type: 'error',
        current: 0,
        total: 0,
        message: `Failed to index file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      this.isIndexing = false;
    }
  }

  startWatcher(onFileChange?: (event: FileChangeEvent) => void): FileWatcher {
    if (this.watcher?.isWatching()) {
      return this.watcher;
    }

    this.watcher = new FileWatcher({
      rootDir: this.config.rootDir,
      debounceMs: 1000,
      ignoreInitial: true,
    });

    this.watcher.on('file-change', async (event: FileChangeEvent) => {
      console.log(`File ${event.type}: ${event.file.relativePath}`);

      // Call the callback if provided
      if (onFileChange) {
        onFileChange(event);
      }

      // Handle the change
      if (event.type === 'unlink') {
        // File was deleted, remove from database
        try {
          await this.database.deleteFileRecord(event.file.absolutePath);
          console.log(`Removed ${event.file.relativePath} from index`);
        } catch (error) {
          console.error(
            `Failed to remove ${event.file.relativePath} from index:`,
            error,
          );
        }
      } else {
        // File was added or changed, re-index it
        try {
          const generator = this.reindexFile(event.file.absolutePath);
          for await (const progress of generator) {
            if (progress.type === 'error') {
              console.error(progress.message);
            }
          }
        } catch (error) {
          console.error(`Failed to index ${event.file.relativePath}:`, error);
        }
      }
    });

    this.watcher.start();
    return this.watcher;
  }

  async stopWatcher(): Promise<void> {
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }
  }

  async searchCodebase(
    query: string,
    options?: { limit?: number },
  ): Promise<
    Array<{
      filePath: string;
      relativePath: string;
      content: string;
      distance: number;
      extension: string;
    }>
  > {
    try {
      // Ensure database is connected
      if (!this.database) {
        throw new Error('Database not initialized');
      }

      // Connect if not already connected
      await this.database.connect();

      // Generate embedding for the query
      const queryEmbedding = await this.embedder.generateEmbedding(query);

      // Search for similar files
      const results = await this.database.searchSimilarFiles(
        queryEmbedding,
        options?.limit || 10,
      );

      // Return formatted results
      return results.map((r) => ({
        filePath: r.filePath,
        relativePath: r.relativePath,
        content: r.content,
        distance: r.distance,
        extension: r.extension,
      }));
    } catch (error) {
      console.error('Failed to search codebase:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.stopWatcher();
    await this.database.close();
  }
}
