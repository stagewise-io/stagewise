import type { AgentToolUIPart } from '@shared/karton-contracts/ui/agent';
import type { WithDiff } from '@shared/karton-contracts/ui/agent/tools/types';
import { DiffPreview } from '../shared/diff-preview';
import { FileIcon } from '@ui/components/file-icon';
import { getBaseName } from '@shared/path-utils';
import {
  IconXmarkOutline18,
  IconChevronExpandYOutline18,
  IconChevronReduceYOutline18,
  IconLoader6Outline18,
  IconArrowUpRightOutline18,
} from 'nucleo-ui-outline-18';
import { cn, stripMountPrefix } from '@ui/utils';
import { FileContextMenu } from '@ui/components/file-context-menu';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useDiffLines } from '@ui/hooks/use-diff-lines';
import { useMemo, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import { ToolPartUI } from '../shared/tool-part-ui';

import {
  StreamingCodeBlock,
  getLanguageFromPath,
} from '@ui/components/ui/streaming-code-block';

export const GenericMultiEditToolPart = ({
  part,
}: {
  part: Extract<AgentToolUIPart, { type: 'tool-multiEdit' }>;
}) => {
  const [expanded, setExpanded] = useState(true);
  const [openAgent] = useOpenAgent();
  const openFileTab = useKartonProcedure((p) => p.fileTree.openFileTab);
  const revealInFolder = useKartonProcedure((p) => p.fileTree.revealInFolder);
  const mounts = useKartonState((s) =>
    openAgent ? (s.toolbox[openAgent]?.workspace?.mounts ?? []) : [],
  );
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
    if (!part.input?.path) return null;
    return stripMountPrefix(part.input.path);
  }, [part.input?.path]);

  const _firstLineNumberEdited = useMemo(() => {
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

  const noopResolve = () => null;

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
          resolvePath={noopResolve}
        />
      );
    else
      return (
        <SuccessHeader
          relativePath={path ?? undefined}
          fullPath={part.input?.path ?? undefined}
          resolvePath={noopResolve}
          newLineCount={newLineCount}
          deletedLineCount={deletedLineCount}
        />
      );
  }, [
    state,
    streaming,
    path,
    part.input?.path,
    newLineCount,
    deletedLineCount,
    part.errorText,
  ]);

  const content = useMemo(() => {
    if (state === 'error') return undefined;
    if (diff)
      return (
        <DiffPreview
          diff={diff}
          filePath={part.input?.path ?? ''}
          collapsed={collapsedDiffView}
        />
      );
    if (hasNewContent && streaming)
      return (
        <StreamingCodeBlock
          code={
            (Array.isArray(part.input?.edits)
              ? part.input.edits
                  .map((edit) => edit?.new_string ?? '')
                  .join('\n\n')
              : '') ?? ''
          }
          language={getLanguageFromPath(part.input?.path)}
        />
      );
    return undefined;
  }, [
    state,
    diff,
    part.input?.edits,
    part.input?.path,
    hasNewContent,
    streaming,
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
        state === 'success' && diff ? (
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
                {collapsedDiffView ? 'Expand code diff' : 'Collapse code diff'}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0 cursor-pointer"
                  onClick={() => {
                    const relPath = part.input?.path ?? '';
                    const slashIndex = relPath.indexOf('/');
                    if (slashIndex <= 0) return;
                    const prefix = relPath.slice(0, slashIndex);
                    const rel = relPath.slice(slashIndex + 1);
                    const mount = mounts.find((m) => m.prefix === prefix);
                    if (!mount) return;
                    const wkKey = `${mount.prefix}:${mount.path.replace(/\\/g, '/')}`;
                    void openFileTab(wkKey, rel, openAgent).then((tabId) => {
                      if (!tabId) void revealInFolder(wkKey, rel);
                    });
                  }}
                >
                  <IconArrowUpRightOutline18 className="size-3 shrink-0" />
                  Open file
                </Button>
              </TooltipTrigger>
              <TooltipContent>Click to see full file</TooltipContent>
            </Tooltip>
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
      <IconLoader6Outline18 className="size-3 shrink-0 animate-spin text-primary-foreground" />
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
