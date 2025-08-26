import { Volume } from 'memfs';
import type { DirectoryJSON } from 'memfs';
import {
  BaseFileSystemProvider,
  type FileSystemProviderConfig,
  type FileOperationResult,
  type FileContentResult,
  type DirectoryListResult,
  type DirectoryEntry,
  type GrepResult,
  type GrepMatch,
  type GlobResult,
  type SearchReplaceResult,
  type SearchReplaceMatch,
} from '@stagewise/agent-runtime-interface';

export interface MockFileSystemConfig extends FileSystemProviderConfig {
  /**
   * Initial file structure to create using memfs DirectoryJSON format
   * Key: file path (relative to working directory)
   * Value: file content (string for files, null for empty directories)
   */
  initialFiles?: DirectoryJSON;
  /**
   * Gitignore patterns to simulate
   */
  gitignorePatterns?: string[];
}

/**
 * Mock file system provider using memfs for testing
 * Implements all IFileSystemProvider methods for comprehensive testing
 */
export class MockFileSystemProvider extends BaseFileSystemProvider {
  private volume: Volume;
  private gitignorePatterns: string[] = [];

  constructor(config: MockFileSystemConfig = { workingDirectory: '/test' }) {
    super(config);
    this.gitignorePatterns = config.gitignorePatterns || [];

    // Initialize volume with files using memfs's native fromJSON method
    if (config.initialFiles) {
      this.volume = Volume.fromJSON(
        config.initialFiles,
        this.config.workingDirectory,
      );
    } else {
      this.volume = new Volume();
      // Create working directory if no initial files provided
      this.volume.mkdirSync(this.config.workingDirectory, { recursive: true });
    }
  }

