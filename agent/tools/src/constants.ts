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
   * 100KB - reasonable limit to prevent token/memory issues while preserving undo for most text files
   */
  MAX_DIFF_BYTES: 100 * 1024, // 100KB
};

/**
 * Grep search limits to prevent excessive output that could cause API errors
 */
export const GREP_LIMITS = {
  /**
   * Default maximum number of matches to return if not specified
   * 500 matches provides good coverage without overwhelming the API
   */
  DEFAULT_MAX_MATCHES: 200,

  /**
   * Maximum total output size for grep results
   * 1MB - prevents "Request Entity Too Large" errors
   */
  MAX_TOTAL_OUTPUT_SIZE: 1 * 1024 * 1024, // 1MB

  /**
   * Message to append when grep results are truncated
   */
  TRUNCATION_MESSAGE:
    '\n[Results truncated due to size limits. Use more specific patterns or file filters to narrow your search.]',
};

/**
 * Binary file detection settings
 * Following ripgrep's approach of checking for NUL bytes
 */
export const BINARY_DETECTION = {
  /**
   * Number of bytes to check at the beginning of a file for binary detection
   * 8KB is sufficient to catch most binary files while being efficient
   */
  CHECK_BUFFER_SIZE: 1024, // 1KB
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
