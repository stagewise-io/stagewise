import type { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import { isBinaryFile } from 'isbinaryfile';
import { MAX_DIFF_TEXT_FILE_SIZE } from '@shared/karton-contracts/ui/shared-types';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LspService } from '../services/lsp';

type MountPrefix = string;

export type MountedClientRuntimes = Map<MountPrefix, ClientRuntimeNode>;
export type MountedLspServices = Map<MountPrefix, LspService>;

const FILE_SIZE_LIMITS = {
  DEFAULT_MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
};

const FILE_SIZE_ERROR_MESSAGES = {
  FILE_TOO_LARGE: (filePath: string, fileSize: number, maxSize: number) =>
    `File ${filePath} is too large (${fileSize} bytes) - maximum allowed is ${maxSize} bytes`,
};

/**
 * Utility for capping tool output sizes to prevent LLM context bloat
 *
 * Tools can return massive amounts of data (thousands of grep matches, file paths, etc.)
 * This utility ensures outputs stay within reasonable size limits while providing
 * helpful guidance to the agent on how to narrow results.
 */

export interface CapToolOutputOptions {
  maxBytes?: number;
  truncationMessage?: string;
  maxItems?: number;
}

export interface CappedToolOutput<T> {
  result: T;
  truncated: boolean;
  originalSize: number;
  cappedSize: number;
  itemsRemoved: number;
}

/**
 * Calculate the byte size of a value when serialized to JSON
 */
function calculateJsonByteSize(value: unknown): number {
  const json = JSON.stringify(value);
  return new TextEncoder().encode(json).length;
}

/**
 * Count the total number of items in the output structure
 * Handles arrays and objects with array properties
 */
function countItems(value: unknown): number {
  if (typeof value === 'string') return value.length > 0 ? 1 : 0;
  if (Array.isArray(value)) return value.length;

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    let totalItems = 0;

    // Count items in all array properties
    for (const propValue of Object.values(obj))
      if (Array.isArray(propValue)) totalItems += propValue.length;

    return totalItems;
  }

  return 0;
}

const TRUNCATION_INDICATOR = '\n... [truncated]';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Truncate a string to fit within a target byte size (JSON-encoded).
 * Uses byte-aware slicing so multi-byte UTF-8 characters are never split.
 */
function truncateStringToByteSize(
  str: string,
  targetJsonBytes: number,
): string {
  const indicatorBytes = encoder.encode(
    JSON.stringify(TRUNCATION_INDICATOR),
  ).length;
  // JSON wraps strings in quotes + escaping; 2 bytes for the quotes themselves
  const overhead = 2 + indicatorBytes;
  const budget = Math.max(0, targetJsonBytes - overhead);

  const encoded = encoder.encode(str);
  if (encoded.length <= budget) return str;

  // Slice raw bytes and decode; {fatal:false} replaces partial chars with U+FFFD
  let sliced = decoder.decode(encoded.slice(0, budget));

  // Drop trailing replacement character if the slice broke a multi-byte char
  if (sliced.endsWith('\uFFFD')) sliced = sliced.slice(0, sliced.length - 1);

  return sliced + TRUNCATION_INDICATOR;
}

/**
 * Cap tool output to prevent context bloat
 *
 * @param output - The tool output to cap
 * @param options - Capping configuration
 * @returns Capped output with metadata
 *
 * @example
 * ```typescript
 * const result = capToolOutput(
 *   { matches: [...1000 matches...] },
 *   { maxBytes: 40 * 1024, maxItems: 200 }
 * );
 * ```
 */
