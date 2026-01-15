import type { ToolPart } from '@shared/karton-contracts/ui';
import { DiffPreview } from './shared/diff-preview';
import { FileIcon } from './shared/file-icon';
import { usePostHog } from 'posthog-js/react';
import {
  Loader2Icon,
  XIcon,
  ListChevronsDownUpIcon,
  ListChevronsUpDownIcon,
} from 'lucide-react';
import { cn } from '@/utils';
import { useFileIDEHref } from '@/hooks/use-file-ide-href';
import { diffLines } from 'diff';
import { useMemo, useState, useEffect } from 'react';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { useKartonState } from '@/hooks/use-karton';
import { IDE_SELECTION_ITEMS } from '@/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import { ToolPartUI } from './shared/tool-part-ui';
import { IdeLogo } from '@/components/ide-logo';
import {
  StreamingCodeBlock,
  getLanguageFromPath,
} from '@ui/components/ui/streaming-code-block';

export const MultiEditToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-multiEditTool' }>;
}) => {
  const [expanded, setExpanded] = useState(true);
  const { getFileIDEHref } = useFileIDEHref();
  const diff = useMemo(
    () =>
      part.output?.hiddenFromLLM?.diff
        ? diffLines(
            part.output?.hiddenFromLLM?.diff.before ?? '',
            part.output?.hiddenFromLLM?.diff.after ?? '',
          )
        : null,
    [part.output?.hiddenFromLLM],
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

  const streaming = useMemo(() => {
    return part.state === 'input-streaming' || part.state === 'input-available';
  }, [part.state]);

  const state = useMemo(() => {
    if (streaming) return 'streaming';
    if (part.state === 'output-error') return 'error';
    return 'success';
  }, [part.state, streaming]);

  const path = useMemo(() => {
    if (!part.input?.relative_path) return null;
    return part.input?.relative_path;
  }, [part.input?.relative_path]);

  // Force expanded to false when in error state
  useEffect(() => {
    if (state === 'error') {
      setExpanded(false);
    }
  }, [state]);

  const firstLineNumberEdited = useMemo(() => {
    let startLine = 1;
    for (const line of diff ?? []) {
      if (line.added || line.removed) return startLine;
      startLine += line.count;
    }
    return startLine;
  }, [diff]);

  const hasNewContent = useMemo(() => {
    return part.input?.edits?.some((edit) => edit.new_string?.length > 10);
  }, [part.input?.edits]);

  const [collapsedDiffView, setCollapsedDiffView] = useState(true);

  const openInIdeSelection = useKartonState(
    (s) => s.globalConfig.openFilesInIde,
  );

  const trigger = useMemo(() => {
    if (state === 'error')
      return (
        <ErrorHeader
          relativePath={path ?? undefined}
          errorText={part.errorText ?? undefined}
        />
      );
    else if (streaming)
      return <LoadingHeader relativePath={path ?? undefined} />;
    else
      return (
        <SuccessHeader
          relativePath={path ?? undefined}
          newLineCount={newLineCount}
          deletedLineCount={deletedLineCount}
        />
      );
  }, [state, streaming, path, newLineCount, deletedLineCount, part.errorText]);

  const content = useMemo(() => {
    if (state === 'error') return undefined;
    else if (state === 'success' && diff)
      return (
        <DiffPreview
          diff={diff}
          filePath={part.input?.relative_path ?? ''}
          collapsed={collapsedDiffView}
        />
      );
    else if (hasNewContent && streaming && !diff)
      return (
        <StreamingCodeBlock
          code={
            part.input.edits
              .map((edit) => edit?.new_string ?? '')
              .join('\n\n') ?? ''
          }
          language={getLanguageFromPath(part.input?.relative_path)}
        />
      );
    else return undefined;
  }, [
    state,
    diff,
    part.input?.edits,
    part.input?.relative_path,
    streaming,
    hasNewContent,
    collapsedDiffView,
  ]);

  return (
    <ToolPartUI
      showBorder={true}
      expanded={expanded}
      setExpanded={setExpanded}
      trigger={trigger}
      content={content}
      contentClassName={cn(streaming ? 'max-h-24' : 'max-h-56')}
      contentFooter={
        state === 'success' ? (
          <div className="flex w-full flex-row items-center justify-between">
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    posthog.capture(
                      'agent_code_diff_expanded_via_multi_edit_tool',
                      {
                        file_path: part.input?.relative_path ?? '',
                        ide: IDE_SELECTION_ITEMS[openInIdeSelection],
                      },
                    );
                    setCollapsedDiffView(!collapsedDiffView);
                  }}
                >
                  {collapsedDiffView ? (
                    <ListChevronsUpDownIcon className={cn('size-3 shrink-0')} />
                  ) : (
                    <ListChevronsDownUpIcon className={cn('size-3 shrink-0')} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {collapsedDiffView ? 'Expand code diff' : 'Collapse code diff'}
              </TooltipContent>
            </Tooltip>
            <a
              href={getFileIDEHref(
                part.input?.relative_path ?? '',
                firstLineNumberEdited,
              )}
              onClick={() => {
                posthog.capture(
                  'agent_file_opened_in_ide_via_multi_edit_tool',
                  {
                    file_path: part.input?.relative_path ?? '',
                    ide: IDE_SELECTION_ITEMS[openInIdeSelection],
                  },
                );
              }}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ size: 'xs', variant: 'ghost' }),
                'shrink-0',
              )}
            >
              <Tooltip>
                <TooltipTrigger>
                  <div className="flex flex-row items-center justify-center gap-1">
                    <IdeLogo
                      ide={openInIdeSelection}
                      className="size-3 shrink-0"
                    />
                    <span className="text-xs">Open file</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {getFileIDEHref(
                    part.input?.relative_path ?? '',
                    firstLineNumberEdited,
                  )}
                </TooltipContent>
              </Tooltip>
            </a>
          </div>
        ) : undefined
      }
      contentFooterClassName="px-0"
    />
  );
};

