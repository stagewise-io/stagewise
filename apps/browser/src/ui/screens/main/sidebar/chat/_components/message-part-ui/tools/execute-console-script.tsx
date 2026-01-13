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
  CollapsibleTrigger,
  CollapsibleContent,
} from '@stagewise/stage-ui/components/collapsible';
import { ToolPartUI } from './shared/tool-part-ui';
import { CodeBlock } from '@/components/ui/code-block';
import { cn } from '@/utils';
import { useToolAutoExpand } from './shared/use-tool-auto-expand';
import { useKartonState } from '@/hooks/use-karton';

export const ExecuteConsoleScriptToolPart = ({
  part,
  capMaxHeight = false,
  showBorder = false,
  disableShimmer = false,
  isLastPart = false,
}: {
  part: Extract<ToolPart, { type: 'tool-executeConsoleScriptTool' }>;
  capMaxHeight?: boolean;
  showBorder?: boolean;
  disableShimmer?: boolean;
  isLastPart?: boolean;
}) => {
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(true);
  const activeTabs = useKartonState((s) => s.browser.tabs);

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

  const tab = useMemo(() => {
    return Object.values(activeTabs).find(
      (tab) => tab.handle === part.input?.id,
    );
  }, [part.input?.id, activeTabs]);

  const hostname = useMemo(() => {
    return tab ? new URL(tab.url).hostname : undefined;
  }, [tab]);

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
      <div className={cn('group/exploring-part block min-w-32 rounded-xl')}>
        <div className="flex h-6 cursor-default items-center gap-1 rounded-xl px-2.5">
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
            <IconWindowPointerOutline18 className="size-3 shrink-0" />
          )}
          <div
            className={cn(
              'flex flex-row items-center justify-start gap-1',
              showBorder && 'flex-1',
            )}
          >
            {streaming ? (
              <LoadingHeader
                disableShimmer={disableShimmer}
                hostname={hostname}
              />
            ) : (
              <SuccessHeader capMaxHeight={capMaxHeight} hostname={hostname} />
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
            <div className="flex flex-col">
              <Collapsible
                open={scriptExpanded}
                onOpenChange={setScriptExpanded}
              >
                <CollapsibleTrigger size="condensed" className="">
                  <button
                    type="button"
                    onClick={() => setScriptExpanded(!scriptExpanded)}
                    className="mb-1 flex cursor-pointer items-center gap-1 text-[10px] uppercase tracking-wider"
                  >
                    <ChevronDownIcon
                      className={cn(
                        'size-3 transition-transform duration-150',
                        !scriptExpanded && '-rotate-90',
                      )}
                    />
                    Script
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div
                    className={cn(
                      'scrollbar-hover-only',
                      capMaxHeight
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
                  <CollapsibleTrigger size="condensed" className="">
                    <button
                      type="button"
                      onClick={() => setResultExpanded(!resultExpanded)}
                      className="mb-1 flex cursor-pointer items-center gap-1 text-[10px] uppercase tracking-wider"
                    >
                      <ChevronDownIcon
                        className={cn(
                          'size-3 transition-transform duration-150',
                          !resultExpanded && '-rotate-90',
                        )}
                      />
                      Result
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div
                      className={cn(
                        'scrollbar-hover-only',
                        capMaxHeight
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
        capMaxHeight ? (streaming ? 'max-h-32!' : 'max-h-80!') : undefined
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
  capMaxHeight,
  hostname,
}: {
  capMaxHeight?: boolean;
  hostname?: string;
}) => {
  return (
    <div className="pointer-events-none flex flex-row items-center justify-start gap-1">
      <div className="pointer-events-auto flex flex-row items-center justify-start gap-1">
        <span
          className={cn('shrink-0 text-xs', !capMaxHeight && 'font-normal')}
        >
          {capMaxHeight ? (
            'Ran script'
          ) : (
            <span className="font-medium">Ran script</span>
          )}
          <span className="font-normal opacity-75">
            {hostname ? ` in ${hostname}` : ''}
          </span>
        </span>
      </div>
    </div>
  );
};

const LoadingHeader = ({
  disableShimmer,
  hostname,
}: {
  disableShimmer?: boolean;
  hostname?: string;
}) => {
  const text = hostname
    ? `Running script in ${hostname}...`
    : 'Running console script...';
  return (
    <div className="flex flex-row items-center justify-start gap-1">
      <Loader2Icon
        className={cn(
          'size-3 shrink-0 animate-spin text-primary-foreground',
          disableShimmer ? '' : 'text-primary-foreground',
        )}
      />
      <span
        dir="ltr"
        className={cn('text-xs', disableShimmer ? '' : 'shimmer-text-primary')}
      >
        {text}
      </span>
    </div>
  );
};
