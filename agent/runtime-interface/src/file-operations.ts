import { z } from 'zod';

/**
 * Core file system operation results
 */
export const FileOperationResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  error: z.string().optional(),
});

export type FileOperationResult = z.infer<typeof FileOperationResultSchema>;

export const FileContentResultSchema = FileOperationResultSchema.extend({
  content: z.string().optional(),
  totalLines: z.number().optional(),
});

export type FileContentResult = z.infer<typeof FileContentResultSchema>;

export const DirectoryEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number().optional(),
  depth: z.number(),
});

export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>;

export const DirectoryListResultSchema = FileOperationResultSchema.extend({
  files: z.array(DirectoryEntrySchema).optional(),
  totalFiles: z.number().optional(),
  totalDirectories: z.number().optional(),
});

export type DirectoryListResult = z.infer<typeof DirectoryListResultSchema>;

/**
 * Result schema for grep operations
 */
export const GrepMatchSchema = z.object({
  path: z.string(),
  line: z.number(),
  column: z.number(),
  match: z.string(),
  preview: z.string(),
});

export type GrepMatch = z.infer<typeof GrepMatchSchema>;

export const GrepResultSchema = FileOperationResultSchema.extend({
  matches: z.array(GrepMatchSchema).optional(),
  totalMatches: z.number().optional(),
  filesSearched: z.number().optional(),
});

export type GrepResult = z.infer<typeof GrepResultSchema>;

/**
 * Result schema for glob operations
 */
export const GlobResultSchema = FileOperationResultSchema.extend({
  paths: z.array(z.string()).optional(),
  totalMatches: z.number().optional(),
});

export type GlobResult = z.infer<typeof GlobResultSchema>;

/**
 * Schema for search and replace match details
 */
export const SearchReplaceMatchSchema = z.object({
  line: z.number(),
  column: z.number(),
  oldText: z.string(),
  newText: z.string(),
  lineContent: z.string(),
});

export type SearchReplaceMatch = z.infer<typeof SearchReplaceMatchSchema>;

/**
 * Result schema for search and replace operations
 */
export const SearchReplaceResultSchema = FileOperationResultSchema.extend({
  replacements: z.array(SearchReplaceMatchSchema).optional(),
  totalReplacements: z.number().optional(),
  fileModified: z.boolean().optional(),
});

export type SearchReplaceResult = z.infer<typeof SearchReplaceResultSchema>;

/**
 * Core interface for file system operations.
 * Provides comprehensive access to the local file system including
 * reading, writing, searching, and pattern matching capabilities.
 *
 * IMPORTANT: All path parameters in this interface expect relative paths.
 * The client runtime will resolve these paths relative to the current working directory.
 */
export interface IFileSystemProvider {
  // File operations
  /**
   * Reads the content of a file.
   * @param path - The relative file path to read
   * @param options - Optional parameters to read specific line ranges
   * @returns File content and metadata
   */
  readFile(
    path: string,
    options?: {
      startLine?: number;
      endLine?: number;
    },
  ): Promise<FileContentResult>;

  /**
   * Writes content to a file, creating it if it doesn't exist.
   * @param path - The relative file path to write to
   * @param content - The content to write
   * @returns Operation result
   */
  writeFile(path: string, content: string): Promise<FileOperationResult>;

  /**
   * Edits a file by replacing content between specified lines.
   * More versatile than insertLines/overwriteLines.
   * @param path - The relative file path to edit
   * @param content - The new content
   * @param startLine - Starting line number (1-based)
   * @param endLine - Ending line number (inclusive)
   * @returns Operation result
   */
  editFile(
    path: string,
    content: string,
    startLine: number,
    endLine: number,
  ): Promise<FileOperationResult>;

  // Directory operations
  /**
   * Creates a directory, including parent directories if needed.
   * @param path - The relative directory path to create
   * @returns Operation result
   */
  createDirectory(path: string): Promise<FileOperationResult>;