export function capToolOutput<T>(
  output: T,
  options?: CapToolOutputOptions,
): CappedToolOutput<T> {
  // Default to 40KB if maxBytes is not specified
  const { maxBytes = 40 * 1024, maxItems } = options || {};

  // Calculate original size and item count
  const originalSize = calculateJsonByteSize(output);
  const itemCount = countItems(output);

  // Check if both limits are satisfied
  const withinByteLimit = originalSize <= maxBytes;
  const withinItemLimit = maxItems === undefined || itemCount <= maxItems;

  // If under both limits, return as-is
  if (withinByteLimit && withinItemLimit) {
    return {
      result: output,
      truncated: false,
      originalSize,
      cappedSize: originalSize,
      itemsRemoved: 0,
    };
  }

  // Output exceeds at least one limit - need to truncate
  let cappedResult: T = output;
  let itemsRemoved = 0;

  // PHASE 1: Apply item count truncation if maxItems is specified and exceeded
  if (maxItems !== undefined) {
    // Handle direct arrays
    if (Array.isArray(output) && output.length > maxItems) {
      itemsRemoved = output.length - maxItems;
      cappedResult = output.slice(0, maxItems) as T;
    }
    // Handle objects with array properties (common pattern in tool results)
    else if (typeof cappedResult === 'object' && cappedResult !== null) {
      const obj = cappedResult as Record<string, unknown>;

      // Truncate all array properties to maxItems
      for (const [key, value] of Object.entries(obj))
        if (Array.isArray(value)) {
          const originalLength = value.length;
          if (originalLength > maxItems) {
            obj[key] = value.slice(0, maxItems);
            itemsRemoved += originalLength - maxItems;
          }
        }
    }
  }

  // Recalculate size after item truncation
  let currentSize = calculateJsonByteSize(cappedResult);

  // PHASE 2: Apply byte size truncation if still over maxBytes
  if (currentSize > maxBytes) {
    // Handle direct strings
    if (typeof cappedResult === 'string') {
      cappedResult = truncateStringToByteSize(cappedResult, maxBytes) as T;
      currentSize = calculateJsonByteSize(cappedResult);
    }
    // Handle direct arrays
    else if (Array.isArray(cappedResult)) {
      // Binary search for the right number of items that fit in maxBytes
      let low = 0;
      let high = cappedResult.length;
      let bestCount = 0;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const testResult = cappedResult.slice(0, mid);
        const testSize = calculateJsonByteSize(testResult);

        if (testSize <= maxBytes) {
          bestCount = mid;
          low = mid + 1;
        } else high = mid - 1;
      }

      const beforeByteTruncation = cappedResult.length;
      itemsRemoved += beforeByteTruncation - bestCount;
      cappedResult = cappedResult.slice(0, bestCount) as T;
      currentSize = calculateJsonByteSize(cappedResult);
    }
    // Handle objects with array properties
    else if (typeof cappedResult === 'object' && cappedResult !== null) {
      const obj = cappedResult as Record<string, unknown>;

      // Find array properties and progressively truncate them
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value) && value.length > 0) {
          // Binary search for right size
          let low = 0;
          let high = value.length;
          let bestCount = 0;

          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const testObj = { ...obj, [key]: value.slice(0, mid) };
            const testSize = calculateJsonByteSize(testObj);

            if (testSize <= maxBytes) {
              bestCount = mid;
              low = mid + 1;
            } else high = mid - 1;
          }

          const beforeByteTruncation = value.length;
          obj[key] = value.slice(0, bestCount);
          itemsRemoved += beforeByteTruncation - bestCount;
          currentSize = calculateJsonByteSize(cappedResult);

          // Check if we're under limit now
          if (currentSize <= maxBytes) break;
        }
      }

      // If still over limit, truncate string properties (largest first)
      if (currentSize > maxBytes) {
        const stringEntries = Object.entries(obj)
          .filter(([, v]) => typeof v === 'string')
          .map(([k, v]) => ({
            key: k,
            byteSize: encoder.encode(v as string).length,
          }))
          .sort((a, b) => b.byteSize - a.byteSize);

        for (const { key } of stringEntries) {
          const strValue = obj[key] as string;
          const otherSize = currentSize - calculateJsonByteSize(strValue);
          const budgetForProp = Math.max(0, maxBytes - otherSize);
          obj[key] = truncateStringToByteSize(strValue, budgetForProp);
          currentSize = calculateJsonByteSize(cappedResult);
          if (currentSize <= maxBytes) break;
        }
      }
    }
  }

  const cappedSize = calculateJsonByteSize(cappedResult);

  return {
    result: cappedResult,
    truncated: true,
    originalSize,
    cappedSize,
    itemsRemoved,
  };
}

/**
 * Truncate a string preview to a maximum character length
 *
 * @param preview - The preview string to truncate
 * @param maxLength - Maximum length in characters
 * @param indicator - Truncation indicator to append
 * @returns Truncated string
 */
