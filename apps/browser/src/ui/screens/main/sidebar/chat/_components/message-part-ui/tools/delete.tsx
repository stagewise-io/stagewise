import type { WithDiff } from '@shared/karton-contracts/ui/agent/tools/types';
import { DiffPreview } from './shared/diff-preview';
import { ToolPartUI } from './shared/tool-part-ui';
import { getBaseName } from '@shared/path-utils';
import {
  IconLoader6Outline18,
  IconXmarkOutline18,
  IconChevronExpandYOutline18,
  IconChevronReduceYOutline18,
  IconFolder5Outline18,
} from 'nucleo-ui-outline-18';
import { FileIcon } from '@ui/components/file-icon';
import { useMemo, useState, useEffect } from 'react';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { diffLines } from 'diff';
import { cn, stripMountPrefix } from '@ui/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import { useFileIDEHref } from '@ui/hooks/use-file-ide-href';
import { FileContextMenu } from '@ui/components/file-context-menu';

export const DeleteFileToolPart = ({
  part,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-delete' }>;
}) => {
  const [expanded, setExpanded] = useState(true);
  const [collapsedDiffView, setCollapsedDiffView] = useState(true);
  const { resolvePath } = useFileIDEHref();

  const outputWithDiff = part.output as WithDiff<{}> | undefined;

  // Directory deletes have null before content (no file content to diff)
  const isDirectory = useMemo(() => {
    const diff = outputWithDiff?._diff;
    return diff !== undefined && diff !== null && diff.before === null;
  }, [outputWithDiff?._diff]);

  const diff = useMemo(
    () =>
      outputWithDiff?._diff
        ? diffLines(outputWithDiff._diff.before ?? '', '')
        : null,
    [outputWithDiff?._diff],
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
    if (!part.input?.path) return null;
    return stripMountPrefix(part.input.path);
  }, [part.input?.path]);

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
      return (
        <LoadingHeader
          relativePath={path ?? undefined}
          fullPath={part.input?.path ?? undefined}
          resolvePath={resolvePath}
        />
      );
    else
      return (
        <SuccessHeader
          relativePath={path ?? undefined}
          fullPath={part.input?.path ?? undefined}
          resolvePath={resolvePath}
          deletedLineCount={deletedLineCount}
          isDirectory={isDirectory}
        />
      );
  }, [
    state,
    streaming,
    path,
    part.input?.path,
    part.errorText,
    deletedLineCount,
    resolvePath,
    isDirectory,
  ]);

  const content = useMemo(() => {
    if (state === 'error') return undefined;
    // Directories have no diff content to show
    if (isDirectory) return undefined;
    if (state === 'success' && diff)
      return (
        <DiffPreview
          diff={diff}
          filePath={part.input?.path ?? ''}
          collapsed={collapsedDiffView}
        />
      );
    return undefined;
  }, [state, diff, part.input?.path, collapsedDiffView, isDirectory]);

  const contentFooter = useMemo(() => {
    if (isDirectory) return undefined;
    if (state === 'success' && diff)
      return (
        <div className="flex w-full flex-row items-center justify-start">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setCollapsedDiffView(!collapsedDiffView);
                }}
              >
                {collapsedDiffView ? (
                  <IconChevronExpandYOutline18 className="size-3 shrink-0" />
                ) : (
                  <IconChevronReduceYOutline18 className="size-3 shrink-0" />
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
  }, [state, diff, collapsedDiffView, isDirectory]);

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
      <IconXmarkOutline18 className="size-3 shrink-0" />
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
  fullPath,
  resolvePath,
  deletedLineCount,
  isDirectory,
}: {
  relativePath?: string;
  fullPath?: string;
  resolvePath: (path: string) => string | null;
  deletedLineCount?: number;
  isDirectory?: boolean;
}) => {
  const fileName = relativePath ? getBaseName(relativePath) : relativePath;

  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1">
      <div className="pointer-events-auto flex flex-row items-center justify-start gap-1 text-muted-foreground">
        <FileContextMenu
          relativePath={fullPath ?? relativePath ?? ''}
          resolvePath={resolvePath}
        >
          <Tooltip>
            <TooltipTrigger>
              <div className="flex flex-row items-center justify-start gap-1">
                {isDirectory ? (
                  <IconFolder5Outline18 className="size-3.5 shrink-0" />
                ) : (
                  <FileIcon
                    filePath={relativePath ?? ''}
                    className="-ml-1 size-4 shrink-0"
                  />
                )}
                <span
                  className="min-w-0 truncate font-normal text-xs"
                  dir="rtl"
                >
                  <span className="items-center gap-0.5 text-xs" dir="ltr">
                    {fileName}
                  </span>
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{relativePath ?? ''}</TooltipContent>
          </Tooltip>
        </FileContextMenu>
      </div>
      <span className="shrink-0 text-error-foreground text-xs group-hover/trigger:text-hover-derived">
        (deleted)
      </span>
      {!isDirectory && (deletedLineCount ?? 0) > 0 && (
        <span className="shrink-0 text-error-foreground text-xs group-hover/trigger:text-hover-derived">
          -{deletedLineCount}
        </span>
      )}
    </div>
  );
};

const LoadingHeader = ({
  relativePath,
  fullPath,
  resolvePath,
}: {
  relativePath?: string;
  fullPath?: string;
  resolvePath: (path: string) => string | null;
}) => {
  const fileName = relativePath ? getBaseName(relativePath) : relativePath;

  return (
    <div className="flex flex-row items-center justify-start gap-1">
      <IconLoader6Outline18 className="size-3 shrink-0 animate-spin text-primary" />
      {relativePath !== null ? (
        <FileContextMenu
          relativePath={fullPath ?? relativePath ?? ''}
          resolvePath={resolvePath}
        >
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
        </FileContextMenu>
      ) : (
        <Skeleton className="h-3 w-16" variant="text" />
      )}
    </div>
  );
};
