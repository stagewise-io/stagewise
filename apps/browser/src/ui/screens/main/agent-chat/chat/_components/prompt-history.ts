export type PromptHistoryDirection = 'older' | 'newer';

export type PromptHistoryStep =
  | { handled: false }
  | { handled: true; cursor: number | null };

/**
 * Resolve a shell-style history step. A null cursor means history navigation
 * is inactive; moving newer from the latest entry returns to an empty input.
 */
export function getPromptHistoryStep(options: {
  direction: PromptHistoryDirection;
  cursor: number | null;
  entryCount: number;
  canStart: boolean;
}): PromptHistoryStep {
  const { direction, cursor, entryCount, canStart } = options;
  if (entryCount === 0) return { handled: false };

  if (cursor === null) {
    if (direction === 'newer' || !canStart) return { handled: false };
    return { handled: true, cursor: entryCount - 1 };
  }

  const boundedCursor = Math.min(cursor, entryCount - 1);
  if (direction === 'older') {
    return { handled: true, cursor: Math.max(0, boundedCursor - 1) };
  }

  if (boundedCursor === entryCount - 1) {
    return { handled: true, cursor: null };
  }

  return { handled: true, cursor: boundedCursor + 1 };
}
