import type { ToolPart } from '@stagewise/karton-contract';
import { DiffPreview, ToolPartUIBase } from './_shared';
import { MinimizeIcon, MaximizeIcon, PencilIcon } from 'lucide-react';
import { getTruncatedFileUrl } from '@/utils';
import { useMemo, useState } from 'react';
import { diffLines } from 'diff';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';

import { IDE_SELECTION_ITEMS, getIDEFileUrl } from '@/utils';
import { useKartonState } from '@/hooks/use-karton';

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

  const [collapsedDiffView, setCollapsedDiffView] = useState(true);

  const openInIdeSelection = useKartonState(
    (s) => s.globalConfig.openFilesInIde,
  );

  const workspacePath = useKartonState((s) => s.workspace?.path);

  const absFilePath = useMemo(() => {
    return (
      (workspacePath?.replace('\\', '/') ?? '') +
      '/' +
      (part.input?.path?.replace('\\', '/') ?? '')
    );
  }, [workspacePath, part.input?.path]);

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
          <div className="flex max-h-64 flex-col items-stretch gap-0.5">
            <div className="flex shrink-0 flex-row items-center justify-end gap-0.5">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setCollapsedDiffView(!collapsedDiffView)}
              >
                {collapsedDiffView ? (
                  <MaximizeIcon className="size-3" />
                ) : (
                  <MinimizeIcon className="size-3" />
                )}
                {collapsedDiffView ? 'Show all lines' : 'Show changes only'}
              </Button>
              <a
                href={getIDEFileUrl(absFilePath, openInIdeSelection)}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ size: 'xs', variant: 'ghost' })}
              >
                Open in {IDE_SELECTION_ITEMS[openInIdeSelection]}
              </a>
            </div>
            <DiffPreview
              diff={diff}
              filePath={part.input?.path ?? ''}
              collapsed={collapsedDiffView}
            />
          </div>
        ) : undefined
      }
    />
  );
};
