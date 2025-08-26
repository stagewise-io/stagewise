import { dirname, resolve, join, relative, extname } from 'node:path';
import { promises as fs } from 'node:fs';
import { minimatch } from 'minimatch';
import ignore from 'ignore';
import {
  BaseFileSystemProvider,
  type ClientRuntime,
  type GrepMatch,
  type GrepResult,
  type GlobResult,
  type SearchReplaceMatch,
  type SearchReplaceResult,
} from '@stagewise/agent-runtime-interface';

/**
 * Binary file detection settings
 * Following ripgrep's approach of checking for NUL bytes
 */
const BINARY_DETECTION = {
  /**
   * Number of bytes to check at the beginning of a file for binary detection
   * 8KB is sufficient to catch most binary files while being efficient
   */
  CHECK_BUFFER_SIZE: 1024, // 1KB
};

/**
 * Node.js implementation of the file system provider
 * Uses Node.js fs API for file operations
 *
 * IMPORTANT: All path parameters are expected to be relative paths.
 * The resolvePath method converts them to absolute paths using the working directory.
 */
export class NodeFileSystemProvider extends BaseFileSystemProvider {
  private gitignore: ReturnType<typeof ignore> | null = null;
  private gitignorePatterns: string[] = [];
  private gitignoreInitialized = false;

  getCurrentWorkingDirectory(): string {
    return this.config.workingDirectory;
  }