  // File operations
  async readFile(
    path: string,
    options?: { startLine?: number; endLine?: number },
  ): Promise<FileContentResult> {
    try {
      const fullPath = this.resolvePath(path);
      const content = this.volume.readFileSync(fullPath, 'utf8') as string;
      const lines = content.split('\n');

      let resultContent = content;
      if (options?.startLine !== undefined || options?.endLine !== undefined) {
        const startLine = Math.max(0, (options.startLine || 1) - 1);
        const endLine = options.endLine
          ? Math.min(lines.length, options.endLine)
          : lines.length;
        resultContent = lines.slice(startLine, endLine).join('\n');
      }

      return {
        success: true,
        message: 'File read successfully',
        content: resultContent,
        totalLines: lines.length,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to read file',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async writeFile(path: string, content: string): Promise<FileOperationResult> {
    try {
      const fullPath = this.resolvePath(path);
      const dirPath = this.getDirectoryName(fullPath);

      // Ensure parent directory exists
      this.volume.mkdirSync(dirPath, { recursive: true });
      this.volume.writeFileSync(fullPath, content, { encoding: 'utf8' });

      return {
        success: true,
        message: 'File written successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to write file',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async editFile(
    path: string,
    content: string,
    startLine: number,
    endLine: number,
  ): Promise<FileOperationResult> {
    try {
      const readResult = await this.readFile(path);
      if (!readResult.success || !readResult.content) {
        return {
          success: false,
          message: 'Failed to read file for editing',
          error: readResult.error,
        };
      }

      const lines = readResult.content.split('\n');
      const newLines = content.split('\n');

      // Replace lines (1-based to 0-based conversion)
      const start = Math.max(0, startLine - 1);
      const end = Math.min(lines.length, endLine);

      lines.splice(start, end - start, ...newLines);

      return await this.writeFile(path, lines.join('\n'));
    } catch (error) {
      return {
        success: false,
        message: 'Failed to edit file',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Directory operations
  async createDirectory(path: string): Promise<FileOperationResult> {
    try {
      const fullPath = this.resolvePath(path);
      this.volume.mkdirSync(fullPath, { recursive: true });

      return {
        success: true,
        message: 'Directory created successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create directory',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async listDirectory(
    path: string,
    options: {
      recursive?: boolean;
      maxDepth?: number;
      pattern?: string;
      includeDirectories?: boolean;
      includeFiles?: boolean;
      respectGitignore?: boolean;
    } = {},
  ): Promise<DirectoryListResult> {
    try {
      const fullPath = this.resolvePath(path);
      const entries: DirectoryEntry[] = [];

      const {
        recursive = false,
        maxDepth = Number.POSITIVE_INFINITY,
        pattern,
        includeDirectories = true,
        includeFiles = true,
        respectGitignore = true,
      } = options;

      const traverseDirectory = (
        dirPath: string,
        currentDepth: number,
      ): void => {
        if (currentDepth > maxDepth) return;

        try {
          const items = this.volume.readdirSync(dirPath) as string[];

          for (const item of items) {
            const itemPath = this.joinPaths(dirPath, item);
            const relativePath = this.getRelativePath(
              this.config.workingDirectory,
              itemPath,
            );
            const stats = this.volume.statSync(itemPath);
            const isDirectory = stats.isDirectory();

            // Check gitignore patterns
            if (respectGitignore && this.shouldIgnorePattern(relativePath)) {
              continue;
            }

            // Check pattern matching
            if (pattern && !this.matchesPattern(item, pattern)) {
              continue;
            }

            // Check inclusion options
            if (isDirectory && !includeDirectories) {
              if (recursive) {
                traverseDirectory(itemPath, currentDepth + 1);
              }
              continue;
            }

            if (!isDirectory && !includeFiles) {
              continue;
            }

            entries.push({
              path: relativePath,
              name: item,
              type: isDirectory ? 'directory' : 'file',
              size: isDirectory ? undefined : stats.size,
              depth: currentDepth,
            });

            // Recurse into directories
            if (recursive && isDirectory) {
              traverseDirectory(itemPath, currentDepth + 1);
            }
          }
        } catch (_error) {
          // Skip directories that can't be read
        }
      };

      traverseDirectory(fullPath, 0);

      const totalFiles = entries.filter((e) => e.type === 'file').length;
      const totalDirectories = entries.filter(
        (e) => e.type === 'directory',
      ).length;

      return {
        success: true,
        message: 'Directory listing completed',
        files: entries,
        totalFiles,
        totalDirectories,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to list directory',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Search operations
  async grep(
    path: string,
    pattern: string,
    options: {
      recursive?: boolean;
      maxDepth?: number;
      filePattern?: string;
      caseSensitive?: boolean;
      maxMatches?: number;
      excludePatterns?: string[];
      respectGitignore?: boolean;
    } = {},
  ): Promise<GrepResult> {
    try {
      const {
        recursive = true,
        maxDepth = Number.POSITIVE_INFINITY,
        filePattern,
        caseSensitive = true,
        maxMatches = Number.POSITIVE_INFINITY,
        excludePatterns = [],
        respectGitignore = true,
      } = options;

      const matches: GrepMatch[] = [];
      const flags = caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(pattern, flags);
      let totalMatches = 0;
      let filesSearched = 0;

      // Get files to search
      const listResult = await this.listDirectory(path, {
        recursive,
        maxDepth,
        pattern: filePattern,
        includeFiles: true,
        includeDirectories: false,
        respectGitignore,
      });

      if (!listResult.success || !listResult.files) {
        return {
          success: false,
          message: 'Failed to get files for search',
          error: listResult.error,
        };
      }

      for (const file of listResult.files) {
        if (totalMatches >= maxMatches) break;

        // Check exclude patterns
        if (
          excludePatterns.some((pattern) =>
            this.matchesPattern(file.path, pattern),
          )
        ) {
          continue;
        }

        try {
          const readResult = await this.readFile(file.path);
          if (!readResult.success || !readResult.content) continue;

          filesSearched++;
          const content = readResult.content;
          if (!content) continue;

          const lines = content.split('\n');

          for (
            let lineIndex = 0;
            lineIndex < lines.length && totalMatches < maxMatches;
            lineIndex++
          ) {
            const line = lines[lineIndex];
            if (!line) continue;

            let match: RegExpExecArray | null;

            regex.lastIndex = 0; // Reset regex for each line
            match = regex.exec(line);
            while (match && totalMatches < maxMatches) {
              matches.push({
                path: file.path,
                line: lineIndex + 1,
                column: match.index + 1,
                match: match[0],
                preview: line.trim(),
              });
              totalMatches++;

              // Prevent infinite loop for non-global regex
              if (!regex.global) break;
              match = regex.exec(line);
            }
          }
        } catch (_error) {
          // Skip files that can't be read
        }
      }

      return {
        success: true,
        message: 'Search completed',
        matches,
        totalMatches,
        filesSearched,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Search failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async glob(
    pattern: string,
    options: {
      cwd?: string;
      absolute?: boolean;
      includeDirectories?: boolean;
      excludePatterns?: string[];
      respectGitignore?: boolean;
    } = {},
  ): Promise<GlobResult> {
    try {
      const {
        cwd = '.',
        absolute = false,
        includeDirectories = true,
        excludePatterns = [],
        respectGitignore = true,
      } = options;

      const searchPath = this.resolvePath(cwd);
      const paths: string[] = [];

      // Simple glob implementation - for production, consider using a proper glob library
      const globToRegex = (glob: string): RegExp => {
        const escaped = glob
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')
          .replace(/\*\*/g, '.*');
        return new RegExp(`^${escaped}$`);
      };

      const regex = globToRegex(pattern);

      const listResult = await this.listDirectory(searchPath, {
        recursive: true,
        includeFiles: true,
        includeDirectories,
        respectGitignore,
      });

      if (!listResult.success || !listResult.files) {
        return {
          success: false,
          message: 'Failed to list files for glob',
          error: listResult.error,
        };
      }

      for (const file of listResult.files) {
        // Check exclude patterns
        if (
          excludePatterns.some((pattern) =>
            this.matchesPattern(file.path, pattern),
          )
        ) {
          continue;
        }

        if (regex.test(file.path)) {
          const resultPath = absolute ? this.resolvePath(file.path) : file.path;
          paths.push(resultPath);
        }
      }

      return {
        success: true,
        message: 'Glob search completed',
        paths,
        totalMatches: paths.length,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Glob search failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async searchAndReplace(
    filePath: string,
    searchString: string,
    replaceString: string,
    options: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      preserveCase?: boolean;
      maxReplacements?: number;
      dryRun?: boolean;
    } = {},
  ): Promise<SearchReplaceResult> {
    try {
      const {
        caseSensitive = true,
        wholeWord = false,
        regex = false,
        preserveCase = false,
        maxReplacements = Number.POSITIVE_INFINITY,
        dryRun = false,
      } = options;

      const readResult = await this.readFile(filePath);
      if (!readResult.success || !readResult.content) {
        return {
          success: false,
          message: 'Failed to read file for search and replace',
          error: readResult.error,
        };
      }

      const content = readResult.content;
      if (!content) {
        return {
          success: false,
          message: 'File content is empty',
        };
      }

      const lines = content.split('\n');
      const replacements: SearchReplaceMatch[] = [];
      let totalReplacements = 0;
      let fileModified = false;

      // Build search pattern
      let searchPattern = regex ? searchString : this.escapeRegex(searchString);
      if (wholeWord) {
        searchPattern = `\\b${searchPattern}\\b`;
      }

      const flags = caseSensitive ? 'g' : 'gi';
      const searchRegex = new RegExp(searchPattern, flags);

      for (
        let lineIndex = 0;
        lineIndex < lines.length && totalReplacements < maxReplacements;
        lineIndex++
      ) {
        const originalLine = lines[lineIndex];
        if (originalLine === undefined) continue;

        let newLine = originalLine;
        let match: RegExpExecArray | null;

        // Reset regex lastIndex for each line
        searchRegex.lastIndex = 0;

        match = searchRegex.exec(originalLine);
        while (match && totalReplacements < maxReplacements) {
          let replacement = replaceString;

          if (preserveCase && !regex) {
            replacement = this.preserveCase(match[0], replaceString);
          }

          replacements.push({
            line: lineIndex + 1,
            column: match.index + 1,
            oldText: match[0],
            newText: replacement,
            lineContent: originalLine,
          });

          newLine = newLine.replace(match[0], replacement);
          totalReplacements++;
          fileModified = true;

          // Prevent infinite loop for non-global regex
          if (!searchRegex.global) break;
          match = searchRegex.exec(originalLine);
        }

        lines[lineIndex] = newLine;
      }

      // Write changes if not dry run
      if (!dryRun && fileModified) {
        const writeResult = await this.writeFile(filePath, lines.join('\n'));
        if (!writeResult.success) {
          return {
            success: false,
            message: 'Failed to write changes',
            error: writeResult.error,
          };
        }
      }

      return {
        success: true,
        message: `Search and replace completed${dryRun ? ' (dry run)' : ''}`,
        replacements,
        totalReplacements,
        fileModified: dryRun ? false : fileModified,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Search and replace failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Path operations
  resolvePath(path: string): string {
    if (path.startsWith('/')) {
      return path; // Already absolute
    }
    return this.joinPaths(this.config.workingDirectory, path);
  }

  getDirectoryName(path: string): string {
    return path.split('/').slice(0, -1).join('/') || '/';
  }

  joinPaths(...paths: string[]): string {
    return paths
      .map((p) => p.replace(/^\/+|\/+$/g, ''))
      .filter((p) => p.length > 0)
      .join('/')
      .replace(/^(?!\/)/, '/');
  }

  getRelativePath(from: string, to: string): string {
    const fromParts = from.split('/').filter((p) => p);
    const toParts = to.split('/').filter((p) => p);

    let commonLength = 0;
    while (
      commonLength < fromParts.length &&
      commonLength < toParts.length &&
      fromParts[commonLength] === toParts[commonLength]
    ) {
      commonLength++;
    }

    const upLevels = fromParts.length - commonLength;
    const remainingPath = toParts.slice(commonLength);

    const relativeParts = Array(upLevels).fill('..').concat(remainingPath);
    return relativeParts.join('/') || '.';
  }

  getFileExtension(path: string): string {
    const lastDot = path.lastIndexOf('.');
    const lastSlash = path.lastIndexOf('/');

    if (lastDot > lastSlash && lastDot !== -1) {
      return path.substring(lastDot);
    }
    return '';
  }

  // Utility operations
  async fileExists(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      return this.volume.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      const stats = this.volume.statSync(fullPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async getFileStats(
    path: string,
  ): Promise<{ size: number; modifiedTime?: Date }> {
    const fullPath = this.resolvePath(path);
    const stats = this.volume.statSync(fullPath);
    return {
      size: stats.size || 0,
      modifiedTime: stats.mtime instanceof Date ? stats.mtime : new Date(),
    };
  }

  getCurrentWorkingDirectory(): string {
    return this.config.workingDirectory;
  }

  async deleteFile(path: string): Promise<FileOperationResult> {
    try {
      const fullPath = this.resolvePath(path);
      this.volume.unlinkSync(fullPath);

      return {
        success: true,
        message: 'File deleted successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete file',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async copyFile(
    source: string,
    destination: string,
  ): Promise<FileOperationResult> {
    try {
      const readResult = await this.readFile(source);
      if (!readResult.success || !readResult.content) {
        return {
          success: false,
          message: 'Failed to read source file',
          error: readResult.error,
        };
      }

      return await this.writeFile(destination, readResult.content);
    } catch (error) {
      return {
        success: false,
        message: 'Failed to copy file',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async moveFile(
    source: string,
    destination: string,
  ): Promise<FileOperationResult> {
    try {
      const copyResult = await this.copyFile(source, destination);
      if (!copyResult.success) {
        return copyResult;
      }

      const deleteResult = await this.deleteFile(source);
      if (!deleteResult.success) {
        // Try to clean up the copied file
        await this.deleteFile(destination);
        return deleteResult;
      }

      return {
        success: true,
        message: 'File moved successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to move file',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getGitignorePatterns(): Promise<string[]> {
    try {
      const gitignoreExists = await this.fileExists('.gitignore');
      if (!gitignoreExists) {
        return this.gitignorePatterns;
      }

      const readResult = await this.readFile('.gitignore');
      if (!readResult.success || !readResult.content) {
        return this.gitignorePatterns;
      }

      const patterns = readResult.content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

      return [...this.gitignorePatterns, ...patterns];
    } catch {
      return this.gitignorePatterns;
    }
  }

  async isIgnored(path: string): Promise<boolean> {
    const patterns = await this.getGitignorePatterns();
    return this.shouldIgnorePattern(path, patterns);
  }

  async isBinary(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      const content = this.volume.readFileSync(fullPath);

      // Check if content is a Buffer
      if (Buffer.isBuffer(content)) {
        // Check first 1KB for NUL bytes
        const bytesToCheck = Math.min(content.length, 1024);
        const checkBuffer = content.slice(0, bytesToCheck);
        return checkBuffer.includes(0x00);
      }

      // If it's a string, it's not binary
      return false;
    } catch (error) {
      // If we can't read the file, assume it's not binary
      console.warn(`[isBinary] Error checking file ${path}:`, error);
      return false;
    }
  }

  // Helper methods
  private matchesPattern(text: string, pattern: string): boolean {
    // Simple pattern matching - for production, consider using minimatch
    const regex = new RegExp(
      pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.'),
      'i',
    );
    return regex.test(text);
  }

  private shouldIgnorePattern(path: string, patterns?: string[]): boolean {
    const patternsToCheck = patterns || this.gitignorePatterns;
    return patternsToCheck.some(
      (pattern) => pattern && this.matchesPattern(path, pattern),
    );
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private preserveCase(original: string, replacement: string): string {
    if (!original || !replacement) return replacement;

    if (original === original.toLowerCase()) {
      return replacement.toLowerCase();
    }
    if (original === original.toUpperCase()) {
      return replacement.toUpperCase();
    }
    if (
      original.length > 0 &&
      replacement.length > 0 &&
      original[0] === original[0]?.toUpperCase()
    ) {
      return replacement[0]?.toUpperCase() + replacement.slice(1).toLowerCase();
    }
    return replacement;
  }
}
