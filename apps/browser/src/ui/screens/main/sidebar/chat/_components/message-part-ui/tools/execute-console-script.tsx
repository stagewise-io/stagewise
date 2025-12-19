import type { ToolPart } from '@shared/karton-contracts/ui';
import { ChevronDownIcon, Loader2Icon, XIcon } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
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

export const ExecuteConsoleScriptToolPart = ({
  part,
}: {
  part: Extract<ToolPart, { type: 'tool-executeConsoleScriptTool' }>;
}) => {
  const [expanded, setExpanded] = useState(true);
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

  // Force expanded to false when in error state
  useEffect(() => {
    if (state === 'error') setExpanded(false);
  }, [state]);

  if (state === 'error') {
    return (
      <div className="group/exploring-part -mx-1 block min-w-32 rounded-xl border-border/20 bg-muted-foreground/5">
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
      expanded={expanded}
      setExpanded={setExpanded}
      trigger={
        <>
          {!streaming && (
            <IconWindowPointerOutline18 className="size-3 shrink-0 text-muted-foreground" />
          )}
          <div className="flex w-full flex-row items-center justify-start gap-1">
            {streaming ? <LoadingHeader /> : <SuccessHeader />}
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
                  <div className="scrollbar-hover-only max-h-28 overflow-auto rounded border border-border/10">
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
                    <div className="scrollbar-hover-only max-h-28 overflow-auto rounded border border-border/10">
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
      contentClassName={streaming ? 'max-h-24' : 'max-h-80'}
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

const SuccessHeader = () => {
  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1">
      <div className="pointer-events-auto flex flex-row items-center justify-start gap-1 text-muted-foreground">
        <span className="shrink-0 text-muted-foreground text-xs">
          Executed console script
        </span>
      </div>
    </div>
  );
};

const LoadingHeader = () => {
  return (
    <div className="flex flex-row items-center justify-start gap-1">
      <Loader2Icon className="size-3 shrink-0 animate-spin text-primary" />
      <span
        dir="ltr"
        className="shimmer-text shimmer-duration-1500 shimmer-from-primary shimmer-to-blue-300 text-xs"
      >
        Executing console script...
      </span>
    </div>
  );
};
