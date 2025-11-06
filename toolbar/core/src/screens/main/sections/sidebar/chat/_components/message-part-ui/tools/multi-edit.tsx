import type { ToolPart } from '@stagewise/karton-contract';
import { DiffPreview, ToolPartUIBase } from './_shared';
import { PencilIcon } from 'lucide-react';
import { getTruncatedFileUrl } from '@/utils';
import { diffLines } from 'diff';
import { useMemo } from 'react';

export const MultiEditToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-multiEditTool' }>;
}) => {
  const diff = useMemo(
    () =>
      part.output?.hiddenMetadata?.diff
        ? diffLines(
            part.output?.hiddenMetadata?.diff.before ?? '',
            part.output?.hiddenMetadata?.diff.after ?? '',
          )
        : null,
    [part.output?.hiddenMetadata],
  );

  const newLineCount = useMemo(
    () => diff?.filter((line) => line.added).length ?? 0,
    [diff],
  );
  const deletedLineCount = useMemo(
    () => diff?.filter((line) => line.removed).length ?? 0,
    [diff],
  );

  return (
    <ToolPartUIBase
      part={part}
      toolIcon={<PencilIcon className="size-3" />}
      toolName={`Editing file...`}
      toolSubtitle={
        <div className="flex flex-row items-center justify-between gap-3">
          <span className="truncate">
            {getTruncatedFileUrl(part.input?.file_path ?? '')}
          </span>
          <div className="flex shrink-0 flex-row items-center gap-2 font-medium text-xs">
            <span className="shrink-0 text-green-600">+{newLineCount}</span>
            <span className="shrink-0 text-rose-600">-{deletedLineCount}</span>
          </div>
        </div>
      }
      collapsedContent={
        diff ? (
          <DiffPreview diff={diff} filePath={part.input?.file_path ?? ''} />
        ) : (
          <span>Diff view not available (not ready or too large)</span>
        )
      }
    />
  );
};
