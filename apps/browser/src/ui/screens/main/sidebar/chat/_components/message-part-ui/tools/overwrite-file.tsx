import type { ToolPart } from '@shared/karton-contracts/ui';
import { FileIcon } from './shared/file-icon';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import {
  Loader2Icon,
  XIcon,
  ListChevronsDownUpIcon,
  ListChevronsUpDownIcon,
} from 'lucide-react';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import { useFileIDEHref } from '@/hooks/use-file-ide-href';
import { DiffPreview } from './shared/diff-preview';
import { cn } from '@/utils';
import { useEffect, useMemo, useState } from 'react';
import { ToolPartUI } from './shared/tool-part-ui';
import { diffLines } from 'diff';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';

import { IDE_SELECTION_ITEMS } from '@/utils';
import { useKartonState } from '@/hooks/use-karton';
import { usePostHog } from 'posthog-js/react';
import { IdeLogo } from '@/components/ide-logo';

export const OverwriteFileToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-overwriteFileTool' }>;
}) => {
  const [codeDiffCollapsed, setCodeDiffCollapsed] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const { getFileIDEHref } = useFileIDEHref();
  const posthog = usePostHog();
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

  const openInIdeSelection = useKartonState(
    (s) => s.globalConfig.openFilesInIde,
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
          fileWasCreated={part.output?.hiddenFromLLM?.diff.before === null}
        />
      );
  }, [state, streaming, path, newLineCount, deletedLineCount]);

  const content = useMemo(() => {
    if (state === 'error') return undefined;
    else if (state === 'success' && diff)
      return (
        <DiffPreview
          diff={diff}
          filePath={part.input?.relative_path ?? ''}
          collapsed={codeDiffCollapsed}
        />
      );
    else if (streaming && part.input?.content && !diff)
      return (
        <pre className="overflow-x-hidden whitespace-pre font-mono text-xs">
          {part.input?.content}
        </pre>
      );
    else return undefined;
  }, [state, diff, part.input?.content, streaming]);

  const contentFooter = useMemo(() => {
    if (state === 'success' && diff)
      return (
        <div className="flex w-full flex-row items-center justify-between">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  posthog.capture(
                    'agent_code_diff_expanded_via_overwrite_file_tool',
                    {
                      file_path: part.input?.relative_path ?? '',
                      ide: IDE_SELECTION_ITEMS[openInIdeSelection],
                    },
                  );
                  setCodeDiffCollapsed(!codeDiffCollapsed);
                }}
              >
                {codeDiffCollapsed ? (
                  <ListChevronsUpDownIcon className={cn('size-3 shrink-0')} />
                ) : (
                  <ListChevronsDownUpIcon className={cn('size-3 shrink-0')} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {codeDiffCollapsed ? 'Expand code diff' : 'Collapse code diff'}
            </TooltipContent>
          </Tooltip>
          <a
            href={getFileIDEHref(part.input?.relative_path ?? '')}
            onClick={() => {
              posthog.capture(
                'agent_file_opened_in_ide_via_overwrite_file_tool',
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
            <div className="flex flex-row items-center justify-center gap-1">
              <IdeLogo ide={openInIdeSelection} className="size-3 shrink-0" />
              <span className="text-xs">Open file</span>
            </div>
          </a>
        </div>
      );
    else return undefined;
  }, [state, codeDiffCollapsed, part.input?.relative_path, openInIdeSelection]);

  return (
    <ToolPartUI
      showBorder={true}
      expanded={expanded}
      setExpanded={setExpanded}
      trigger={trigger}
      content={content}
      contentClassName={cn(streaming ? 'max-h-24' : 'max-h-56')}
      contentFooter={contentFooter}
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
  fileWasCreated,
}: {
  relativePath?: string;
  newLineCount: number;
  deletedLineCount: number;
  fileWasCreated: boolean;
}) => {
  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1 text-foreground">
      <div className="pointer-events-auto flex flex-row items-center justify-start gap-1">
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
      {fileWasCreated && (
        <span className="shrink-0 text-success-foreground text-xs">(new)</span>
      )}
      <span className="shrink-0 text-success-foreground text-xs">
        +{newLineCount}
      </span>
      {!fileWasCreated && (
        <span className="shrink-0 text-error-foreground text-xs">
          -{deletedLineCount}
        </span>
      )}
    </div>
  );
};

const LoadingHeader = ({ relativePath }: { relativePath?: string }) => {
  return (
    <div className="flex flex-row items-center justify-start gap-1">
      <Loader2Icon className="size-3 shrink-0 animate-spin text-primary " />
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
