import { Button } from '@/components/ui/button';
import { cn, openFileUrl } from '@/utils';
import type {
  ToolPart,
  ChatMessage,
  TextUIPart,
  FileUIPart,
  DynamicToolUIPart,
  ReasoningUIPart,
  AgentError,
} from '@stagewise/karton-contract';
import { AgentErrorType } from '@stagewise/karton-contract';
import { RefreshCcwIcon, Redo2 } from 'lucide-react';
import {
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CogIcon,
  EyeIcon,
  FileIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from 'lucide-react';
import { memo, useMemo, useCallback, Fragment, useState } from 'react';
import TimeAgo from 'react-timeago';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { useChatState } from '@/hooks/use-chat-state';
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from '@headlessui/react';
import ReactMarkdown from 'react-markdown';
import { getToolDescription, isFileEditTool } from './chat-bubble-tool-diff';
import { diffLines } from 'diff';

export function ChatBubble({
  message: msg,
  chatError,
}: {
  message: ChatMessage;
  chatError?: AgentError;
}) {
  const retrySendingUserMessage = useKartonProcedure(
    (p) => p.retrySendingUserMessage,
  );
  const undoToolCallsUntilUserMessage = useKartonProcedure(
    (p) => p.undoToolCallsUntilUserMessage,
  );
  const activeChatId = useKartonState((s) => s.activeChatId);
  const isWorking = useKartonState((s) => s.isWorking);
  const { setChatInput, addChatDomContext } = useChatState();

  const confirmRestore = useCallback(async () => {
    if (!msg.id || !activeChatId) return;

    // Extract text content from message parts
    const textContent = msg.parts
      .filter((part) => part.type === 'text')
      .map((part) => (part as TextUIPart).text)
      .join('\n');

    // Populate the input with the text content
    setChatInput(textContent);

    // Restore selected elements if they exist
    if (msg.metadata?.browserData?.selectedElements) {
      // Try to find and restore the elements using their xpath
      msg.metadata.browserData.selectedElements.forEach((element) => {
        try {
          // Try to find the element using xpath
          const iframe = document.getElementById(
            'user-app-iframe',
          ) as HTMLIFrameElement;
          const result = document.evaluate(
            element.xpath,
            iframe?.contentDocument || document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          );

          if (
            result.singleNodeValue &&
            result.singleNodeValue instanceof HTMLElement
          ) {
            addChatDomContext(result.singleNodeValue as HTMLElement);
          }
        } catch (_e) {
          // If xpath lookup fails, we can't restore this element
          console.warn('Could not restore element:', element.xpath);
        }
      });
    }

    // Call the undo procedure to revert changes
    await undoToolCallsUntilUserMessage(msg.id, activeChatId);
  }, [
    msg,
    activeChatId,
    setChatInput,
    addChatDomContext,
    undoToolCallsUntilUserMessage,
  ]);

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'mt-2 flex w-full shrink-0 items-center justify-start gap-2',
          msg.role === 'assistant' ? 'flex-row' : 'flex-row-reverse',
        )}
      >
        <div
          className={cn(
            'group relative min-h-8 animate-chat-bubble-appear space-y-3 break-words rounded-2xl bg-white/5 px-2.5 py-1.5 font-normal text-sm shadow-lg shadow-zinc-950/10 ring-1 ring-inset last:mb-0.5',
            msg.role === 'assistant'
              ? 'min-w-48 origin-bottom-left rounded-bl-xs bg-zinc-100/60 text-zinc-950 ring-zinc-950/5'
              : 'origin-bottom-right rounded-br-xs bg-blue-600/90 text-white ring-white/5',
          )}
        >
          <div
            className={cn(
              'group-hover:-top-3 -top-2 absolute z-20 w-max rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-zinc-950/80 opacity-0 shadow-sm ring-1 ring-zinc-500/10 ring-inset transition-all duration-150 ease-out group-hover:opacity-100',
              msg.role === 'assistant' ? 'left-1' : 'right-1',
            )}
          >
            <TimeAgo date={msg.metadata.createdAt} />
          </div>
          {msg.parts.map((part, index) => {
            if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
              return (
                <ToolPartItem
                  key={`content_part_${index.toString()}`}
                  toolPart={part as ToolPart | DynamicToolUIPart}
                />
              );
            }
            switch (part.type) {
              case 'text':
                return (
                  <TextPartItem
                    key={`content_part_${index.toString()}`}
                    textPart={part}
                  />
                );
              case 'reasoning':
                return (
                  <ReasoningPartItem
                    key={`content_part_${index.toString()}`}
                    reasoningPart={part}
                  />
                );
              case 'file':
                return (
                  <FilePartItem
                    key={`content_part_${index.toString()}`}
                    filePart={part}
                  />
                );
              default:
                return null;
            }
          })}
        </div>

        {msg.role === 'user' && msg.id && !isWorking && (
          <Popover className="relative">
            {({ close }) => (
              <>
                <PopoverButton
                  type="button"
                  aria-label="Restore checkpoint"
                  className="mr-1 cursor-pointer text-zinc-600 transition-colors hover:text-zinc-900 focus:outline-none"
                >
                  <Redo2 className="size-4" />
                </PopoverButton>

                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-200"
                  enterFrom="opacity-0 translate-y-1 scale-95"
                  enterTo="opacity-100 translate-y-0 scale-100"
                  leave="transition ease-in duration-150"
                  leaveFrom="opacity-100 translate-y-0 scale-100"
                  leaveTo="opacity-0 translate-y-1 scale-95"
                >
                  <PopoverPanel
                    anchor="top start"
                    className="overflow-visible! z-[9999] w-64 p-1 [--anchor-gap:8px]"
                  >
                    <div className="rounded-xl bg-white/95 p-3 shadow-xl ring-1 ring-zinc-950/10 ring-inset backdrop-blur-lg">
                      <p className="font-medium text-sm text-zinc-950">
                        Restore checkpoint?
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        This will clear the chat history and undo file changes
                        after this point.
                      </p>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => close()}
                          className="h-7 px-2 py-1 text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            confirmRestore();
                            close();
                          }}
                          className="h-7 px-2 py-1 text-xs"
                        >
                          Restore
                        </Button>
                      </div>
                    </div>
                  </PopoverPanel>
                </Transition>
              </>
            )}
          </Popover>
        )}

        <div className="flex h-full min-w-12 grow flex-row items-center justify-start">
          {msg.role === 'assistant' &&
            chatError?.type === AgentErrorType.AGENT_ERROR && (
              <Button
                aria-label={'Retry'}
                variant="secondary"
                glassy
                onClick={() => void retrySendingUserMessage()}
                className="!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg hover:bg-white/60 active:bg-zinc-50/60 disabled:bg-transparent disabled:shadow-none disabled:*:stroke-zinc-500/50"
              >
                <RefreshCcwIcon className="size-4" />
              </Button>
            )}
        </div>
      </div>
    </div>
  );
}