  /**
   * Lists files and directories in a given path.
   * @param path - The relative directory path to list
   * @param options - Filtering and recursion options
   * @returns List of directory entries
   */
  listDirectory(
    path: string,
    options?: {
      recursive?: boolean;
      maxDepth?: number;
      pattern?: string;
      includeDirectories?: boolean;
      includeFiles?: boolean;
      respectGitignore?: boolean; // Whether to respect .gitignore patterns (default: true)
    },
  ): Promise<DirectoryListResult>;

  // Search operations
  /**
   * Searches for content patterns across files in a directory.
   * Similar to the Unix grep command.
   * @param path - The relative directory path to search in
   * @param pattern - Regular expression pattern to search for
   * @param options - Search configuration options
   * @returns Matching results with file paths and line information
   */
  grep(
    path: string,
    pattern: string,
    options?: {
      recursive?: boolean;
      maxDepth?: number;
      filePattern?: string; // Only search files matching this pattern
      caseSensitive?: boolean;
      maxMatches?: number; // Limit total matches
      excludePatterns?: string[]; // Patterns to exclude from search
      respectGitignore?: boolean; // Whether to respect .gitignore patterns (default: true)
    },
  ): Promise<GrepResult>;

  /**
   * Finds files and directories matching a glob pattern.
   * Supports standard glob syntax (*, **, ?, [abc], etc.)
   * @param pattern - Glob pattern to match (e.g., "\*\*\/*.ts", "src\\**\\test-*.js")
   * @param options - Glob configuration options
   * @returns List of matching file paths
   */
  glob(
    pattern: string,
    options?: {
      cwd?: string; // Base directory for relative patterns (relative to working directory)
      absolute?: boolean; // Return absolute paths
      includeDirectories?: boolean;
      excludePatterns?: string[]; // Patterns to exclude
      respectGitignore?: boolean; // Whether to respect .gitignore patterns (default: true)
    },
  ): Promise<GlobResult>;

  /**
   * Searches and replaces occurrences of a string in a file.
   * @param filePath - The relative file path to perform search and replace on
   * @param searchString - The string or regex pattern to search for
   * @param replaceString - The string to replace matches with
   * @param options - Search and replace configuration options
   * @returns Results including all replacements made and file modification status
   */
  searchAndReplace(
    filePath: string,
    searchString: string,
    replaceString: string,
    options?: {
      caseSensitive?: boolean; // Whether search is case-sensitive (default: true)
      wholeWord?: boolean; // Match whole words only (default: false)
      regex?: boolean; // Treat searchString as regex (default: false)
      preserveCase?: boolean; // Preserve case of replaced text (default: false)
      maxReplacements?: number; // Limit number of replacements
      dryRun?: boolean; // Preview replacements without modifying file (default: false)
    },
  ): Promise<SearchReplaceResult>;

  // Path operations
  /**
   * Resolves a relative path to its absolute form.
   * @param path - The relative path to resolve
   * @returns Absolute path
   */
  resolvePath(path: string): string;

  /**
   * Gets the directory name from a path.
   * @param path - The file or directory path
   * @returns Parent directory path
   */
  getDirectoryName(path: string): string;

  /**
   * Joins multiple path segments into a single path.
   * @param paths - Path segments to join
   * @returns Combined path
   */
  joinPaths(...paths: string[]): string;

  /**
   * Gets the relative path from one location to another.
   * @param from - Starting path
   * @param to - Target path
   * @returns Relative path
   */
  getRelativePath(from: string, to: string): string;

  /**
   * Extracts the file extension from a path.
   * @param path - The file path
   * @returns File extension including the dot (e.g., ".ts")
   */
  getFileExtension(path: string): string;

  // Utility operations
  /**
   * Checks if a file or directory exists.
   * @param path - The relative path to check
   * @returns True if exists, false otherwise
   */
  fileExists(path: string): Promise<boolean>;

  /**
   * Checks if a path is a directory.
   * @param path - The relative path to check
   * @returns True if directory, false otherwise
   */
  isDirectory(path: string): Promise<boolean>;

