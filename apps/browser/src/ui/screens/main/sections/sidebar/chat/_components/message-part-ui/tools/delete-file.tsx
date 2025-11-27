import type { ToolPart } from '@shared/karton-contracts/ui';
import { DiffPreview } from './shared/diff-preview';
import { ToolPartUI } from './shared/tool-part-ui';
import { TrashIcon, XIcon } from 'lucide-react';
import { FileIcon } from './shared/file-icon';
import { useMemo, useState } from 'react';
import { Skeleton } from '@stagewise/stage-ui/components/skeleton';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { diffLines } from 'diff';

export const DeleteFileToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-deleteFileTool' }>;
}) => {
  const [expanded, setExpanded] = useState(false);

  const diff = useMemo(
    () =>
      part.output?.hiddenMetadata?.diff
        ? diffLines(part.output.hiddenMetadata.diff.before ?? '', '')
        : null,
    [part.output?.hiddenMetadata],
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
          collapsed
        />
      );
    else return undefined;
  }, [state, diff, part.input?.relative_path]);

  return (
    <ToolPartUI
      expanded={expanded}
      setExpanded={setExpanded}
      trigger={trigger}
      content={content}
      contentClassName="max-h-56"
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
  deletedLineCount,
}: {
  relativePath?: string;
  deletedLineCount?: number;
}) => {
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
                  {relativePath}
                </span>
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{relativePath ?? ''}</TooltipContent>
        </Tooltip>
      </div>
      <span className="shrink-0 text-error text-xs">(deleted)</span>
      {(deletedLineCount ?? 0) > 0 && (
        <span className="shrink-0 text-error text-xs">-{deletedLineCount}</span>
      )}
    </div>
  );
};

const LoadingHeader = ({ relativePath }: { relativePath?: string }) => {
  return (
    <div className="flex flex-row items-center justify-start gap-1">
      <TrashIcon className="size-3 shrink-0 text-primary" />
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