const TextPartItem = memo(({ textPart }: { textPart: TextUIPart }) => {
  return (
    <div className="markdown">
      <ReactMarkdown>{textPart.text}</ReactMarkdown>
    </div>
  );
});

const ReasoningPartItem = memo(
  ({ reasoningPart }: { reasoningPart: ReasoningUIPart }) => {
    return (
      <div className="-mx-1 block min-w-32 rounded-xl border-border/20 bg-zinc-500/5 px-2 py-0.5">
        <Disclosure>
          <DisclosureButton className="group flex w-full flex-row items-center justify-between gap-2 text-black/60 hover:text-black/90">
            <BrainIcon className="size-3" />
            <span className="block flex-1 text-start text-xs">Thinking...</span>
            <ChevronDownIcon
              className={
                'size-3 transition-all duration-150 ease-out group-hover:stroke-black group-data-open:rotate-180'
              }
            />
          </DisclosureButton>
          <DisclosurePanel className="markdown pt-1.5 pb-0.5 pl-1 opacity-80">
            <ReactMarkdown>{reasoningPart.text}</ReactMarkdown>
          </DisclosurePanel>
        </Disclosure>
      </div>
    );
  },
);

const FilePartItem = memo(({ filePart }: { filePart: FileUIPart }) => {
  const isImage = filePart.mediaType.startsWith('image/');

  return (
    <div
      role="button"
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-black/5 p-2 hover:bg-black/10"
      onClick={() => {
        void openFileUrl(filePart.url, filePart.filename);
      }}
    >
      {isImage ? (
        <img
          src={filePart.url}
          alt={filePart.filename ?? 'Generated file'}
          className="size-4 rounded object-cover"
        />
      ) : (
        <FileIcon className="size-4" />
      )}
      <span className="text-xs">{filePart.filename ?? 'Generated file'}</span>
    </div>
  );
});

