import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ignore from 'ignore';
import { ALLOWED_EXTENSIONS } from './utils/allowed-extensions.js';

export interface FileInfo {
  absolutePath: string;
  relativePath: string;
  size: number;
  modifiedTime: Date;
  extension: string;
}

export interface ScanOptions {
  rootDir: string;
  respectGitignore?: boolean;
  maxFileSize?: number; // in bytes, default 10MB
}

export class FileScanner {
  private ig: ReturnType<typeof ignore>;
  private rootDir: string;
  private maxFileSize: number;

  constructor(options: ScanOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB default
    this.ig = ignore();

    if (options.respectGitignore !== false) {
      this.loadGitignore();
    }
  }

  private async loadGitignore(): Promise<void> {
    try {
      const gitignorePath = path.join(this.rootDir, '.gitignore');
      const content = await fs.readFile(gitignorePath, 'utf-8');
      this.ig.add(content);
      // Add common patterns
      this.ig.add([
        'node_modules/',
        '.git/',
        '.stagewise/',
        'dist/',
        'build/',
        '*.log',
        '.DS_Store',
        'coverage/',
        '.env*',
      ]);
    } catch {
      // No .gitignore file, use default patterns
      this.ig.add([
        'node_modules/',
        '.git/',
        '.stagewise/',
        'dist/',
        'build/',
        '*.log',
        '.DS_Store',
        'coverage/',
        '.env*',
      ]);
    }
  }

  private shouldIndexFile(
    filePath: string,
    stats: Awaited<ReturnType<typeof fs.stat>>,
  ): boolean {
    // Check file size
    if (stats.size > this.maxFileSize) {
      return false;
    }

    // Check if ignored
    const relativePath = path.relative(this.rootDir, filePath);
    if (this.ig.ignores(relativePath)) {
      return false;
    }

    // Check extension
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);

    // Check for exact filename matches (like package.json)
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

  async *scanDirectory(dir: string = this.rootDir): AsyncGenerator<FileInfo> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.rootDir, fullPath);

        // Skip if ignored
        if (this.ig.ignores(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          yield* this.scanDirectory(fullPath);
        } else if (entry.isFile()) {
          try {
            const stats = await fs.stat(fullPath);
            if (this.shouldIndexFile(fullPath, stats)) {
              yield {
                absolutePath: fullPath,
                relativePath,
                size: stats.size,
                modifiedTime: stats.mtime,
                extension: path.extname(fullPath).toLowerCase(),
              };
            }
          } catch (error) {
            // Skip files we can't stat
            console.warn(`Failed to stat file ${fullPath}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to scan directory ${dir}:`, error);
    }
  }

  async getAllFiles(): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    for await (const file of this.scanDirectory()) {
      files.push(file);
    }
    return files;
  }
}