export function truncatePreview(
  preview: string,
  maxLength: number,
  indicator = '...',
): string {
  if (preview.length <= maxLength) return preview;

  return preview.substring(0, maxLength - indicator.length) + indicator;
}

/**
 * Format a truncation message with helpful guidance
 *
 * @param itemsRemoved - Number of items that were removed
 * @param originalCount - Original number of items
 * @param suggestions - Array of suggestions for narrowing results
 * @returns Formatted message
 */
export function formatTruncationMessage(
  itemsRemoved: number,
  originalCount: number,
  suggestions: string[],
): string {
  const lines = [
    `\n[Results truncated: showing ${originalCount - itemsRemoved} of ${originalCount} items]`,
    'To see all results, try:',
    ...suggestions.map((s) => `  - ${s}`),
  ];
  return lines.join('\n');
}

/**
 * Extracts a human-readable error message from an Eden Treaty error object.
 * Eden errors have the shape `{ status: number, value: { error: string, message: string } }`.
 * Falls back to JSON.stringify, then String().
 */
export function extractEdenErrorMessage(
  error: { status?: number; value?: unknown } | unknown,
): string {
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    const value = obj.value;
    if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, unknown>;
      if (typeof v.message === 'string') {
        return v.message;
      }
    }
    try {
      return JSON.stringify(error);
    } catch {
      // fall through
    }
  }
  return String(error);
}

export function rethrowCappedToolOutputError(error: unknown): never {
  if (error instanceof Error)
    throw new Error(
      capToolOutput(error.message, {
        maxBytes: 10 * 1024, // 10KB
      }).result,
    );

  if (!error) throw new Error('Unknown error');

  try {
    const message = String(error);
    throw new Error(capToolOutput(message, { maxBytes: 10 * 1024 }).result);
  } catch {
    try {
      const message = JSON.stringify(error);
      throw new Error(capToolOutput(message, { maxBytes: 10 * 1024 }).result);
    } catch {
      throw new Error('Unknown error');
    }
  }
}

/**
 * Checks if a file is within the specified size limit
 * @param clientRuntime The client runtime instance
 * @param filePath The file path to check
 * @param maxSize Maximum allowed file size in bytes
 * @returns Object with isWithinLimit boolean and fileSize if available
 */
