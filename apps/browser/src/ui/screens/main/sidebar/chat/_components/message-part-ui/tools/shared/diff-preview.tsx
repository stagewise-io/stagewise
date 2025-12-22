import { useMemo, memo } from 'react';
import type { ChangeObject } from 'diff';
import {
  CodeBlock,
  lineAddedDiffMarker,
  lineRemovedDiffMarker,
} from '@/components/ui/code-block';
import type { BundledLanguage } from 'shiki';

export const DiffPreview = memo(
  ({
    diff,
    filePath,
    collapsed = false,
  }: {
    diff: ChangeObject<string>[];
    filePath: string;
    collapsed?: boolean;
  }) => {
    const diffContent = useMemo(() => {
      return diff.reduce((acc, lines) => {
        const splitLines = lines.value.split('\n');
        const modifiedLines = splitLines
          .map((line, index) => {
            if (index === splitLines.length - 1 && line.length === 0) {
              // The last line should not be modified if it's empty
              return line;
            }
            return lines.added
              ? `${lineAddedDiffMarker}${line}`
              : lines.removed
                ? `${lineRemovedDiffMarker}${line}`
                : line;
          })
          .join('\n');
        return `${acc}${modifiedLines}`;
      }, '');
    }, [diff]);

    const fileLanguage = useMemo(() => {
      const filename = filePath.replace(/^.*[\\/]/, '');
      return (
        (filename?.split('.').pop()?.toLowerCase() as BundledLanguage) ??
        'markdown'
      );
    }, [filePath]);

    return (
      <CodeBlock
        code={diffContent}
        language={fileLanguage}
        hideActionButtons
        compactDiff={collapsed}
      />
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.diff.every(
        (line, index) => line.value === nextProps.diff[index]?.value,
      ) &&
      prevProps.filePath === nextProps.filePath &&
      prevProps.collapsed === nextProps.collapsed
    );
  },
);
