import type { ToolPart } from '@shared/karton-contracts/ui';
import { ChevronDownIcon, Loader2Icon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { IconWindowPointerOutline18 } from 'nucleo-ui-outline-18';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import {
  Collapsible,
  CollapsibleContent,
} from '@stagewise/stage-ui/components/collapsible';
import { ToolPartUI } from './shared/tool-part-ui';
import { CodeBlock } from '@/components/ui/code-block';
import { cn } from '@/utils';
import { useToolAutoExpand } from './shared/use-tool-auto-expand';

export const ExecuteConsoleScriptToolPart = ({
  part,
  showBorder = true,
  disableShimmer = false,
  isLastPart = false,
}: {
  part: Extract<ToolPart, { type: 'tool-executeConsoleScriptTool' }>;
  showBorder?: boolean;
  disableShimmer?: boolean;
  isLastPart?: boolean;
}) => {
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(true);

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

  // Format the result as pretty-printed JSON if possible
  const formattedResult = useMemo(() => {
    const result = part.output?.result?.result;
    if (!result) return null;
    try {
      const parsed = JSON.parse(result);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If it's not valid JSON, return as-is
      return result;
    }
  }, [part.output?.result?.result]);

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
            <IconWindowPointerOutline18 className="size-3 shrink-0 text-muted-foreground" />
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
              <SuccessHeader showBorder={showBorder} />
            )}
          </div>
        </>
      }
      content={
        <>
          {part.input?.script && streaming && (
            <pre className="overflow-x-hidden whitespace-pre font-mono text-muted-foreground/75 text-xs">
              {part.input?.script}
            </pre>
          )}
          {state === 'success' && part.input?.script && (
            <div className="flex flex-col gap-2 pt-1">
              <Collapsible
                open={scriptExpanded}
                onOpenChange={setScriptExpanded}
              >
                <button
                  type="button"
                  onClick={() => setScriptExpanded(!scriptExpanded)}
                  className="mb-1 flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground/60 uppercase tracking-wider hover:text-muted-foreground"
                >
                  <ChevronDownIcon
                    className={cn(
                      'size-3 transition-transform duration-150',
                      !scriptExpanded && '-rotate-90',
                    )}
                  />
                  Script
                </button>
                <CollapsibleContent>
                  <div
                    className={cn(
                      'scrollbar-hover-only rounded border border-border/10',
                      showBorder
                        ? 'max-h-28 overflow-auto'
                        : 'overflow-y-hidden',
                    )}
                  >
                    <CodeBlock
                      code={part.input.script}
                      language="javascript"
                      hideActionButtons
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
              {formattedResult && (
                <Collapsible
                  open={resultExpanded}
                  onOpenChange={setResultExpanded}
                >
                  <button
                    type="button"
                    onClick={() => setResultExpanded(!resultExpanded)}
                    className="mb-1 flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground/60 uppercase tracking-wider hover:text-muted-foreground"
                  >
                    <ChevronDownIcon
                      className={cn(
                        'size-3 transition-transform duration-150',
                        !resultExpanded && '-rotate-90',
                      )}
                    />
                    Result
                  </button>
                  <CollapsibleContent>
                    <div
                      className={cn(
                        'scrollbar-hover-only rounded border border-border/10',
                        showBorder
                          ? 'max-h-28 overflow-auto'
                          : 'overflow-y-hidden',
                      )}
                    >
                      <CodeBlock
                        code={formattedResult}
                        language="json"
                        hideActionButtons
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </>
      }
      contentClassName={
        showBorder ? (streaming ? 'max-h-32' : 'max-h-80') : undefined
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

const SuccessHeader = ({ showBorder }: { showBorder?: boolean }) => {
  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1">
      <div className="pointer-events-auto flex flex-row items-center justify-start gap-1 text-muted-foreground">
        <span
          className={cn(
            'shrink-0 text-muted-foreground text-xs',
            !showBorder && 'font-normal text-muted-foreground/75',
          )}
        >
          {showBorder ? (
            'Executed '
          ) : (
            <span className="font-medium text-muted-foreground">Executed </span>
          )}
          console script
        </span>
      </div>
    </div>
  );
};

const LoadingHeader = ({ disableShimmer }: { disableShimmer?: boolean }) => {
  return (
    <div className="flex flex-row items-center justify-start gap-1">
      <Loader2Icon className="size-3 shrink-0 animate-spin text-primary" />
      <span
        dir="ltr"
        className={cn(
          'text-xs',
          disableShimmer
            ? 'text-muted-foreground'
            : 'shimmer-text shimmer-duration-1500 shimmer-from-primary shimmer-to-blue-300',
        )}
      >
        Executing console script...
      </span>
    </div>
  );
};
