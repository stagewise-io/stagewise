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
      part.output &&
      'hiddenMetadata' in part.output &&
      'before' in part.output.hiddenMetadata.diff &&
      'after' in part.output.hiddenMetadata.diff &&
      part.output.hiddenMetadata?.diff
        ? diffLines(
            part.output.hiddenMetadata.diff.before,
            part.output.hiddenMetadata.diff.after,
          )
        : [],
    [part.output],
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
        <div className="flex flex-row items-center justify-between gap-3 truncate">
          <span>{getTruncatedFileUrl(part.input?.file_path ?? '')}</span>
          <div className="flex shrink-0 flex-row items-center gap-2 font-medium text-xs">
            <span className="shrink-0 text-green-600">+{newLineCount}</span>
            <span className="shrink-0 text-rose-600">-{deletedLineCount}</span>
          </div>
        </div>
      }
      collapsedContent={
        part.output &&
        'hiddenMetadata' in part.output &&
        part.output.hiddenMetadata?.diff &&
        (!part.output.hiddenMetadata.diff.afterOmitted &&
        !part.output.hiddenMetadata.diff.beforeOmitted ? (
          <DiffPreview diff={diff} />
        ) : (
          <span>Diff content omitted (file too large)</span>
        ))
      }
    />
  );
};