export async function checkFileSize(
  clientRuntime: ClientRuntimeNode,
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
 * Result of capturing file state for diff-history.
 * Discriminated union based on isExternal flag.
 */
export type FileStateResult =
  | { isExternal: false; content: string | null }
  | { isExternal: true; tempPath: string | null };

/**
 * Captures the current state of a file for diff-history tracking.
 * Handles binary and large files by copying them to temp files.
 *
 * @param filePath - Absolute path to the file
 * @param tempDir - Directory to store temp files for external content
 * @returns FileStateResult with either content (text) or tempPath (binary/large)
 *
 * - If file doesn't exist: returns { isExternal: false, content: null }
 * - If file is binary or > MAX_DIFF_TEXT_FILE_SIZE: copies to temp, returns { isExternal: true, tempPath }
 * - Otherwise: reads as text, returns { isExternal: false, content }
 */
export async function captureFileState(
  filePath: string,
  tempDir: string,
): Promise<FileStateResult> {
  // Check if file exists
  try {
    await fs.access(filePath);
  } catch {
    // File doesn't exist - return null content (for creations)
    return { isExternal: false, content: null };
  }

  // Get file stats to check size
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;

  // Check if file is too large (needs to be external)
  if (fileSize > MAX_DIFF_TEXT_FILE_SIZE) {
    const tempPath = path.join(tempDir, `capture-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
    await fs.copyFile(filePath, tempPath);
    return { isExternal: true, tempPath };
  }

  // Read file content as buffer for binary detection
  const buffer = await fs.readFile(filePath);

  // Check if file is binary
  if (await isBinaryFile(buffer)) {
    const tempPath = path.join(tempDir, `capture-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(tempPath, buffer);
    return { isExternal: true, tempPath };
  }

  // File is text and within size limit
  const content = buffer.toString('utf-8');
  return { isExternal: false, content };
}

/**
 * Cleans up temporary files created by captureFileState.
 * Safe to call even if the file doesn't exist.
 *
 * @param tempPath - Path to the temp file to clean up
 */
export async function cleanupTempFile(tempPath: string | null): Promise<void> {
  if (!tempPath) return;
  try {
    await fs.unlink(tempPath);
  } catch {
    // Ignore errors - file may not exist or already be cleaned up
  }
}

/**
 * The content portion of an AgentFileEdit, ready to be spread into the full edit object.
 * Discriminated union matching the AgentFileEdit type from diff-history.
 */
export type AgentFileEditContent =
  | {
      isExternal: false;
      contentBefore: string | null;
      contentAfter: string | null;
    }
  | {
      isExternal: true;
      tempPathToBeforeContent: string | null;
      tempPathToAfterContent: string | null;
    };

/**
 * Result of building an AgentFileEdit, including any temp files that need cleanup.
 */
export interface AgentFileEditResult {
  /** The content portion of the AgentFileEdit, ready to spread */
  editContent: AgentFileEditContent;
  /** Temp files created that should be cleaned up after registerAgentEdit is called */
  tempFilesToCleanup: string[];
}

/**
 * Builds the content portion of an AgentFileEdit from before/after file states.
 *
 * Handles the complexity of:
 * - Both states being text: returns inline content
 * - Either state being external: converts both to external format
 * - Mixed states: writes text content to temp files for external handling
 *
 * @param beforeState - The file state before the modification
 * @param afterState - The file state after the modification
 * @param tempDir - Directory to create temp files in (for converting text to external)
 * @returns AgentFileEditResult with the edit content and temp files to clean up
 *
 * @example
 * ```typescript
 * const before = await captureFileState(filePath, tempDir);
 * // ... perform file modification ...
 * const after = await captureFileState(filePath, tempDir);
 *
 * const { editContent, tempFilesToCleanup } = await buildAgentFileEditContent(
 *   before,
 *   after,
 *   tempDir
 * );
 *
 * await diffHistoryService.registerAgentEdit({
 *   agentInstanceId,
 *   path: filePath,
 *   toolCallId,
 *   ...editContent,
 * });
 *
 * // Clean up temp files after registration
 * for (const tempFile of tempFilesToCleanup) {
 *   await cleanupTempFile(tempFile);
 * }
 * ```
 */
export async function buildAgentFileEditContent(
  beforeState: FileStateResult,
  afterState: FileStateResult,
  tempDir: string,
): Promise<AgentFileEditResult> {
  const tempFilesToCleanup: string[] = [];

  // Track temp files from capture that need cleanup
  if (beforeState.isExternal && beforeState.tempPath)
    tempFilesToCleanup.push(beforeState.tempPath);

  if (afterState.isExternal && afterState.tempPath)
    tempFilesToCleanup.push(afterState.tempPath);

  // If neither state is external, return inline content (simple case)
  if (!beforeState.isExternal && !afterState.isExternal) {
    return {
      editContent: {
        isExternal: false,
        contentBefore: beforeState.content,
        contentAfter: afterState.content,
      },
      tempFilesToCleanup,
    };
  }

  // At least one state is external - we need to use external format for both
  let tempPathBefore: string | null = null;
  let tempPathAfter: string | null = null;

  // Handle before state
  // Already external - use the temp path directly
  if (beforeState.isExternal) tempPathBefore = beforeState.tempPath;
  else if (beforeState.content !== null) {
    // Text content that needs to be converted to temp file
    const tempPath = path.join(tempDir, `convert-before-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(tempPath, beforeState.content, 'utf-8');
    tempPathBefore = tempPath;
    tempFilesToCleanup.push(tempPath);
  }
  // else: beforeState.content is null (file didn't exist) - tempPathBefore stays null

  // Handle after state
  // Already external - use the temp path directly
  if (afterState.isExternal) tempPathAfter = afterState.tempPath;
  else if (afterState.content !== null) {
    // Text content that needs to be converted to temp file
    const tempPath = path.join(tempDir, `convert-after-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(tempPath, afterState.content, 'utf-8');
    tempPathAfter = tempPath;
    tempFilesToCleanup.push(tempPath);
  }
  // else: afterState.content is null (file was deleted) - tempPathAfter stays null

  return {
    editContent: {
      isExternal: true,
      tempPathToBeforeContent: tempPathBefore,
      tempPathToAfterContent: tempPathAfter,
    },
    tempFilesToCleanup,
  };
}
