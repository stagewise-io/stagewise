import type { WritePart } from '.';
import type { WithDiff } from '@shared/karton-contracts/ui/agent/tools/types';
import { FileIcon } from '@ui/components/file-icon';
import { getBaseName } from '@shared/path-utils';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import {
  IconXmarkOutline18,
  IconChevronExpandYOutline18,
  IconChevronReduceYOutline18,
  IconLoader6Outline18,
} from 'nucleo-ui-outline-18';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import { useFileIDEHref } from '@ui/hooks/use-file-ide-href';
import { IdePickerPopover } from '@ui/components/ide-picker-popover';
import { FileContextMenu } from '@ui/components/file-context-menu';
import { DiffPreview } from '../shared/diff-preview';
import { cn, IDE_SELECTION_ITEMS, stripMountPrefix } from '@ui/utils';
import { useMemo, useState, memo } from 'react';
import { ToolPartUI } from '../shared/tool-part-ui';
import { useDiffLines } from '@ui/hooks/use-diff-lines';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';

import { useKartonState } from '@ui/hooks/use-karton';
import { IdeLogo } from '@ui/components/ide-logo';
import {
  StreamingCodeBlock,
  getLanguageFromPath,
} from '@ui/components/ui/streaming-code-block';

export const GenericWriteToolPart = memo(
  function GenericWriteToolPart({ part }: { part: WritePart }) {
    const [codeDiffCollapsed, setCodeDiffCollapsed] = useState(true);
    const [expanded, setExpanded] = useState(true);
    const { getFileIDEHref, needsIdePicker, pickIdeAndOpen, resolvePath } =
      useFileIDEHref();
    const outputWithDiff = part.output as
      | WithDiff<typeof part.output>
      | undefined;

    const diff = useDiffLines(
      outputWithDiff?._diff ? (outputWithDiff._diff.before ?? '') : undefined,
      outputWithDiff?._diff ? (outputWithDiff._diff.after ?? '') : undefined,
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
      return (
        part.state === 'input-streaming' || part.state === 'input-available'
      );
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

    const effectiveExpanded = useMemo(() => {
      return state === 'error' ? false : expanded;
    }, [state, expanded]);

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
            newLineCount={newLineCount}
            deletedLineCount={deletedLineCount}
            fileWasCreated={outputWithDiff?._diff?.before === null}
          />
        );
    }, [
      state,
      streaming,
      path,
      part.input?.path,
      part.errorText,
      newLineCount,
      deletedLineCount,
      outputWithDiff?._diff?.before,
      resolvePath,
    ]);

    const content = useMemo(() => {
      if (state === 'error') return undefined;
      if (diff)
        return (
          <DiffPreview
            diff={diff}
            filePath={part.input?.path ?? ''}
            collapsed={codeDiffCollapsed}
          />
        );
      if (streaming && part.input?.content)
        return (
          <StreamingCodeBlock
            code={part.input?.content ?? ''}
            language={getLanguageFromPath(part.input?.path)}
          />
        );
      return undefined;
    }, [
      state,
      diff,
      part.input?.content,
      part.input?.path,
      streaming,
      codeDiffCollapsed,
    ]);

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
                    setCodeDiffCollapsed(!codeDiffCollapsed);
                  }}
                >
                  {codeDiffCollapsed ? (
                    <IconChevronExpandYOutline18
                      className={cn('size-3 shrink-0')}
                    />
                  ) : (
                    <IconChevronReduceYOutline18
                      className={cn('size-3 shrink-0')}
                    />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {codeDiffCollapsed ? 'Expand code diff' : 'Collapse code diff'}
              </TooltipContent>
            </Tooltip>
            {(() => {
              const relPath = part.input?.path ?? '';
              const ideName = IDE_SELECTION_ITEMS[openInIdeSelection];
              const anchor = (
                <a
                  href={needsIdePicker ? '#' : getFileIDEHref(relPath)}
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
                    onSelect={(ide) => pickIdeAndOpen(ide, relPath)}
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
        );
      else return undefined;
    }, [
      state,
      diff,
      codeDiffCollapsed,
      part.input?.path,
      openInIdeSelection,
      needsIdePicker,
      getFileIDEHref,
      pickIdeAndOpen,
    ]);

    return (
      <ToolPartUI
        showBorder={true}
        expanded={effectiveExpanded}
        setExpanded={setExpanded}
        trigger={trigger}
        content={content}
        contentClassName={cn(streaming ? 'max-h-24' : 'max-h-56')}
        contentFooter={contentFooter}
        contentFooterClassName="px-0"
      />
    );
  },
  // Immer structural sharing keeps settled tool-part references stable.
  // Only the actively streaming part gets a new reference per chunk.
  (prev, next) => prev.part === next.part,
);

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
  newLineCount,
  deletedLineCount,
  fileWasCreated,
}: {
  relativePath?: string;
  fullPath?: string;
  resolvePath: (path: string) => string | null;
  newLineCount: number;
  deletedLineCount: number;
  fileWasCreated: boolean;
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
      {fileWasCreated && (
        <span className="shrink-0 text-success-foreground text-xs group-hover/trigger:text-hover-derived">
          (new)
        </span>
      )}
      <span className="shrink-0 text-success-foreground text-xs group-hover/trigger:text-hover-derived">
        +{newLineCount}
      </span>
      {!fileWasCreated && deletedLineCount > 0 && (
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
      <IconLoader6Outline18
        className={cn('size-3 shrink-0 animate-spin text-primary-foreground')}
      />
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
