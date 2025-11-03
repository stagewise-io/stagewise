/**
 * Utility functions for file operations in tools
 */

import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { FILE_SIZE_LIMITS, FILE_SIZE_ERROR_MESSAGES } from '../constants.js';

/**
 * Checks if a file is within the specified size limit
 * @param clientRuntime The client runtime instance
 * @param filePath The file path to check
 * @param maxSize Maximum allowed file size in bytes
 * @returns Object with isWithinLimit boolean and fileSize if available
 */
export async function checkFileSize(
  clientRuntime: ClientRuntime,
  filePath: string,
  maxSize: number = FILE_SIZE_LIMITS.DEFAULT_MAX_FILE_SIZE,
): Promise<{ isWithinLimit: boolean; fileSize?: number; error?: string }> {
  try {
    // Check if getFileStats is available
    if (clientRuntime.fileSystem.getFileStats) {
      const stats = await clientRuntime.fileSystem.getFileStats(filePath);
      if (stats?.size !== undefined) {
        const isWithinLimit = stats.size <= maxSize;
        return {
          isWithinLimit,
          fileSize: stats.size,
          error: isWithinLimit
            ? undefined
            : FILE_SIZE_ERROR_MESSAGES.FILE_TOO_LARGE(
                filePath,
                stats.size,
                maxSize,
              ),
        };
      }
    }
    // If we can't determine size, allow the file to be read but warn
    console.warn(`[file-utils] Unable to determine file size for: ${filePath}`);
    return { isWithinLimit: true };
  } catch (error) {
    // If error checking size, allow the file to be read but warn
    console.warn(
      `[file-utils] Error checking file size for ${filePath}:`,
      error,
    );
    return { isWithinLimit: true };
  }
}

/**
 * Truncates content to a maximum length with an indicator
 */
export function truncateContent(
  content: string,
  maxLength: number,
  truncationIndicator = '\n... (content truncated)',
): string {
  if (content.length <= maxLength) {
    return content;
  }

  const truncateAt = maxLength - truncationIndicator.length;
  return content.substring(0, truncateAt) + truncationIndicator;
}

/**
 * Tracks total content size for multi-file operations
 */
export class ContentSizeTracker {
  private totalSize = 0;
  private fileCount = 0;
  private skippedFiles: Array<{ path: string; size: number }> = [];

  constructor(private readonly maxTotalSize: number) {}

  /**
   * Checks if adding content would exceed the limit
   */
  canAddContent(contentSize: number): boolean {
    return this.totalSize + contentSize <= this.maxTotalSize;
  }

  /**
   * Adds content size to the tracker
   */
  addContent(contentSize: number, filePath?: string): boolean {
    if (this.canAddContent(contentSize)) {
      this.totalSize += contentSize;
      this.fileCount++;
      return true;
    }
    if (filePath) {
      this.skippedFiles.push({ path: filePath, size: contentSize });
    }
    return false;
  }

  /**
   * Gets current total size
   */
  getTotalSize(): number {
    return this.totalSize;
  }

  /**
   * Gets number of files processed
   */
  getFileCount(): number {
    return this.fileCount;
  }

  /**
   * Gets list of skipped files
   */
  getSkippedFiles(): Array<{ path: string; size: number }> {
    return this.skippedFiles;
  }

  /**
   * Gets a summary message
   */
  getSummary(): string {
    const skippedCount = this.skippedFiles.length;
    if (skippedCount === 0) {
      return `Processed ${this.fileCount} files`;
    }
    return `Processed ${this.fileCount} files, skipped ${skippedCount} large files`;
  }
}

/**
 * Result of preparing content for diff
 */
export interface PreparedDiffContent {
  content?: string;
  truncated: boolean;
  omitted: boolean;
  contentSize: number;
}

/**
 * Prepares file content for inclusion in diffs, handling binary and large files safely
 * @param content The file content to prepare
 * @param filePath The file path (for binary detection)
 * @param clientRuntime The client runtime for file operations
 * @returns Prepared content with metadata about how it was handled
 */
export async function prepareDiffContent(
  content: string,
  filePath: string,
  clientRuntime: ClientRuntime,
): Promise<PreparedDiffContent> {
  // Use TextEncoder for cross-platform byte length calculation
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const encoded = encoder.encode(content);
  const contentSize = encoded.byteLength;

  // Check if file is binary
  const isBinary = await clientRuntime.fileSystem.isBinary(filePath);
  if (isBinary) {
    return {
      content: undefined,
      truncated: false,
      omitted: true,
      contentSize,
    };
  }

  // Check if content exceeds the max diff size
  const maxDiffBytes = FILE_SIZE_LIMITS.MAX_DIFF_BYTES || 2 * 1024 * 1024; // 2MB default
  if (contentSize > maxDiffBytes) {
    // Truncate the content to fit within the limit
    const truncationIndicator = '\n... (content truncated)';
    const indicatorBytes = encoder.encode(truncationIndicator);
    const budget = Math.max(0, maxDiffBytes - indicatorBytes.byteLength);

    // Take a byte-accurate slice
    let slice = encoded.subarray(0, budget);

    // Try to find a newline in the last 20% of the slice
    const backtrackWindow = Math.floor(slice.byteLength * 0.2);
    const viewStart = Math.max(0, slice.byteLength - backtrackWindow);
    const recent = slice.subarray(viewStart);
    const recentStr = decoder.decode(recent);
    const lastNewlineInRecent = recentStr.lastIndexOf('\n');

    if (lastNewlineInRecent !== -1) {
      // Calculate the byte position of the newline in the original slice
      const bytesBeforeNewline = encoder.encode(
        recentStr.slice(0, lastNewlineInRecent),
      ).byteLength;
      const newlinePosInSlice = viewStart + bytesBeforeNewline;
      slice = slice.subarray(0, newlinePosInSlice);
    }

    const truncatedContent = decoder.decode(slice);

    return {
      content: truncatedContent + truncationIndicator,
      truncated: true,
      omitted: false,
      contentSize,
    };
  }

  // Content is safe to include in full
  return {
    content,
    truncated: false,
    omitted: false,
    contentSize,
  };
}
