import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isBinaryFile } from 'isbinaryfile';
import { MAX_DIFF_TEXT_FILE_SIZE } from '../../types/diff-history';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from '../../fs';

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

function calculateJsonByteSize(value: unknown): number {
  const json = JSON.stringify(value);
  return new TextEncoder().encode(json).length;
}

function countItems(value: unknown): number {
  if (typeof value === 'string') return value.length > 0 ? 1 : 0;
  if (Array.isArray(value)) return value.length;

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    let totalItems = 0;
    for (const propValue of Object.values(obj))
      if (Array.isArray(propValue)) totalItems += propValue.length;
    return totalItems;
  }

  return 0;
}

const TRUNCATION_INDICATOR = '\n... [truncated]';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function truncateStringToByteSize(
  str: string,
  targetJsonBytes: number,
): string {
  const indicatorBytes = encoder.encode(
    JSON.stringify(TRUNCATION_INDICATOR),
  ).length;
  const overhead = 2 + indicatorBytes;
  const budget = Math.max(0, targetJsonBytes - overhead);

  const encoded = encoder.encode(str);
  if (encoded.length <= budget) return str;

  let sliced = decoder.decode(encoded.slice(0, budget));
  if (sliced.endsWith('\uFFFD')) sliced = sliced.slice(0, sliced.length - 1);
  return sliced + TRUNCATION_INDICATOR;
}

export function capToolOutput<T>(
  output: T,
  options?: CapToolOutputOptions,
): CappedToolOutput<T> {
  const { maxBytes = 40 * 1024, maxItems } = options || {};
  const originalSize = calculateJsonByteSize(output);
  const itemCount = countItems(output);
  const withinByteLimit = originalSize <= maxBytes;
  const withinItemLimit = maxItems === undefined || itemCount <= maxItems;

  if (withinByteLimit && withinItemLimit) {
    return {
      result: output,
      truncated: false,
      originalSize,
      cappedSize: originalSize,
      itemsRemoved: 0,
    };
  }

  let cappedResult: T = output;
  let itemsRemoved = 0;

  if (maxItems !== undefined) {
    if (Array.isArray(output) && output.length > maxItems) {
      itemsRemoved = output.length - maxItems;
      cappedResult = output.slice(0, maxItems) as T;
    } else if (typeof cappedResult === 'object' && cappedResult !== null) {
      const obj = cappedResult as Record<string, unknown>;
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
          const originalLength = value.length;
          if (originalLength > maxItems) {
            obj[key] = value.slice(0, maxItems);
            itemsRemoved += originalLength - maxItems;
          }
        }
      }
    }
  }

  let currentSize = calculateJsonByteSize(cappedResult);

  if (currentSize > maxBytes) {
    if (typeof cappedResult === 'string') {
      cappedResult = truncateStringToByteSize(cappedResult, maxBytes) as T;
      currentSize = calculateJsonByteSize(cappedResult);
    } else if (Array.isArray(cappedResult)) {
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
    } else if (typeof cappedResult === 'object' && cappedResult !== null) {
      const obj = cappedResult as Record<string, unknown>;

      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value) && value.length > 0) {
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
          if (currentSize <= maxBytes) break;
        }
      }

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

export function truncatePreview(
  preview: string,
  maxLength: number,
  indicator = '...',
): string {
  if (preview.length <= maxLength) return preview;
  return preview.substring(0, maxLength - indicator.length) + indicator;
}

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

export function rethrowCappedToolOutputError(error: unknown): never {
  if (error instanceof Error) {
    throw new Error(
      capToolOutput(error.message, {
        maxBytes: 10 * 1024,
      }).result,
    );
  }

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

export type FileStateResult =
  | { isExternal: false; content: string | null }
  | { isExternal: true; tempPath: string | null };

export async function captureFileState(
  filePath: string,
  tempDir: string,
): Promise<FileStateResult> {
  try {
    await access(filePath);
  } catch {
    return { isExternal: false, content: null };
  }

  const stats = await stat(filePath);
  if (stats.size > MAX_DIFF_TEXT_FILE_SIZE) {
    const tempPath = path.join(tempDir, `capture-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    await copyFile(filePath, tempPath);
    return { isExternal: true, tempPath };
  }

  const buffer = await readFile(filePath);
  if (await isBinaryFile(buffer)) {
    const tempPath = path.join(tempDir, `capture-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    await writeFile(tempPath, buffer);
    return { isExternal: true, tempPath };
  }

  return { isExternal: false, content: buffer.toString('utf-8') };
}

export async function cleanupTempFile(tempPath: string | null): Promise<void> {
  if (!tempPath) return;
  try {
    await unlink(tempPath);
  } catch {
    // Ignore errors - file may not exist or already be cleaned up.
  }
}

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

export interface AgentFileEditResult {
  editContent: AgentFileEditContent;
  tempFilesToCleanup: string[];
}

export async function buildAgentFileEditContent(
  beforeState: FileStateResult,
  afterState: FileStateResult,
  tempDir: string,
): Promise<AgentFileEditResult> {
  const tempFilesToCleanup: string[] = [];

  if (beforeState.isExternal && beforeState.tempPath)
    tempFilesToCleanup.push(beforeState.tempPath);
  if (afterState.isExternal && afterState.tempPath)
    tempFilesToCleanup.push(afterState.tempPath);

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

  let tempPathBefore: string | null = null;
  let tempPathAfter: string | null = null;

  if (beforeState.isExternal) tempPathBefore = beforeState.tempPath;
  else if (beforeState.content !== null) {
    const tempPath = path.join(tempDir, `convert-before-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    await writeFile(tempPath, beforeState.content, 'utf-8');
    tempPathBefore = tempPath;
    tempFilesToCleanup.push(tempPath);
  }

  if (afterState.isExternal) tempPathAfter = afterState.tempPath;
  else if (afterState.content !== null) {
    const tempPath = path.join(tempDir, `convert-after-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    await writeFile(tempPath, afterState.content, 'utf-8');
    tempPathAfter = tempPath;
    tempFilesToCleanup.push(tempPath);
  }

  return {
    editContent: {
      isExternal: true,
      tempPathToBeforeContent: tempPathBefore,
      tempPathToAfterContent: tempPathAfter,
    },
    tempFilesToCleanup,
  };
}
