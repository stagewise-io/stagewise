import { dirname, resolve, join, relative, extname } from 'node:path';
import { grep } from './grep/index.js';
import { glob } from './glob/index.js';
import { promises as fs } from 'node:fs';
import { minimatch } from 'minimatch';
import ignore from 'ignore';
import chokidar from 'chokidar';
import {
  BaseFileSystemProvider,
  type ClientRuntime,
  type FileChangeEvent,
  type GrepResult,
  type GlobResult,
  type SearchReplaceMatch,
  type SearchReplaceResult,
} from '@stagewise/agent-runtime-interface';
import { BINARY_DETECTION } from './shared.js';

interface GitignoreInfo {
  ignore: ReturnType<typeof ignore>;
  directory: string;
  patterns: string[];
}

export class NodeFileSystemProvider extends BaseFileSystemProvider {
  private gitignoreMap: Map<string, GitignoreInfo> = new Map();
  private gitignoreInitialized = false;
  /** Hot-path cache: gitignore entries sorted by directory depth (deep → shallow) */
  private sortedGitignoreEntries: GitignoreInfo[] = [];

  getCurrentWorkingDirectory(): string {
    return this.config.workingDirectory;
  }

  setCurrentWorkingDirectory(dir: string) {
    this.config.workingDirectory = dir;
    // Changing CWD invalidates ignore caches
    this.gitignoreInitialized = false;
    this.gitignoreMap.clear();
    this.sortedGitignoreEntries = [];
  }