const ErrorHeader = ({
  relativePath,
  errorText,
}: {
  relativePath?: string;
  errorText?: string;
}) => {
  const errorTextContent = errorText
    ? errorText
    : relativePath
      ? `Error editing ${relativePath}`
      : 'Error editing file';

  return (
    <div className="flex flex-row items-center justify-start gap-1">
      <XIcon className="size-3 shrink-0" />
      <Tooltip>
        <TooltipTrigger>
          <span className="min-w-0 flex-1 truncate text-xs">
            {errorTextContent}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{errorTextContent}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

const SuccessHeader = ({
  relativePath,
  newLineCount,
  deletedLineCount,
}: {
  relativePath?: string;
  newLineCount: number;
  deletedLineCount: number;
}) => {
  const fileName = relativePath?.split('/').pop() ?? relativePath;

  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1">
      <div className="pointer-events-auto flex flex-row items-center justify-start gap-1">
        <FileIcon filePath={relativePath ?? ''} className="size-5 shrink-0" />
        <Tooltip>
          <TooltipTrigger>
            <span className="min-w-0 truncate text-xs" dir="rtl">
              <span
                className="items-center gap-0.5 text-foreground text-xs group-hover/trigger:text-hover-derived"
                dir="ltr"
              >
                {fileName}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{relativePath ?? ''}</TooltipContent>
        </Tooltip>
      </div>
      {newLineCount > 0 && (
        <span className="shrink-0 text-success-foreground text-xs group-hover/trigger:text-hover-derived">
          +{newLineCount}
        </span>
      )}
      {deletedLineCount > 0 && (
        <span className="shrink-0 text-error-foreground text-xs group-hover/trigger:text-hover-derived">
          -{deletedLineCount}
        </span>
      )}
    </div>
  );
};

const LoadingHeader = ({ relativePath }: { relativePath?: string }) => {
  const fileName = relativePath?.split('/').pop() ?? relativePath;

  return (
    <div className="flex flex-row items-center justify-start gap-1">
      <Loader2Icon className="size-3 shrink-0 animate-spin text-primary" />
      {relativePath !== null ? (
        <Tooltip>
          <TooltipTrigger>
            <span className="min-w-0 flex-1 truncate text-xs" dir="rtl">
              <span dir="ltr" className="shimmer-text-primary">
                {fileName}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{relativePath ?? ''}</TooltipContent>
        </Tooltip>
      ) : (
        <Skeleton className="h-3 w-16" variant="text" />
      )}
    </div>
  );
};
