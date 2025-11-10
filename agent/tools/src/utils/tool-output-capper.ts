/**
 * Utility for capping tool output sizes to prevent LLM context bloat
 *
 * Tools can return massive amounts of data (thousands of grep matches, file paths, etc.)
 * This utility ensures outputs stay within reasonable size limits while providing
 * helpful guidance to the agent on how to narrow results.
 */

export interface CapToolOutputOptions {
  /** Maximum size in bytes for the serialized output */
  maxBytes: number;
  /** Message to append when results are truncated */
  truncationMessage?: string;
  /** Maximum number of items to return (for arrays) */
  maxItems?: number;
}

export interface CappedToolOutput<T> {
  /** The capped result (may be truncated) */
  result: T;
  /** Whether the output was truncated */
  truncated: boolean;
  /** Original size in bytes before capping */
  originalSize: number;
  /** Final size in bytes after capping */
  cappedSize: number;
  /** Number of items removed (if applicable) */
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
 *   { maxBytes: 100 * 1024, maxItems: 200 }
 * );
 * ```
 */
export function capToolOutput<T>(
  output: T,
  options: CapToolOutputOptions,
): CappedToolOutput<T> {
  const { maxBytes, maxItems } = options;

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
    // Handle direct arrays
    if (Array.isArray(cappedResult)) {
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