  /**
   * Gets file statistics.
   * @param path - The relative file path
   * @returns File statistics including size in bytes
   */
  getFileStats(path: string): Promise<{ size: number; modifiedTime?: Date }>;

  /**
   * Gets the current working directory.
   * @returns Current working directory path
   */
  getCurrentWorkingDirectory(): string;

  /**
   * Deletes a file.
   * @param path - The relative file path to delete
   * @returns Operation result
   */
  deleteFile(path: string): Promise<FileOperationResult>;

  /**
   * Copies a file from source to destination.
   * @param source - Relative source file path
   * @param destination - Relative destination file path
   * @returns Operation result
   */
  copyFile(source: string, destination: string): Promise<FileOperationResult>;

  /**
   * Moves or renames a file.
   * @param source - Relative source file path
   * @param destination - Relative destination file path
   * @returns Operation result
   */
  moveFile(source: string, destination: string): Promise<FileOperationResult>;

  /**
   * Gets the gitignore patterns for the workspace.
   * @returns Array of gitignore patterns, or empty array if no .gitignore exists
   */
  getGitignorePatterns(): Promise<string[]>;

  /**
   * Checks if a path should be ignored based on gitignore patterns.
   * @param path - The relative path to check
   * @returns True if the path should be ignored, false otherwise
   */
  isIgnored(path: string): Promise<boolean>;

  /**
   * Checks if a file contains binary content.
   * @param path - The relative file path to check
   * @returns True if the file is binary, false if it's text
   */
  isBinary(path: string): Promise<boolean>;
}

/**
 * Base configuration for file system providers
 */
export interface FileSystemProviderConfig {
  workingDirectory: string;
}

/**
 * Abstract base class for file system providers
 */
export abstract class BaseFileSystemProvider implements IFileSystemProvider {
  protected config: FileSystemProviderConfig;

  constructor(config: FileSystemProviderConfig) {
    this.config = config;
  }

  abstract readFile(
    path: string,
    options?: { startLine?: number; endLine?: number },
  ): Promise<FileContentResult>;
  abstract writeFile(
    path: string,
    content: string,
  ): Promise<FileOperationResult>;
  abstract editFile(
    path: string,
    content: string,
    startLine: number,
    endLine: number,
  ): Promise<FileOperationResult>;
  abstract createDirectory(path: string): Promise<FileOperationResult>;
  abstract listDirectory(
    path: string,
    options?: {
      recursive?: boolean;
      maxDepth?: number;
      pattern?: string;
      includeDirectories?: boolean;
      includeFiles?: boolean;
      respectGitignore?: boolean;
    },
  ): Promise<DirectoryListResult>;
  abstract grep(
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
    },
  ): Promise<GrepResult>;
  abstract glob(
    pattern: string,
    options?: {
      cwd?: string;
      absolute?: boolean;
      includeDirectories?: boolean;
      excludePatterns?: string[];
      respectGitignore?: boolean;
    },
  ): Promise<GlobResult>;
  abstract searchAndReplace(
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
  ): Promise<SearchReplaceResult>;
  abstract fileExists(path: string): Promise<boolean>;
  abstract isDirectory(path: string): Promise<boolean>;
  abstract getFileStats(
    path: string,
  ): Promise<{ size: number; modifiedTime?: Date }>;
  abstract deleteFile(path: string): Promise<FileOperationResult>;
  abstract copyFile(
    source: string,
    destination: string,
  ): Promise<FileOperationResult>;
  abstract moveFile(
    source: string,
    destination: string,
  ): Promise<FileOperationResult>;
  abstract getGitignorePatterns(): Promise<string[]>;
  abstract isIgnored(path: string): Promise<boolean>;
  abstract isBinary(path: string): Promise<boolean>;

  // Default implementations for path operations that can be overridden if needed
  abstract resolvePath(path: string): string;
  abstract getDirectoryName(path: string): string;
  abstract joinPaths(...paths: string[]): string;
  abstract getRelativePath(from: string, to: string): string;
  abstract getFileExtension(path: string): string;

  abstract getCurrentWorkingDirectory(): string;
}
