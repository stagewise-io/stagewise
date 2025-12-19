/**
 * File size limits for tools to prevent reading excessively large files
 * that could cause memory issues or excessive costs for LLM processing
 */

/**
 * Maximum file sizes in bytes for different tool operations
 */
export const FILE_SIZE_LIMITS = {
  /**
   * Default maximum file size for general file reading operations
   * 10MB - suitable for most source code files
   */
  DEFAULT_MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

  /**
   * Maximum file size for search/grep operations
   * 1MB - keeps search operations fast
   */
  SEARCH_MAX_FILE_SIZE: 1 * 1024 * 1024, // 1MB

  /**
   * Maximum file size for style file analysis
   * 500KB - CSS/SCSS files should rarely exceed this
   */
  STYLE_MAX_FILE_SIZE: 500 * 1024, // 500KB

  /**
   * Maximum file size for files being edited
   * 5MB - reasonable limit for files that need modifications
   */
  EDIT_MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB

  /**
   * Maximum total content size for multi-file operations
   * 20MB - prevents memory issues when processing multiple files
   */
  MULTI_FILE_TOTAL_LIMIT: 20 * 1024 * 1024, // 20MB

  /**
   * Maximum file size for storing file content in diffs/undo operations
   * 2MB - reasonable limit to prevent token/memory issues while preserving undo for most text files
   */
  MAX_DIFF_BYTES: 2 * 1024 * 1024, // 2MB
};

/**
 * Tool output limits to prevent LLM context bloat
 * These limits apply to the serialized JSON output of tools
 */
export const TOOL_OUTPUT_LIMITS = {
  /**
   * Grep search tool limits
   */
  GREP: {
    /** Maximum number of matches to return */
    MAX_MATCHES: 50,
    /** Maximum character length for each match preview */
    MAX_MATCH_PREVIEW_LENGTH: 500,
    /** Maximum total output size in bytes (serialized JSON) */
    MAX_TOTAL_OUTPUT_SIZE: 40 * 1024, // 40KB, ~ 10k tokens at 4 chars per token
  },

  /**
   * Glob tool limits
   */
  GLOB: {
    /** Maximum number of file paths to return */
    MAX_RESULTS: 50,
    /** Maximum total output size in bytes (serialized JSON) */
    MAX_TOTAL_OUTPUT_SIZE: 40 * 1024, // 40KB, ~ 10k tokens at 4 chars per token
  },

  /**
   * List files tool limits
   */
  LIST_FILES: {
    /** Maximum number of file/directory entries to return */
    MAX_RESULTS: 50,
    /** Maximum total output size in bytes (serialized JSON) */
    MAX_TOTAL_OUTPUT_SIZE: 40 * 1024, // 40KB, ~ 10k tokens at 4 chars per token
  },

  /**
   * Read file tool limits
   */
  READ_FILE: {
    /** Maximum total output size in bytes (serialized JSON) */
    MAX_TOTAL_OUTPUT_SIZE: 200 * 1024, // 200KB ~ 50k tokens at 4 chars per token -> ~6k lines of code
  },

  /**
   * Execute console script tool limits
   */
  EXECUTE_CONSOLE_SCRIPT: {
    /** Maximum total output size in bytes (serialized JSON) */
    MAX_TOTAL_OUTPUT_SIZE: 200 * 1024, // 200KB ~ 50k tokens at 4 chars per token -> ~6k lines of code
  },

  /**
   * Fallback limits for tools that don't have specific limits
   */
  FALLBACK: {
    /** Maximum total output size in bytes (serialized JSON) */
    MAX_TOTAL_OUTPUT_SIZE: 40 * 1024, // 40KB, ~10k tokens at 4 chars per token
  },

  /**
   * Default truncation message for all tools
   */
  DEFAULT_TRUNCATION_MESSAGE:
    '\n[Results truncated due to size limits. Use more specific patterns or filters to narrow your search.]',
};

/**
 * Error messages for file size limit violations
 */
export const FILE_SIZE_ERROR_MESSAGES = {
  FILE_TOO_LARGE: (fileName: string, fileSize: number, maxSize: number) =>
    `File "${fileName}" is too large (${formatBytes(fileSize)}) to process. Maximum allowed size is ${formatBytes(maxSize)}.`,

  TOTAL_SIZE_EXCEEDED: (totalSize: number, maxSize: number) =>
    `Total content size (${formatBytes(totalSize)}) exceeds the maximum allowed size of ${formatBytes(maxSize)}.`,

  SKIPPED_LARGE_FILE: (fileName: string, fileSize: number) =>
    `Skipped large file "${fileName}" (${formatBytes(fileSize)})`,
};

/**
 * Formats bytes into human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
