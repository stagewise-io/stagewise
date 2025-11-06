import type { ToolPart } from '@stagewise/karton-contract';
import { DiffPreview, ToolPartUIBase } from './_shared';
import { PencilIcon } from 'lucide-react';
import { getTruncatedFileUrl } from '@/utils';
import { useMemo } from 'react';
import { diffLines } from 'diff';

export const OverwriteFileToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-overwriteFileTool' }>;
}) => {
  const diff = useMemo(
    () =>
      part.output?.hiddenMetadata
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
      toolName={`Overwriting file...`}
      toolSubtitle={
        <div className="flex flex-row items-center justify-start gap-3">
          <span>{getTruncatedFileUrl(part.input?.path ?? '')}</span>
          <div className="flex shrink-0 flex-row items-center gap-2 font-medium text-xs">
            {diff && (
              <>
                <span className="shrink-0 text-green-600">+{newLineCount}</span>
                <span className="shrink-0 text-rose-600">
                  -{deletedLineCount}
                </span>
              </>
            )}
          </div>
        </div>
      }
      collapsedContent={
        diff ? (
          <DiffPreview diff={diff} filePath={part.input?.path ?? ''} />
        ) : undefined
      }
    />
  );
};
