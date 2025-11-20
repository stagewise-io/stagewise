import type { ToolPart } from '@stagewise/karton-contract';
import { IDE_LOGOS } from '@/assets/ide-logos';
import { DiffPreview, ToolPartUIBase } from './_shared';
import { usePostHog } from 'posthog-js/react';
import { FileIcon, MaximizeIcon, MinimizeIcon, PencilIcon } from 'lucide-react';
import { getTruncatedFileUrl } from '@/utils';
import { useFileIDEHref } from '@/hooks/use-file-ide-href';
import { diffLines } from 'diff';
import { useMemo, useState } from 'react';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { useKartonState } from '@/hooks/use-karton';
import { IDE_SELECTION_ITEMS } from '@/utils';

export const MultiEditToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-multiEditTool' }>;
}) => {
  const { getFileIDEHref } = useFileIDEHref();
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

  const posthog = usePostHog();

  const newLineCount = useMemo(
    () =>
      diff
        ?.filter((line) => line.added)
        .reduce((acc, line) => acc + (line.count ?? 0), 0) ?? 0,
    [diff],
  );
  const deletedLineCount = useMemo(
    () =>
      diff
        ?.filter((line) => line.removed)
        .reduce((acc, line) => acc + (line.count ?? 0), 0) ?? 0,
    [diff],
  );

  const startLineWithDiff = useMemo(() => {
    let startLine = 1;
    for (const line of diff ?? []) {
      if (line.added || line.removed) return startLine;
      startLine += line.count;
    }
    return startLine;
  }, [diff]);

  const [collapsedDiffView, setCollapsedDiffView] = useState(true);

  const openInIdeSelection = useKartonState(
    (s) => s.globalConfig.openFilesInIde,
  );

  return (
    <ToolPartUIBase
      part={part}
      toolIcon={<PencilIcon className="size-3" />}
      toolName={`Editing file...`}
      toolSubtitle={
        <div className="flex flex-row items-center justify-start gap-3">
          <span>{getTruncatedFileUrl(part.input?.relative_path ?? '')}</span>
          <div className="@[320px]:flex hidden shrink-0 flex-row items-center gap-2 font-medium text-xs">
            {diff && (
              <>
                <span className="shrink-0 text-success">+{newLineCount}</span>
                <span className="shrink-0 text-error">-{deletedLineCount}</span>
              </>
            )}
          </div>
        </div>
      }
      collapsedContent={
        diff && (deletedLineCount > 0 || newLineCount > 0) ? (
          <div className="flex max-h-64 flex-col items-end gap-0.5">
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
                href={getFileIDEHref(
                  part.input?.relative_path ?? '',
                  startLineWithDiff,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ size: 'xs', variant: 'ghost' })}
                onClick={() => {
                  posthog.capture(
                    'agent_file_opened_in_ide_via_multi_edit_tool',
                    {
                      file_path: part.input?.relative_path ?? '',
                      ide: IDE_SELECTION_ITEMS[openInIdeSelection],
                    },
                  );
                }}
              >
                {openInIdeSelection !== 'other' ? (
                  <img
                    src={IDE_LOGOS[openInIdeSelection]}
                    alt={IDE_SELECTION_ITEMS[openInIdeSelection]}
                    className="size-3 shrink-0"
                  />
                ) : (
                  <FileIcon className="size-3 shrink-0" />
                )}
                Open file
              </a>
            </div>
            <DiffPreview
              diff={diff}
              filePath={part.input?.relative_path ?? ''}
              collapsed={collapsedDiffView}
            />
          </div>
        ) : undefined
      }
      defaultExpanded
    />
  );
};
