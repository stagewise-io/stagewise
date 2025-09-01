import chokidar from 'chokidar';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { ALLOWED_EXTENSIONS } from './utils/allowed-extensions.js';
import type { FileInfo } from './file-scanner.js';
import * as fs from 'node:fs/promises';

export interface WatcherConfig {
  rootDir: string;
  debounceMs?: number;
  ignoreInitial?: boolean;
}

export type FileChangeEvent = {
  type: 'add' | 'change' | 'unlink';
  file: FileInfo;
};

export class FileWatcher extends EventEmitter {
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private rootDir: string;
  private debounceMs: number;
  private changeQueue: Map<string, NodeJS.Timeout> = new Map();
  private ignoreInitial: boolean;

  constructor(config: WatcherConfig) {
    super();
    this.rootDir = path.resolve(config.rootDir);
    this.debounceMs = config.debounceMs || 500;
    this.ignoreInitial = config.ignoreInitial !== false;
  }

  private shouldWatch(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);

    // Check for exact filename matches
    if (ALLOWED_EXTENSIONS.has(basename)) {
      return true;
    }

    // Check for extension matches
    if (ext && ALLOWED_EXTENSIONS.has(ext)) {
      return true;
    }

    // Check for config files without extensions
    const configPatterns = [
      /^\.eslintrc$/,
      /^\.prettierrc$/,
      /^\.babelrc$/,
      /^\.stylelintrc$/,
      /^\.postcssrc$/,
      /^\.swcrc$/,
      /^\.browserslistrc$/,
    ];

    return configPatterns.some((pattern) => pattern.test(basename));
  }

  private async getFileInfo(filePath: string): Promise<FileInfo | null> {
    try {
      const stats = await fs.stat(filePath);
      return {
        absolutePath: filePath,
        relativePath: path.relative(this.rootDir, filePath),
        size: stats.size,
        modifiedTime: stats.mtime,
        extension: path.extname(filePath).toLowerCase(),
      };
    } catch {
      return null;
    }
  }

  private debounceChange(
    filePath: string,
    eventType: 'add' | 'change' | 'unlink',
  ): void {
    // Clear existing timeout for this file
    const existingTimeout = this.changeQueue.get(filePath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      this.changeQueue.delete(filePath);

      if (eventType === 'unlink') {
        // File was deleted
        const event: FileChangeEvent = {
          type: 'unlink',
          file: {
            absolutePath: filePath,
            relativePath: path.relative(this.rootDir, filePath),
            size: 0,
            modifiedTime: new Date(),
            extension: path.extname(filePath).toLowerCase(),
          },
        };
        this.emit('file-change', event);
      } else {
        // File was added or changed
        const fileInfo = await this.getFileInfo(filePath);
        if (fileInfo) {
          const event: FileChangeEvent = {
            type: eventType,
            file: fileInfo,
          };
          this.emit('file-change', event);
        }
      }
    }, this.debounceMs);

    this.changeQueue.set(filePath, timeout);
  }

  start(): void {
    if (this.watcher) {
      return; // Already watching
    }

    // Create glob patterns for all allowed extensions
    const patterns: string[] = [];

    // Add extension patterns
    for (const ext of ALLOWED_EXTENSIONS) {
      if (ext.startsWith('.')) {
        patterns.push(`**/*${ext}`);
      } else {
        // Exact filename match (like package.json)
        patterns.push(`**/${ext}`);
      }
    }

    // Add config file patterns
    patterns.push('**/.eslintrc');
    patterns.push('**/.prettierrc');
    patterns.push('**/.babelrc');
    patterns.push('**/.stylelintrc');
    patterns.push('**/.postcssrc');
    patterns.push('**/.swcrc');
    patterns.push('**/.browserslistrc');

    this.watcher = chokidar.watch(patterns, {
      cwd: this.rootDir,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.stagewise/**',
        '**/dist/**',
        '**/build/**',
        '**/*.log',
        '**/.DS_Store',
        '**/coverage/**',
        '**/.env*',
      ],
      persistent: true,
      ignoreInitial: this.ignoreInitial,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (relativePath: string) => {
        const absolutePath = path.join(this.rootDir, relativePath);
        if (this.shouldWatch(absolutePath)) {
          this.debounceChange(absolutePath, 'add');
        }
      })
      .on('change', (relativePath: string) => {
        const absolutePath = path.join(this.rootDir, relativePath);
        if (this.shouldWatch(absolutePath)) {
          this.debounceChange(absolutePath, 'change');
        }
      })
      .on('unlink', (relativePath: string) => {
        const absolutePath = path.join(this.rootDir, relativePath);
        if (this.shouldWatch(absolutePath)) {
          this.debounceChange(absolutePath, 'unlink');
        }
      })
      .on('error', (error: unknown) => {
        console.error('Watcher error:', error);
        this.emit('error', error);
      })
      .on('ready', () => {
        console.log('File watcher ready');
        this.emit('ready');
      });
  }

  async stop(): Promise<void> {
    // Clear all pending debounced changes
    for (const timeout of this.changeQueue.values()) {
      clearTimeout(timeout);
    }
    this.changeQueue.clear();

    // Close the watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }
}
