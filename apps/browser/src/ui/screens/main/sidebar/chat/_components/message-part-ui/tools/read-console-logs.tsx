import type { ToolPart } from '@shared/karton-contracts/ui';
import { Loader2Icon, XIcon, TerminalIcon } from 'lucide-react';
import { useMemo } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { ToolPartUI } from './shared/tool-part-ui';
import { CodeBlock } from '@/components/ui/code-block';
import { cn } from '@/utils';
import { useToolAutoExpand } from './shared/use-tool-auto-expand';

export const ReadConsoleLogsToolPart = ({
  part,
  showBorder = true,
  disableShimmer = false,
  isLastPart = false,
}: {
  part: Extract<ToolPart, { type: 'tool-readConsoleLogsTool' }>;
  showBorder?: boolean;
  disableShimmer?: boolean;
  isLastPart?: boolean;
}) => {
  const streaming = useMemo(() => {
    return part.state === 'input-streaming' || part.state === 'input-available';
  }, [part.state]);

  const state = useMemo(() => {
    if (streaming) return 'streaming';
    if (part.state === 'output-error') return 'error';
    return 'success';
  }, [part.state, streaming]);

  // Use the unified auto-expand hook
  const { expanded, handleUserSetExpanded } = useToolAutoExpand({
    isStreaming: streaming,
    isLastPart,
  });

  // Parse the result to get log count
  const logInfo = useMemo(() => {
    const result = part.output?.result?.result;
    if (!result) return null;
    try {
      const parsed = JSON.parse(result);
      return {
        logsReturned: parsed.logsReturned ?? 0,
        totalLogsStored: parsed.totalLogsStored ?? 0,
        filter: parsed.filter,
        logs: parsed.logs ?? [],
      };
    } catch {
      return null;
    }
  }, [part.output?.result?.result]);

  // Format the logs for display
  const formattedLogs = useMemo(() => {
    if (!logInfo?.logs?.length) return null;
    return JSON.stringify(logInfo.logs, null, 2);
  }, [logInfo]);

  if (state === 'error') {
    return (
      <div
        className={cn(
          'group/exploring-part block min-w-32 rounded-xl',
          showBorder && '-mx-1 border-border/20 bg-muted-foreground/5',
        )}
      >
        <div className="flex h-6 cursor-default items-center gap-1 rounded-xl px-2.5 text-muted-foreground">
          <div className="flex w-full flex-row items-center justify-start gap-1">
            <ErrorHeader errorText={part.errorText ?? undefined} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ToolPartUI
      showBorder={showBorder}
      expanded={expanded}
      setExpanded={handleUserSetExpanded}
      trigger={
        <>
          {!streaming && (
            <TerminalIcon className="size-3 shrink-0 text-muted-foreground" />
          )}
          <div
            className={cn(
              'flex flex-row items-center justify-start gap-1',
              showBorder && 'flex-1',
            )}
          >
            {streaming ? (
              <LoadingHeader disableShimmer={disableShimmer} />
            ) : (
              <SuccessHeader
                logsReturned={logInfo?.logsReturned ?? 0}
                showBorder={showBorder}
              />
            )}
          </div>
        </>
      }
      content={
        <>
          {streaming && part.input && (
            <pre className="overflow-x-hidden whitespace-pre font-mono text-muted-foreground/75 text-xs">
              {part.input?.delayMs && part.input.delayMs > 0
                ? `Waiting ${part.input.delayMs}ms before reading logs${part.input?.filter ? ` (filter: "${part.input.filter}")` : ''}...`
                : part.input?.filter
                  ? `Reading logs filtered by "${part.input.filter}"...`
                  : 'Reading console logs...'}
            </pre>
          )}
          {state === 'success' && formattedLogs && (
            <div
              className={cn(
                'scrollbar-hover-only rounded border border-border/10',
                showBorder ? 'max-h-48 overflow-auto' : 'overflow-y-hidden',
              )}
            >
              <CodeBlock
                code={formattedLogs}
                language="json"
                hideActionButtons
              />
            </div>
          )}
          {state === 'success' && !formattedLogs && logInfo && (
            <div className="py-2 text-muted-foreground/60 text-xs">
              No logs found
              {part.input?.filter ? ` matching "${part.input.filter}"` : ''}
            </div>
          )}
        </>
      }
      contentClassName={
        showBorder ? (streaming ? 'max-h-24' : 'max-h-80') : undefined
      }
      contentFooterClassName="px-0"
    />
  );
};

const ErrorHeader = ({ errorText }: { errorText?: string }) => {
  const errorTextContent = errorText ?? 'Error reading console logs';

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
  logsReturned,
  showBorder,
}: {
  logsReturned: number;
  showBorder?: boolean;
}) => {
  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1 overflow-hidden">
      <span
        className={cn(
          'shrink-0 text-muted-foreground text-xs',
          !showBorder && 'font-normal text-muted-foreground/75',
        )}
      >
        {showBorder ? (
          'Read '
        ) : (
          <span className="font-medium text-muted-foreground">Read </span>
        )}
        {logsReturned} console log{logsReturned !== 1 ? 's' : ''}
      </span>
    </div>
  );
};

const LoadingHeader = ({ disableShimmer }: { disableShimmer?: boolean }) => {
  return (
    <div className="flex flex-row items-center justify-start gap-1 overflow-hidden">
      <Loader2Icon className="size-3 shrink-0 animate-spin text-primary" />
      <span
        dir="ltr"
        className={cn(
          'truncate text-xs',
          disableShimmer
            ? 'text-muted-foreground'
            : 'shimmer-text shimmer-duration-1500 shimmer-from-primary shimmer-to-blue-300',
        )}
      >
        Reading console logs...
      </span>
    </div>
  );
};
