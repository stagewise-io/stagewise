import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import type { WithDiff } from '@shared/karton-contracts/ui/agent/tools/types';
import { DiffPreview } from './shared/diff-preview';
import { FileIcon } from '@ui/components/file-icon';
import { getBaseName } from '@shared/path-utils';
import {
  Loader2Icon,
  XIcon,
  ListChevronsDownUpIcon,
  ListChevronsUpDownIcon,
} from 'lucide-react';
import { cn, IDE_SELECTION_ITEMS, stripMountPrefix } from '@ui/utils';
import { useFileIDEHref } from '@ui/hooks/use-file-ide-href';
import { IdePickerPopover } from '@ui/components/ide-picker-popover';
import { FileContextMenu } from '@ui/components/file-context-menu';
import { diffLines } from 'diff';
import { useMemo, useState } from 'react';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { useKartonState } from '@ui/hooks/use-karton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import { ToolPartUI } from './shared/tool-part-ui';
import { IdeLogo } from '@ui/components/ide-logo';
import {
  StreamingCodeBlock,
  getLanguageFromPath,
} from '@ui/components/ui/streaming-code-block';

export const MultiEditToolPart = ({
  part,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-multiEdit' }>;
}) => {
  const [expanded, setExpanded] = useState(true);
  const { getFileIDEHref, needsIdePicker, pickIdeAndOpen, resolvePath } =
    useFileIDEHref();
  const outputWithDiff = part.output as
    | WithDiff<typeof part.output>
    | undefined;

  const diff = useMemo(
    () =>
      outputWithDiff?._diff
        ? diffLines(
            outputWithDiff._diff.before ?? '',
            outputWithDiff._diff.after ?? '',
          )
        : null,
    [outputWithDiff?._diff],
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

  const streaming = useMemo(() => {
    return part.state === 'input-streaming' || part.state === 'input-available';
  }, [part.state]);

  const state = useMemo(() => {
    if (streaming) return 'streaming';
    if (part.state === 'output-error') return 'error';
    return 'success';
  }, [part.state, streaming]);

  const effectiveExpanded = useMemo(() => {
    return state === 'error' ? false : expanded;
  }, [state, expanded]);

  const path = useMemo(() => {
    if (!part.input?.relative_path) return null;
    return stripMountPrefix(part.input.relative_path);
  }, [part.input?.relative_path]);

  const firstLineNumberEdited = useMemo(() => {
    let startLine = 1;
    for (const line of diff ?? []) {
      if (line.added || line.removed) return startLine;
      startLine += line.count;
    }
    return startLine;
  }, [diff]);

  const hasNewContent = useMemo(() => {
    if (!Array.isArray(part.input?.edits)) return false;
    return part.input.edits.some(
      (edit) => (edit?.new_string?.length ?? 0) > 10,
    );
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
      return (
        <LoadingHeader
          relativePath={path ?? undefined}
          fullPath={part.input?.relative_path ?? undefined}
          resolvePath={resolvePath}
        />
      );
    else
      return (
        <SuccessHeader
          relativePath={path ?? undefined}
          fullPath={part.input?.relative_path ?? undefined}
          resolvePath={resolvePath}
          newLineCount={newLineCount}
          deletedLineCount={deletedLineCount}
        />
      );
  }, [
    state,
    streaming,
    path,
    part.input?.relative_path,
    newLineCount,
    deletedLineCount,
    part.errorText,
    resolvePath,
  ]);

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
            (Array.isArray(part.input?.edits)
              ? part.input.edits
                  .map((edit) => edit?.new_string ?? '')
                  .join('\n\n')
              : '') ?? ''
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
      expanded={effectiveExpanded}
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
            {(() => {
              const relPath = part.input?.relative_path ?? '';
              const ideName = IDE_SELECTION_ITEMS[openInIdeSelection];
              const anchor = (
                <a
                  href={
                    needsIdePicker
                      ? '#'
                      : getFileIDEHref(relPath, firstLineNumberEdited)
                  }
                  target={needsIdePicker ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  onClick={
                    needsIdePicker ? (e) => e.preventDefault() : undefined
                  }
                  className={cn(
                    buttonVariants({ size: 'xs', variant: 'ghost' }),
                    'shrink-0',
                  )}
                >
                  <div className="flex flex-row items-center justify-center gap-1">
                    <IdeLogo
                      ide={openInIdeSelection}
                      className="size-3 shrink-0"
                    />
                    <span className="text-xs">Open file</span>
                  </div>
                </a>
              );
              if (needsIdePicker) {
                return (
                  <IdePickerPopover
                    onSelect={(ide) =>
                      pickIdeAndOpen(ide, relPath, firstLineNumberEdited)
                    }
                  >
                    {anchor}
                  </IdePickerPopover>
                );
              }
              return (
                <Tooltip>
                  <TooltipTrigger>{anchor}</TooltipTrigger>
                  <TooltipContent>
                    <div className="flex max-w-96 flex-col gap-1">
                      <div className="break-all font-mono text-xs">
                        {stripMountPrefix(relPath)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Click to open in {ideName}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })()}
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
  fullPath,
  resolvePath,
  newLineCount,
  deletedLineCount,
}: {
  relativePath?: string;
  fullPath?: string;
  resolvePath: (path: string) => string | null;
  newLineCount: number;
  deletedLineCount: number;
}) => {
  const fileName = relativePath ? getBaseName(relativePath) : relativePath;

  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1">
      <div className="pointer-events-auto flex flex-row items-center justify-start gap-1">
        <FileIcon
          filePath={relativePath ?? ''}
          className="-ml-1 size-4 shrink-0"
        />
        <FileContextMenu
          relativePath={fullPath ?? relativePath ?? ''}
          resolvePath={resolvePath}
        >
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
        </FileContextMenu>
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
      <Loader2Icon className="size-3 shrink-0 animate-spin text-primary-foreground" />
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
