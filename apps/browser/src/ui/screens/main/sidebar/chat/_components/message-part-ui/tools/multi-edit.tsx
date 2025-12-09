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

  const [collapsedDiffView, setCollapsedDiffView] = useState(true);

  const openInIdeSelection = useKartonState(
    (s) => s.globalConfig.openFilesInIde,
  );

  if (state === 'error') {
    return (
      <div className="group/exploring-part -mx-1 block min-w-32 rounded-xl border-border/20 bg-muted-foreground/5">
        <div className="flex h-6 cursor-default items-center gap-1 rounded-xl px-2.5 text-muted-foreground">
          <div className="flex w-full flex-row items-center justify-start gap-1">
            <ErrorHeader
              relativePath={path ?? undefined}
              errorText={part.errorText ?? undefined}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ToolPartUI
      expanded={expanded}
      setExpanded={setExpanded}
      trigger={
        <div className="flex w-full flex-row items-center justify-start gap-1">
          {streaming ? (
            <LoadingHeader relativePath={path ?? undefined} />
          ) : (
            <SuccessHeader
              relativePath={path ?? undefined}
              newLineCount={newLineCount}
              deletedLineCount={deletedLineCount}
            />
          )}
        </div>
      }
      content={
        <>
          {part.input?.edits && streaming && !diff && (
            <pre className="overflow-x-hidden whitespace-pre font-mono text-muted-foreground/75 text-xs">
              {part.input?.edits
                ?.map((edit) => edit?.new_string ?? '')
                .join('\n\n')}
            </pre>
          )}
          {state === 'success' && diff && (
            <DiffPreview
              diff={diff}
              filePath={part.input?.relative_path ?? ''}
              collapsed={collapsedDiffView}
            />
          )}
        </>
      }
      contentClassName={streaming ? 'max-h-24' : 'max-h-56'}
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
                    <ListChevronsUpDownIcon
                      className={cn('size-3 shrink-0 text-muted-foreground')}
                    />
                  ) : (
                    <ListChevronsDownUpIcon
                      className={cn('size-3 shrink-0 text-muted-foreground')}
                    />
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
                  <div className="flex flex-row items-center justify-center gap-1 text-muted-foreground">
                    <IdeLogo
                      ide={openInIdeSelection}
                      className="size-3 shrink-0 text-muted-foreground"
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
      <XIcon className="size-3 shrink-0 text-muted-foreground" />
      <Tooltip>
        <TooltipTrigger>
          <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
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
  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1">
      <div className="pointer-events-auto flex flex-row items-center justify-start gap-1 text-muted-foreground">
        <FileIcon filePath={relativePath ?? ''} className="size-5 shrink-0" />
        <Tooltip>
          <TooltipTrigger>
            <span className="min-w-0 truncate text-xs" dir="rtl">
              <span className="items-center gap-0.5 text-xs" dir="ltr">
                {relativePath}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{relativePath ?? ''}</TooltipContent>
        </Tooltip>
      </div>
      <span className="shrink-0 text-success text-xs">+{newLineCount}</span>
      <span className="shrink-0 text-error text-xs">-{deletedLineCount}</span>
    </div>
  );
};

const LoadingHeader = ({ relativePath }: { relativePath?: string }) => {
  return (
    <div className="flex flex-row items-center justify-start gap-1">
      <Loader2Icon className="size-3 shrink-0 animate-spin text-primary" />
      {relativePath !== null ? (
        <span className="min-w-0 flex-1 truncate text-xs" dir="rtl">
          <span
            dir="ltr"
            className="shimmer-text shimmer-duration-1500 shimmer-from-primary shimmer-to-blue-300"
          >
            {relativePath}
          </span>
        </span>
      ) : (
        <Skeleton className="h-3 w-16" variant="text" />
      )}
    </div>
  );
};