  async readFile(
    relativePath: string,
    options?: { startLine?: number; endLine?: number },
  ) {
    try {
      const fullPath = this.resolvePath(relativePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      if (options?.startLine !== undefined) {
        if (options.startLine > totalLines)
          return {
            success: false,
            message: `startLine ${options.startLine} exceeds file length (${totalLines} lines)`,
            error: 'LINE_OUT_OF_RANGE',
          };

        const requestedEndLine = options.endLine ?? totalLines;
        const effectiveEndLine = Math.min(requestedEndLine, totalLines);

        const selectedLines = lines.slice(
          options.startLine - 1,
          effectiveEndLine,
        );
        return {
          success: true,
          message: `Successfully read lines ${options.startLine}-${effectiveEndLine}`,
          content: selectedLines.join('\n'),
          totalLines,
        };
      }

      return {
        success: true,
        message: 'Successfully read file',
        content,
        totalLines,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to read file: ${relativePath}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async writeFile(relativePath: string, content: string) {
    try {
      const fullPath = this.resolvePath(relativePath);
      await this.createDirectory(dirname(fullPath));
      await fs.writeFile(fullPath, content, 'utf-8');
      return {
        success: true,
        message: `Successfully wrote file: ${relativePath}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to write file: ${relativePath}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async editFile(
    relativePath: string,
    content: string,
    startLine: number,
    endLine: number,
  ) {
    try {
      const fullPath = this.resolvePath(relativePath);
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      const lines = fileContent.split('\n');

      if (startLine > lines.length || endLine > lines.length)
        return {
          success: false,
          message: `Line range ${startLine}-${endLine} exceeds file length (${lines.length} lines)`,
          error: 'LINE_OUT_OF_RANGE',
        };

      if (startLine < 1 || endLine < startLine)
        return {
          success: false,
          message: `Invalid line range ${startLine}-${endLine}`,
          error: 'INVALID_RANGE',
        };

      const before = lines.slice(0, startLine - 1);
      const after = lines.slice(endLine);
      const contentLines = content.split('\n');
      await fs.writeFile(
        fullPath,
        [...before, ...contentLines, ...after].join('\n'),
        'utf-8',
      );

      return {
        success: true,
        message: `Successfully edited lines ${startLine}-${endLine}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to edit file: ${relativePath}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createDirectory(relativePath: string) {
    try {
      const fullPath = this.resolvePath(relativePath);
      await fs.mkdir(fullPath, { recursive: true });
      return {
        success: true,
        message: `Successfully created directory: ${relativePath}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create directory: ${relativePath}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async listDirectory(
    relativePath: string,
    options?: {
      recursive?: boolean;
      maxDepth?: number;
      pattern?: string;
      includeDirectories?: boolean;
      includeFiles?: boolean;
      respectGitignore?: boolean;
    },
  ) {
    try {
      const fullPath = this.resolvePath(relativePath);
      const files: Array<{
        relativePath: string;
        name: string;
        type: 'file' | 'directory';
        size?: number;
        depth: number;
      }> = [];
      let totalFiles = 0;
      let totalDirectories = 0;

      const listRecursive = async (dirPath: string, depth: number) => {
        if (options?.maxDepth !== undefined && depth > options.maxDepth) return;

        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const entryPath = join(dirPath, entry.name);
          const relativePathFromRoot = relative(fullPath, entryPath);

          if (
            options?.pattern &&
            !minimatch(relativePathFromRoot, options.pattern)
          )
            continue;

          if (
            options?.respectGitignore !== false &&
            this.isIgnoredSync(entryPath)
          )
            continue;

          if (entry.isDirectory()) {
            totalDirectories++;
            if (options?.includeDirectories !== false) {
              files.push({
                relativePath: relative(this.config.workingDirectory, entryPath),
                name: entry.name,
                type: 'directory',
                depth,
              });
            }
            if (options?.recursive) await listRecursive(entryPath, depth + 1);
          } else if (entry.isFile()) {
            totalFiles++;
            if (options?.includeFiles !== false) {
              const stat = await fs.stat(entryPath);
              files.push({
                relativePath: relative(this.config.workingDirectory, entryPath),
                name: entry.name,
                type: 'file',
                size: stat.size,
                depth,
              });
            }
          }
        }
      };

      await listRecursive(fullPath, 0);

      return {
        success: true,
        message: `Successfully listed directory: ${relativePath}`,
        files,
        totalFiles,
        totalDirectories,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to list directory: ${relativePath}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async grep(
    relativePath: string,
    pattern: string,
    options?: {
      recursive?: boolean;
      maxDepth?: number;
      maxMatches?: number;
      excludePatterns?: string[];
      respectGitignore?: boolean;
      caseSensitive?: boolean;
      filePattern?: string;
    },
  ): Promise<GrepResult> {
    return grep(
      this,
      relativePath,
      pattern,
      this.config.ripgrepBasePath,
      options,
    );
  }

  async glob(
    pattern: string,
    options?: {
      cwd?: string;
      absolute?: boolean;
      excludePatterns?: string[];
      respectGitignore?: boolean;
    },
  ): Promise<GlobResult> {
    return glob(this, pattern, this.config.ripgrepBasePath, options);
  }

  async searchAndReplace(
    relativePath: string,
    searchString: string,
    replaceString: string,
    options?: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      preserveCase?: boolean;
      maxReplacements?: number;
      dryRun?: boolean;
    },
  ): Promise<SearchReplaceResult> {
    try {
      const fullPath = this.resolvePath(relativePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      const replacements: SearchReplaceMatch[] = [];
      let totalReplacements = 0;
      const newLines: string[] = [];

      // Build the search pattern
      let searchPattern: RegExp;
      if (options?.regex) {
        searchPattern = new RegExp(
          searchString,
          options?.caseSensitive ? 'g' : 'gi',
        );
      } else {
        let pattern = searchString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex chars
        if (options?.wholeWord) {
          pattern = `\\b${pattern}\\b`;
        }
        searchPattern = new RegExp(
          pattern,
          options?.caseSensitive ? 'g' : 'gi',
        );
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        let modified = line;

        // Find all matches in current line
        let match: RegExpExecArray | null;
        const lineMatches: Array<{
          index: number;
          length: number;
          text: string;
        }> = [];
        searchPattern.lastIndex = 0;

        match = searchPattern.exec(line);
        while (match) {
          lineMatches.push({
            index: match.index,
            length: match[0].length,
            text: match[0],
          });
          if (
            options?.maxReplacements &&
            totalReplacements + lineMatches.length >= options.maxReplacements
          )
            break;
          match = searchPattern.exec(line);
        }

        // Process matches in reverse order to maintain indices
        for (let j = lineMatches.length - 1; j >= 0; j--) {
          const m = lineMatches[j];
          if (!m) continue;
          let replacement = replaceString;
          if (options?.preserveCase && !options?.regex)
            replacement = this.preserveCase(m.text, replacement);

          replacements.push({
            line: i + 1,
            column: m.index + 1,
            oldText: m.text,
            newText: replacement,
            lineContent: line.trim(),
          });

          modified =
            modified.slice(0, m.index) +
            replacement +
            modified.slice(m.index + m.length);
          totalReplacements++;
          if (
            options?.maxReplacements &&
            totalReplacements >= options.maxReplacements
          )
            break;
        }

        newLines.push(modified);

        if (
          options?.maxReplacements &&
          totalReplacements >= options?.maxReplacements
        ) {
          newLines.push(...lines.slice(i + 1));
          break;
        }
      }

      const fileModified = totalReplacements > 0 && !options?.dryRun;
      if (fileModified) {
        await fs.writeFile(fullPath, newLines.join('\n'), 'utf-8');
      }

      return {
        success: true,
        message: options?.dryRun
          ? `Found ${totalReplacements} occurrences (dry run - no changes made)`
          : `Replaced ${totalReplacements} occurrences`,
        replacements,
        totalReplacements,
        fileModified,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to search and replace: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private preserveCase(original: string, replacement: string): string {
    if (!original || !replacement) return replacement || '';
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original === original.toLowerCase()) return replacement.toLowerCase();
    const first = original.charAt(0);
    if (first && first === first.toUpperCase()) {
      return (
        replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase()
      );
    }
    return replacement;
  }

  async deleteFile(relativePath: string) {
    try {
      const fullPath = this.resolvePath(relativePath);
      await fs.unlink(fullPath);
      return {
        success: true,
        message: `Successfully deleted file: ${relativePath}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete file: ${relativePath}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async copyFile(source: string, destination: string) {
    try {
      const sourcePath = this.resolvePath(source);
      const destPath = this.resolvePath(destination);
      await this.createDirectory(dirname(destPath));
      await fs.copyFile(sourcePath, destPath);
      return {
        success: true,
        message: `Successfully copied ${source} to ${destination}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to copy file`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async moveFile(source: string, destination: string) {
    try {
      const sourcePath = this.resolvePath(source);
      const destPath = this.resolvePath(destination);
      await this.createDirectory(dirname(destPath));
      await fs.rename(sourcePath, destPath);
      return {
        success: true,
        message: `Successfully moved ${source} to ${destination}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to move file`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async fileExists(relativePath: string) {
    try {
      const fullPath = this.resolvePath(relativePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async isDirectory(relativePath: string) {
    try {
      const fullPath = this.resolvePath(relativePath);
      const stat = await fs.stat(fullPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async getFileStats(relativePath: string) {
    const fullPath = this.resolvePath(relativePath);
    const stat = await fs.stat(fullPath);
    return { size: stat.size, modifiedTime: stat.mtime };
  }

  // Path operations
  resolvePath(relativePath: string): string {
    if (resolve(relativePath) === relativePath) return relativePath;
    return resolve(this.config.workingDirectory, relativePath);
  }
  getDirectoryName(relativePath: string): string {
    return dirname(relativePath);
  }
  joinPaths(...relativePaths: string[]): string {
    return join(...relativePaths);
  }
  getRelativePath(from: string, to: string): string {
    return relative(from, to);
  }
  getFileExtension(relativePath: string): string {
    return extname(relativePath);
  }

  async getGitignorePatterns(): Promise<string[]> {
    await this.ensureGitignoreInitialized();
    const all: string[] = [];
    for (const info of this.gitignoreMap.values()) all.push(...info.patterns);
    return all;
  }

  async isIgnored(relativePath: string): Promise<boolean> {
    await this.ensureGitignoreInitialized();
    return this.isIgnoredSync(relativePath);
  }

  /**
   * Synchronous ignore check using a pre-sorted array (deepest → shallowest).
   */
  isIgnoredSync(relativePath: string): boolean {
    if (!relativePath) return false;

    if (
      relativePath.includes('*') ||
      relativePath.includes('?') ||
      relativePath.includes('[') ||
      relativePath.includes(']')
    ) {
      return false;
    }
    if (relativePath === '.' || relativePath === '..') return false;
    if (!this.gitignoreInitialized) return false;

    const absolutePath = this.resolvePath(relativePath);

    for (const gitignoreInfo of this.sortedGitignoreEntries) {
      if (absolutePath.startsWith(gitignoreInfo.directory)) {
        const rel = relative(gitignoreInfo.directory, absolutePath);
        if (rel === '') continue;
        if (gitignoreInfo.ignore.ignores(rel)) return true;
      }
    }
    return false;
  }

  async isBinary(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(relativePath);
      const fh = await fs.open(fullPath, 'r');
      try {
        const buf = Buffer.allocUnsafe(BINARY_DETECTION.CHECK_BUFFER_SIZE);
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
        if (bytesRead === 0) return false;
        return buf.subarray(0, bytesRead).includes(0x00);
      } finally {
        await fh.close();
      }
    } catch {
      return false;
    }
  }

  private async ensureGitignoreInitialized(): Promise<void> {
    if (this.gitignoreInitialized) return;

    const defaultIgnores = [
      '.git',
      'node_modules',
      'dist',
      'build',
      '.next',
      'out',
      'coverage',
      '.cache',
      '.turbo',
      '.vscode',
      '.idea',
      '*.log',
      '.DS_Store',
      'Thumbs.db',
    ];

    await this.findAndLoadGitignoreFiles(
      this.config.workingDirectory,
      defaultIgnores,
    );

    if (this.gitignoreMap.size === 0) {
      const rootIgnore = ignore().add(defaultIgnores);
      this.gitignoreMap.set(this.config.workingDirectory, {
        ignore: rootIgnore,
        directory: this.config.workingDirectory,
        patterns: defaultIgnores,
      });
    }

    // Precompute a sorted array for hot-path lookups
    this.sortedGitignoreEntries = Array.from(this.gitignoreMap.values()).sort(
      (a, b) => b.directory.length - a.directory.length,
    );

    this.gitignoreInitialized = true;
  }

  private async findAndLoadGitignoreFiles(
    directory: string,
    defaultIgnores: string[],
    depth = 0,
    maxDepth = 50,
  ): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const gitignorePath = join(directory, '.gitignore');
      let patterns: string[] = [];
      let hasGitignore = false;

      try {
        const content = await fs.readFile(gitignorePath, 'utf-8');
        const filePatterns = content
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'));
        patterns = filePatterns;
        hasGitignore = true;
      } catch {
        // no .gitignore here
      }

      if (hasGitignore || directory === this.config.workingDirectory) {
        const allPatterns = [...patterns];
        if (directory === this.config.workingDirectory)
          allPatterns.push(...defaultIgnores);
        if (allPatterns.length > 0) {
          const ignoreInstance = ignore().add(allPatterns);
          this.gitignoreMap.set(directory, {
            ignore: ignoreInstance,
            directory,
            patterns: allPatterns,
          });
        }
      }

      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subdir = join(directory, entry.name);
          if (
            defaultIgnores.includes(entry.name) ||
            entry.name === '.git' ||
            entry.name === 'node_modules'
          ) {
            continue;
          }
          const shouldSkip = await this.isDirectoryIgnoredByParent(
            subdir,
            directory,
          );
          if (!shouldSkip) {
            await this.findAndLoadGitignoreFiles(
              subdir,
              defaultIgnores,
              depth + 1,
              maxDepth,
            );
          }
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }

  private async isDirectoryIgnoredByParent(
    dirPath: string,
    parentDir: string,
  ): Promise<boolean> {
    for (const [gitDir, gitInfo] of this.gitignoreMap.entries()) {
      if (gitDir === parentDir || dirPath.startsWith(gitDir)) {
        const rel = relative(gitDir, dirPath);
        if (gitInfo.ignore.ignores(rel)) return true;
      }
    }
    return false;
  }

  async watchFiles(
    relativePath: string,
    onFileChange: (event: FileChangeEvent) => void,
  ): Promise<() => Promise<void>> {
    await this.ensureGitignoreInitialized();

    const watcher = chokidar.watch(this.resolvePath(relativePath), {
      persistent: true,
      ignored: (path: string) => this.isIgnoredSync(path),
    });

    watcher.on('add', (path) => {
      onFileChange({
        type: 'create',
        file: {
          absolutePath: path,
          relativePath: relative(this.config.workingDirectory, path),
        },
      });
    });
    watcher.on('change', (path) => {
      onFileChange({
        type: 'update',
        file: {
          absolutePath: path,
          relativePath: relative(this.config.workingDirectory, path),
        },
      });
    });
    watcher.on('unlink', (path) => {
      onFileChange({
        type: 'delete',
        file: {
          absolutePath: path,
          relativePath: relative(this.config.workingDirectory, path),
        },
      });
    });

    return watcher.close;
  }
}

export interface ClientRuntimeNodeConfig {
  workingDirectory: string;
  ripgrepBasePath: string;
}

export class ClientRuntimeNode implements ClientRuntime {
  public fileSystem: BaseFileSystemProvider;

  constructor(config: ClientRuntimeNodeConfig) {
    this.fileSystem = new NodeFileSystemProvider({
      workingDirectory: config.workingDirectory,
      ripgrepBasePath: config.ripgrepBasePath,
    });
  }

  updateWorkingDirectory = (dir: string) =>
    this.fileSystem.setCurrentWorkingDirectory(dir);
}

// Re-export ripgrep installation utilities
export { ensureRipgrepInstalled } from './vscode-ripgrep/ensure-ripgrep.js';
export type {
  EnsureRipgrepResult,
  EnsureRipgrepOptions,
} from './vscode-ripgrep/ensure-ripgrep.js';
export { getRipgrepPath, getRipgrepBinDir } from './vscode-ripgrep/get-path.js';
