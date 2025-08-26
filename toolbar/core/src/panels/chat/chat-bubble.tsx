import { Button } from '@/components/ui/button';
import { cn } from '@/utils';
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
  CogIcon,
  EyeIcon,
  FileIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from 'lucide-react';
import { memo, useMemo, useCallback, Fragment } from 'react';
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
import { getToolDescription } from './chat-bubble-tool-diff';

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
              case 'tool-deleteFileTool':
              case 'tool-globTool':
              case 'tool-grepSearchTool':
              case 'tool-listFilesTool':
              case 'tool-readFileTool':
              case 'tool-multiEditTool':
              case 'tool-overwriteFileTool':
              case 'dynamic-tool':
                return (
                  <ToolPartItem
                    key={`content_part_${index.toString()}`}
                    toolPart={part}
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
  if (filePart.type.startsWith('image/')) {
    return (
      <a href={filePart.url} target="_blank" rel="noopener noreferrer">
        <img
          src={filePart.url}
          alt={filePart.filename ?? 'Generated file'}
          className="h-auto max-w-full rounded-lg"
        />
      </a>
    );
  }
  return (
    <div
      role="button"
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-black/5 p-2 hover:bg-black/10"
      onClick={() => {
        window.open(filePart.url, '_blank');
      }}
    >
      <FileIcon className="size-4" />
      <span className="text-xs">{filePart.filename ?? 'Generated file'}</span>
    </div>
  );
});

const ToolPartItem = memo(
  ({ toolPart }: { toolPart: ToolPart | DynamicToolUIPart }) => {
    const approveToolCall = useKartonProcedure((p) => p.approveToolCall);
    const rejectToolCall = useKartonProcedure((p) => p.rejectToolCall);
    const toolCallApprovalRequests = useKartonState(
      (s) => s.toolCallApprovalRequests,
    );

    const requiresApproval = useMemo(
      () =>
        toolCallApprovalRequests.includes(toolPart.toolCallId) &&
        (toolPart.state === 'output-available' ||
          toolPart.state === 'output-error'),
      [toolCallApprovalRequests, toolPart.toolCallId, toolPart.state],
    );

    return (
      <div className="-mx-1 flex flex-col gap-2 rounded-xl bg-zinc-500/5 px-2 py-0.5">
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
            <CheckIcon className="size-3 text-green-600" />
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