const DiffDisplay = memo(
  ({ toolPart }: { toolPart: ToolPart | DynamicToolUIPart }) => {
    if (!isFileEditTool(toolPart) || !toolPart.output?.diff) return null;

    const { diff } = toolPart.output;

    // Handle different diff types
    let beforeContent = '';
    let afterContent = '';
    let isOmitted = false;

    if (diff.changeType === 'create') {
      if ('omitted' in diff && diff.omitted) {
        isOmitted = true;
      } else if ('after' in diff) {
        afterContent = diff.after;
      }
    } else if (diff.changeType === 'delete') {
      if ('omitted' in diff && diff.omitted) {
        isOmitted = true;
      } else if ('before' in diff) {
        beforeContent = diff.before;
      }
    } else if (diff.changeType === 'modify') {
      if (diff.beforeOmitted && diff.afterOmitted) {
        isOmitted = true;
      } else {
        if ('before' in diff && !diff.beforeOmitted) {
          beforeContent = diff.before;
        }
        if ('after' in diff && !diff.afterOmitted) {
          afterContent = diff.after;
        }
        if (diff.beforeOmitted || diff.afterOmitted) {
          isOmitted = true;
        }
      }
    }

    // Don't show diff if content is omitted
    if (isOmitted) {
      return (
        <div className="mt-2 rounded-lg bg-zinc-100/50 p-2 text-xs text-zinc-600">
          <span className="italic">Diff content omitted (file too large)</span>
        </div>
      );
    }

    const changes = diffLines(beforeContent, afterContent);

    // Process changes to show context lines
    const processedChanges: Array<{
      type: 'add' | 'remove' | 'context';
      lines: string[];
    }> = [];

    changes.forEach((part, index) => {
      const lines = (part.value || '').split('\n').filter((l, i, arr) => {
        // Remove empty last line if it's the result of split
        return !(i === arr.length - 1 && l === '');
      });

      if (part.added) {
        processedChanges.push({ type: 'add', lines });
      } else if (part.removed) {
        processedChanges.push({ type: 'remove', lines });
      } else {
        // Context lines - show only 1 line before and after changes
        if (lines.length > 0) {
          const contextLines: string[] = [];

          // If this is the first part or last part, show 1 line
          if (index === 0 && lines.length > 0) {
            contextLines.push(lines[lines.length - 1]);
          } else if (index === changes.length - 1 && lines.length > 0) {
            contextLines.push(lines[0]);
          } else if (lines.length === 1) {
            contextLines.push(lines[0]);
          } else if (lines.length > 1) {
            // Show last line of context before and first line after
            contextLines.push(lines[lines.length - 1]);
            if (index < changes.length - 1) {
              contextLines.push(lines[0]);
            }
          }

          if (contextLines.length > 0) {
            processedChanges.push({ type: 'context', lines: contextLines });
          }
        }
      }
    });

    return (
      <div className="mt-2 overflow-x-auto rounded-lg bg-zinc-900 font-mono text-xs">
        <div className="min-w-fit">
          {processedChanges.map((change, idx) => (
            <div key={`${change.type}-${idx}-${change.lines.length}`}>
              {change.lines.map((line, lineIdx) => (
                <div
                  key={`${change.type}-${idx}-${lineIdx}-${line.slice(0, 20)}`}
                  className={cn(
                    'whitespace-pre px-2 py-0.5',
                    change.type === 'add' && 'bg-green-900/30 text-green-300',
                    change.type === 'remove' && 'bg-red-900/30 text-red-300',
                    change.type === 'context' && 'text-zinc-400',
                  )}
                >
                  <span className="select-none opacity-50">
                    {change.type === 'add'
                      ? '+'
                      : change.type === 'remove'
                        ? '-'
                        : ' '}
                  </span>{' '}
                  {line}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  },
);

const ToolPartItem = memo(
  ({ toolPart }: { toolPart: ToolPart | DynamicToolUIPart }) => {
    const approveToolCall = useKartonProcedure((p) => p.approveToolCall);
    const rejectToolCall = useKartonProcedure((p) => p.rejectToolCall);
    const toolCallApprovalRequests = useKartonState(
      (s) => s.toolCallApprovalRequests,
    );
    const [isExpanded, setIsExpanded] = useState(false);

    const requiresApproval = useMemo(
      () =>
        toolCallApprovalRequests.includes(toolPart.toolCallId) &&
        (toolPart.state === 'output-available' ||
          toolPart.state === 'output-error'),
      [toolCallApprovalRequests, toolPart.toolCallId, toolPart.state],
    );

    const canShowDiff = useMemo(
      () =>
        isFileEditTool(toolPart) &&
        toolPart.state === 'output-available' &&
        toolPart.output?.diff &&
        (toolPart.output.diff.changeType === 'modify' ||
          toolPart.output.diff.changeType === 'create' ||
          toolPart.output.diff.changeType === 'delete'),
      [toolPart],
    );

    const handleContainerClick = useCallback(() => {
      if (canShowDiff) {
        setIsExpanded(!isExpanded);
      }
    }, [canShowDiff, isExpanded]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (canShowDiff && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          setIsExpanded(!isExpanded);
        }
      },
      [canShowDiff, isExpanded],
    );

    const containerProps = {
      className: cn(
        '-mx-1 flex flex-col gap-2 rounded-xl bg-zinc-500/5 px-2 py-0.5',
        canShowDiff && 'cursor-pointer',
      ),
      ...(canShowDiff && {
        onClick: handleContainerClick,
        onKeyDown: handleKeyDown,
        role: 'button' as const,
        tabIndex: 0,
      }),
    };

    return (
      <div {...containerProps}>
        <div className="flex w-full flex-row items-center justify-between gap-2 stroke-black/60">
          {getToolIcon(toolPart)}
          <div className="flex flex-1 flex-col items-start gap-0">
            {getToolDescription(toolPart)}
            {toolPart.state === 'output-error' && (
              <span className="text-rose-600 text-xs">
                {toolPart.errorText}
              </span>
            )}
            {requiresApproval && (
              <span className="text-black/50 text-xs italic">
                Waiting for approval
              </span>
            )}
          </div>
          {requiresApproval && (
            <div className="flex flex-row items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-4 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  rejectToolCall(toolPart.toolCallId);
                }}
              >
                <XIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-4 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  approveToolCall(toolPart.toolCallId);
                }}
              >
                <CheckIcon className="size-4" />
              </Button>
            </div>
          )}
          {toolPart.state === 'output-available' && (
            <>
              <CheckIcon className="size-3 text-green-600" />
              {canShowDiff && (
                <div className="transition-transform duration-150">
                  <ChevronRightIcon
                    className={cn(
                      'size-3 text-zinc-600 transition-transform',
                      isExpanded && 'rotate-90',
                    )}
                  />
                </div>
              )}
            </>
          )}
          {toolPart.state === 'output-error' && (
            <XIcon className="size-3 text-rose-600" />
          )}
          {(toolPart.state === 'input-streaming' ||
            toolPart.state === 'input-available') &&
            !requiresApproval && (
              <CogIcon className="size-3 animate-spin text-blue-600" />
            )}
        </div>
        {isExpanded && canShowDiff && <DiffDisplay toolPart={toolPart} />}
      </div>
    );
  },
);

const getToolIcon = (toolPart: ToolPart | DynamicToolUIPart) => {
  switch (toolPart.type) {
    case 'tool-readFileTool':
    case 'tool-listFilesTool':
      return <EyeIcon className="size-3" />;
    case 'tool-grepSearchTool':
    case 'tool-globTool':
      return <SearchIcon className="size-3" />;
    case 'tool-overwriteFileTool':
    case 'tool-multiEditTool':
      return <PencilIcon className="size-3" />;
    case 'tool-deleteFileTool':
      return <TrashIcon className="size-3" />;
    case 'dynamic-tool':
      return <CogIcon className="size-3" />;
    default:
      return <CogIcon className="size-3" />;
  }
};
