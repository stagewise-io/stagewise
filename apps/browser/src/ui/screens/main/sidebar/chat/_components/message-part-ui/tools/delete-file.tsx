import type { ToolPart } from '@shared/karton-contracts/ui';
import { DiffPreview } from './shared/diff-preview';
import { ToolPartUI } from './shared/tool-part-ui';
import {
  Loader2Icon,
  XIcon,
  ListChevronsDownUpIcon,
  ListChevronsUpDownIcon,
} from 'lucide-react';
import { FileIcon } from './shared/file-icon';
import { useMemo, useState, useEffect } from 'react';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { diffLines } from 'diff';
import { cn } from '@/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import { usePostHog } from 'posthog-js/react';

export const DeleteFileToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-deleteFileTool' }>;
}) => {
  const [expanded, setExpanded] = useState(true);
  const [collapsedDiffView, setCollapsedDiffView] = useState(true);
  const posthog = usePostHog();

  const diff = useMemo(
    () =>
      part.output?.hiddenFromLLM?.diff
        ? diffLines(part.output.hiddenFromLLM.diff.before ?? '', '')
        : null,
    [part.output?.hiddenFromLLM],
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
    if (state === 'error') setExpanded(false);
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
          deletedLineCount={deletedLineCount}
        />
      );
  }, [state, streaming, path, part.errorText, deletedLineCount]);

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
    else return undefined;
  }, [state, diff, part.input?.relative_path, collapsedDiffView]);

  const contentFooter = useMemo(() => {
    if (state === 'success' && diff)
      return (
        <div className="flex w-full flex-row items-center justify-start">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  posthog.capture(
                    'agent_code_diff_expanded_via_delete_file_tool',
                    {
                      file_path: part.input?.relative_path ?? '',
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
        </div>
      );
    else return undefined;
  }, [state, diff, collapsedDiffView, part.input?.relative_path, posthog]);

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
      ? `Error deleting ${relativePath}`
      : 'Error deleting file';

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
  deletedLineCount,
}: {
  relativePath?: string;
  deletedLineCount?: number;
}) => {
  const fileName = relativePath?.split('/').pop() ?? relativePath;

  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1">
      <div className="pointer-events-auto flex flex-row items-center justify-start gap-1 text-muted-foreground">
        <Tooltip>
          <TooltipTrigger>
            <div className="flex flex-row items-center justify-start gap-1">
              <FileIcon
                filePath={relativePath ?? ''}
                className="size-5 shrink-0"
              />
              <span className="min-w-0 truncate font-normal text-xs" dir="rtl">
                <span className="items-center gap-0.5 text-xs" dir="ltr">
                  {fileName}
                </span>
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{relativePath ?? ''}</TooltipContent>
        </Tooltip>
      </div>
      <span className="shrink-0 text-error-foreground text-xs group-hover/trigger:text-hover-derived">
        (deleted)
      </span>
      {(deletedLineCount ?? 0) > 0 && (
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
