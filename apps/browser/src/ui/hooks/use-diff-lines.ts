import { useMemo } from 'react';
import { diffLines } from 'diff';
import type { ChangeObject } from 'diff';

export function useDiffLines(
  before: string | null | undefined,
  after: string | null | undefined,
): ChangeObject<string>[] | null {
  return useMemo(() => {
    if (before == null && after == null) return null;
    return diffLines(before ?? '', after ?? '');
  }, [before, after]);
}