  async readFile(
    path: string,
    options?: { startLine?: number; endLine?: number },
  ) {
    try {
      const fullPath = this.resolvePath(path);
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      if (options?.startLine !== undefined) {
        if (options.startLine > totalLines) {
          return {
            success: false,
            message: `startLine ${options.startLine} exceeds file length (${totalLines} lines)`,
            error: 'LINE_OUT_OF_RANGE',
          };
        }

        const effectiveEndLine = options.endLine ?? totalLines;
        if (effectiveEndLine > totalLines) {
          return {
            success: false,
            message: `endLine ${effectiveEndLine} exceeds file length (${totalLines} lines)`,
            error: 'LINE_OUT_OF_RANGE',
          };
        }

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
        message: `Failed to read file: ${path}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async writeFile(path: string, content: string) {
    try {
      const fullPath = this.resolvePath(path);

      // Create directory if it doesn't exist
      await this.createDirectory(dirname(fullPath));
      await fs.writeFile(fullPath, content, 'utf-8');

      return {
        success: true,
        message: `Successfully wrote file: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to write file: ${path}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async editFile(
    path: string,
    content: string,
    startLine: number,
    endLine: number,
  ) {
    try {
      const fullPath = this.resolvePath(path);
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      const lines = fileContent.split('\n');

      if (startLine > lines.length || endLine > lines.length) {
        return {
          success: false,
          message: `Line range ${startLine}-${endLine} exceeds file length (${lines.length} lines)`,
          error: 'LINE_OUT_OF_RANGE',
        };
      }

      if (startLine < 1 || endLine < startLine) {
        return {
          success: false,
          message: `Invalid line range ${startLine}-${endLine}`,
          error: 'INVALID_RANGE',
        };
      }

      const beforeLines = lines.slice(0, startLine - 1);
      const afterLines = lines.slice(endLine);
      const contentLines = content.split('\n');
      const newLines = [...beforeLines, ...contentLines, ...afterLines];
      await fs.writeFile(fullPath, newLines.join('\n'), 'utf-8');

      return {
        success: true,
        message: `Successfully edited lines ${startLine}-${endLine}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to edit file: ${path}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createDirectory(path: string) {
    try {
      const fullPath = this.resolvePath(path);
      await fs.mkdir(fullPath, { recursive: true });
      return {
        success: true,
        message: `Successfully created directory: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create directory: ${path}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async listDirectory(
    path: string,
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
      const fullPath = this.resolvePath(path);
      const files: Array<{
        path: string;
        name: string;
        type: 'file' | 'directory';
        size?: number;
        depth: number;
      }> = [];
      let totalFiles = 0;
      let totalDirectories = 0;

      const listRecursive = async (dirPath: string, depth: number) => {
        if (options?.maxDepth !== undefined && depth > options.maxDepth) {
          return;
        }

        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const entryPath = join(dirPath, entry.name);
          const relativePath = relative(fullPath, entryPath);
          // For gitignore, paths must be relative to the repository root
          const gitignoreRelativePath = relative(
            this.config.workingDirectory,
            entryPath,
          );

          // Apply pattern filter if specified
          if (options?.pattern && !minimatch(relativePath, options.pattern)) {
            continue;
          }

          // Check gitignore if enabled (default true)
          if (options?.respectGitignore !== false) {
            await this.ensureGitignoreInitialized();
            if (this.gitignore?.ignores(gitignoreRelativePath)) {
              continue;
            }
          }

          if (entry.isDirectory()) {
            totalDirectories++;
            if (options?.includeDirectories !== false) {
              files.push({
                path: relative(this.config.workingDirectory, entryPath),
                name: entry.name,
                type: 'directory' as const,
                depth,
              });
            }
            if (options?.recursive) {
              await listRecursive(entryPath, depth + 1);
            }
          } else if (entry.isFile()) {
            totalFiles++;
            if (options?.includeFiles !== false) {
              const stat = await fs.stat(entryPath);
              files.push({
                path: relative(this.config.workingDirectory, entryPath),
                name: entry.name,
                type: 'file' as const,
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
        message: `Successfully listed directory: ${path}`,
        files,
        totalFiles,
        totalDirectories,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to list directory: ${path}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async grep(
    path: string,
    pattern: string,
    options?: {
      recursive?: boolean;
      maxDepth?: number;
      filePattern?: string;
      caseSensitive?: boolean;
      maxMatches?: number;
      excludePatterns?: string[];
      respectGitignore?: boolean;
      searchBinaryFiles?: boolean;
    },
  ): Promise<GrepResult> {
    try {
      const regex = new RegExp(pattern, options?.caseSensitive ? 'g' : 'gi');
      const matches: GrepMatch[] = [];
      let filesSearched = 0;
      let totalOutputSize = 0;
      const basePath = this.resolvePath(path);
      const MAX_OUTPUT_SIZE = 1 * 1024 * 1024; // 1MB limit for total output

      const searchFile = async (filePath: string) => {
        if (options?.maxMatches && matches.length >= options.maxMatches) {
          return;
        }

        // Check if we've exceeded the output size limit before reading the file
        if (totalOutputSize >= MAX_OUTPUT_SIZE) {
          return;
        }

        try {
          // Check for binary files unless explicitly told to search them
          if (!options?.searchBinaryFiles) {
            // Read a small buffer to check for NUL bytes (following ripgrep's approach)
            const stats = await fs.stat(filePath);
            const bytesToRead = Math.min(
              stats.size,
              BINARY_DETECTION.CHECK_BUFFER_SIZE,
            );

            if (bytesToRead > 0) {
              const fileHandle = await fs.open(filePath, 'r');
              try {
                const buffer = Buffer.alloc(bytesToRead);
                await fileHandle.read(buffer, 0, bytesToRead, 0);

                // Check for NUL bytes (0x00) which indicate binary content
                if (buffer.includes(0x00)) {
                  // Skip binary file silently (like ripgrep does by default)
                  return;
                }
              } finally {
                await fileHandle.close();
              }
            }
          }

          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          filesSearched++;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            let match: RegExpExecArray | null = null;
            regex.lastIndex = 0; // Reset regex state

            while (true) {
              match = regex.exec(line);
              if (!match) break;
              if (options?.maxMatches && matches.length >= options.maxMatches) {
                return;
              }

              const MAX_PREVIEW_LENGTH = 200; // Limit preview to 200 characters
              let preview = line?.trim() || '';
              if (preview.length > MAX_PREVIEW_LENGTH) {
                // Truncate long previews and add ellipsis
                preview = `${preview.substring(0, MAX_PREVIEW_LENGTH - 3)}...`;
              }

              const matchEntry: GrepMatch = {
                path: relative(this.config.workingDirectory, filePath),
                line: i + 1,
                column: match.index + 1,
                match: match[0],
                preview,
              };

              // Estimate the size of this match entry when serialized
              const estimatedSize = JSON.stringify(matchEntry).length;

              // Check if adding this match would exceed the output size limit
              if (totalOutputSize + estimatedSize > MAX_OUTPUT_SIZE) {
                // Stop collecting matches if we're about to exceed the size limit
                return;
              }

              matches.push(matchEntry);
              totalOutputSize += estimatedSize;
            }
          }
        } catch (_error) {
          // Skip files that can't be read (binary files, etc.)
        }
      };

      const searchDirectory = async (dirPath: string, depth: number) => {
        if (options?.maxDepth !== undefined && depth > options.maxDepth) {
          return;
        }

        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);
          const relativePath = relative(basePath, fullPath);
          // For gitignore, paths must be relative to the repository root
          const gitignoreRelativePath = relative(
            this.config.workingDirectory,
            fullPath,
          );

          // Check exclude patterns
          if (
            options?.excludePatterns?.some((p) => minimatch(relativePath, p))
          ) {
            continue;
          }

          // Check gitignore if enabled (default true)
          if (options?.respectGitignore !== false) {
            await this.ensureGitignoreInitialized();
            if (this.gitignore?.ignores(gitignoreRelativePath)) {
              continue;
            }
          }

          if (entry.isFile()) {
            // Check file pattern
            if (
              options?.filePattern &&
              !minimatch(entry.name, options.filePattern)
            ) {
              continue;
            }
            await searchFile(fullPath);
          } else if (entry.isDirectory() && options?.recursive) {
            await searchDirectory(fullPath, depth + 1);
          }
        }
      };

      if (await this.isDirectory(path)) {
        await searchDirectory(basePath, 0);
      } else {
        await searchFile(basePath);
      }

      // Check if we potentially truncated results due to size
      const wasTruncatedBySize = totalOutputSize >= MAX_OUTPUT_SIZE;
      const wasTruncatedByCount =
        options?.maxMatches && matches.length >= options.maxMatches;

      let message = `Found ${matches.length} matches in ${filesSearched} files`;
      if (wasTruncatedBySize) {
        message += ' (truncated due to output size limit)';
      } else if (wasTruncatedByCount) {
        message += ' (truncated due to match limit)';
      }

      return {
        success: true,
        message,
        matches,
        totalMatches: matches.length,
        filesSearched,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async glob(
    pattern: string,
    options?: {
      cwd?: string;
      absolute?: boolean;
      includeDirectories?: boolean;
      excludePatterns?: string[];
      respectGitignore?: boolean;
    },
  ): Promise<GlobResult> {
    try {
      const paths: string[] = [];
      const basePath = options?.cwd
        ? this.resolvePath(options.cwd)
        : this.config.workingDirectory;

      const searchDirectory = async (dirPath: string) => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);
          const relativePath = relative(basePath, fullPath);
          // For gitignore, paths must be relative to the repository root
          const gitignoreRelativePath = relative(
            this.config.workingDirectory,
            fullPath,
          );

          // Check exclude patterns
          if (
            options?.excludePatterns?.some((p) => minimatch(relativePath, p))
          ) {
            continue;
          }

          // Check gitignore if enabled (default true)
          if (options?.respectGitignore !== false) {
            await this.ensureGitignoreInitialized();
            if (this.gitignore?.ignores(gitignoreRelativePath)) {
              continue;
            }
          }

          // Check if path matches the glob pattern
          if (minimatch(relativePath, pattern)) {
            if (
              entry.isFile() ||
              (entry.isDirectory() && options?.includeDirectories)
            ) {
              paths.push(options?.absolute ? fullPath : relativePath);
            }
          }

          // Continue searching in subdirectories if pattern might match deeper
          if (entry.isDirectory() && pattern.includes('**')) {
            await searchDirectory(fullPath);
          }
        }
      };

      await searchDirectory(basePath);

      return {
        success: true,
        message: `Found ${paths.length} matching paths`,
        paths,
        totalMatches: paths.length,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to glob: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async searchAndReplace(
    filePath: string,
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
      const fullPath = this.resolvePath(filePath);
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
          options?.caseSensitive !== false ? 'g' : 'gi',
        );
      }

      // Process each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) {
          newLines.push('');
          continue;
        }
        let modifiedLine = line;
        // biome-ignore lint/correctness/noUnusedVariables: It is actually used
        let lineReplacements = 0;

        // Find all matches in the current line
        let match: RegExpExecArray | null = null;
        const lineMatches: Array<{
          index: number;
          length: number;
          text: string;
        }> = [];
        searchPattern.lastIndex = 0; // Reset regex state

        while (true) {
          match = searchPattern.exec(line);
          if (!match) break;
          lineMatches.push({
            index: match.index,
            length: match[0].length,
            text: match[0],
          });

          if (
            options?.maxReplacements &&
            totalReplacements + lineMatches.length >= options.maxReplacements
          ) {
            break;
          }
        }

        // Process matches in reverse order to maintain indices
        for (let j = lineMatches.length - 1; j >= 0; j--) {
          const matchInfo = lineMatches[j];
          if (!matchInfo) continue;

          let replacement = replaceString;

          // Handle case preservation if requested
          if (options?.preserveCase && !options?.regex) {
            replacement = this.preserveCase(matchInfo.text, replacement);
          }

          // Record the replacement
          replacements.push({
            line: i + 1,
            column: matchInfo.index + 1,
            oldText: matchInfo.text,
            newText: replacement,
            lineContent: line.trim(),
          });

          // Apply the replacement
          modifiedLine =
            modifiedLine.substring(0, matchInfo.index) +
            replacement +
            modifiedLine.substring(matchInfo.index + matchInfo.length);

          lineReplacements++;
          totalReplacements++;

          if (
            options?.maxReplacements &&
            totalReplacements >= options.maxReplacements
          ) {
            break;
          }
        }

        newLines.push(modifiedLine);

        if (
          options?.maxReplacements &&
          totalReplacements >= options.maxReplacements
        ) {
          // Add remaining lines unchanged
          newLines.push(...lines.slice(i + 1));
          break;
        }
      }

      // Write the file if not a dry run and there were replacements
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
    if (!original || !replacement) {
      return replacement || '';
    }

    // If original is all uppercase, make replacement uppercase
    if (original === original.toUpperCase()) {
      return replacement.toUpperCase();
    }

    // If original is all lowercase, make replacement lowercase
    if (original === original.toLowerCase()) {
      return replacement.toLowerCase();
    }

    // If original starts with uppercase, capitalize replacement
    const firstChar = original.charAt(0);
    if (firstChar && firstChar === firstChar.toUpperCase()) {
      return (
        replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase()
      );
    }

    // Otherwise, return replacement as-is
    return replacement;
  }

  async deleteFile(path: string) {
    try {
      const fullPath = this.resolvePath(path);
      await fs.unlink(fullPath);
      return {
        success: true,
        message: `Successfully deleted file: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete file: ${path}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async copyFile(source: string, destination: string) {
    try {
      const sourcePath = this.resolvePath(source);
      const destPath = this.resolvePath(destination);

      // Create destination directory if needed
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

      // Create destination directory if needed
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

  async fileExists(path: string) {
    try {
      const fullPath = this.resolvePath(path);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async isDirectory(path: string) {
    try {
      const fullPath = this.resolvePath(path);
      const stat = await fs.stat(fullPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async getFileStats(path: string) {
    const fullPath = this.resolvePath(path);
    const stat = await fs.stat(fullPath);
    return {
      size: stat.size,
      modifiedTime: stat.mtime,
    };
  }

  // Path operations using Node.js path module
  resolvePath(path: string): string {
    // If path is already absolute, return it as-is
    if (resolve(path) === path) {
      return path;
    }
    // Otherwise resolve it relative to the working directory
    return resolve(this.config.workingDirectory, path);
  }

  getDirectoryName(path: string): string {
    return dirname(path);
  }

  joinPaths(...paths: string[]): string {
    return join(...paths);
  }

  getRelativePath(from: string, to: string): string {
    return relative(from, to);
  }

  getFileExtension(path: string): string {
    return extname(path);
  }

  async getGitignorePatterns(): Promise<string[]> {
    await this.ensureGitignoreInitialized();
    return this.gitignorePatterns;
  }

  async isIgnored(path: string): Promise<boolean> {
    await this.ensureGitignoreInitialized();
    return this.gitignore ? this.gitignore.ignores(path) : false;
  }

  async isBinary(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      const stats = await fs.stat(fullPath);
      const bytesToRead = Math.min(
        stats.size,
        BINARY_DETECTION.CHECK_BUFFER_SIZE,
      );

      if (bytesToRead === 0) {
        // Empty files are not binary
        return false;
      }

      const fileHandle = await fs.open(fullPath, 'r');
      try {
        const buffer = Buffer.alloc(bytesToRead);
        await fileHandle.read(buffer, 0, bytesToRead, 0);

        // Check for NUL bytes (0x00) which indicate binary content
        return buffer.includes(0x00);
      } finally {
        await fileHandle.close();
      }
    } catch (_error) {
      // If we can't read the file, assume it's not binary
      // TODO: add client-side logging
      // console.warn(`[isBinary] Error checking file ${path}:`, error);
      return false;
    }
  }

  private async ensureGitignoreInitialized(): Promise<void> {
    if (this.gitignoreInitialized) {
      return;
    }

    this.gitignoreInitialized = true;

    try {
      // Read .gitignore file from workspace root
      const gitignorePath = join(this.config.workingDirectory, '.gitignore');
      const content = await fs.readFile(gitignorePath, 'utf-8');
      const patterns = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

      this.gitignorePatterns = patterns;
      this.gitignore = ignore().add(patterns);

      // Always ignore .git directory and common build/dependency directories
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

      this.gitignore.add(defaultIgnores);
      this.gitignorePatterns.push(...defaultIgnores);
    } catch (_error) {
      // If .gitignore doesn't exist or can't be read, use default ignores
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

      this.gitignore = ignore().add(defaultIgnores);
      this.gitignorePatterns = defaultIgnores;
    }
  }
}

export interface ClientRuntimeNodeConfig {
  workingDirectory: string;
}

export class ClientRuntimeNode implements ClientRuntime {
  public fileSystem: BaseFileSystemProvider;

  constructor(config: ClientRuntimeNodeConfig) {
    this.fileSystem = new NodeFileSystemProvider({
      workingDirectory: config.workingDirectory,
    });
  }
}
