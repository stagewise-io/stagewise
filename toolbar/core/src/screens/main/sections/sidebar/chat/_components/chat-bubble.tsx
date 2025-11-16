import { cn } from '@/utils';
import type {
  ToolPart,
  ChatMessage,
  TextUIPart,
  FileUIPart,
  ReasoningUIPart,
  AgentError,
  UIMessagePart,
} from '@stagewise/karton-contract';
import { AgentErrorType } from '@stagewise/karton-contract';
import { RefreshCcwIcon, Undo2 } from 'lucide-react';
import { useMemo, useCallback, useState, useEffect } from 'react';
import TimeAgo from 'react-timeago';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { useChatState } from '@/hooks/use-chat-state';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
  PopoverFooter,
  PopoverClose,
} from '@stagewise/stage-ui/components/popover';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  isInteractionToolPart,
  InteractionToolPartItem,
  type InteractionToolPart,
} from './user-interaction-tool-part';
import { ThinkingPart } from './message-part-ui/thinking';
import { FilePart } from './message-part-ui/file';
import { TextPart } from './message-part-ui/text';
import { DeleteFileToolPart } from './message-part-ui/tools/delete-file';
import { GlobToolPart } from './message-part-ui/tools/glob';
import { GrepSearchToolPart } from './message-part-ui/tools/grep-search';
import { ListFilesToolPart } from './message-part-ui/tools/list-files';
import { MultiEditToolPart } from './message-part-ui/tools/multi-edit';
import { OverwriteFileToolPart } from './message-part-ui/tools/overwrite-file';
import { ReadFileToolPart } from './message-part-ui/tools/read-file';
import { ContextElementsChipsFlexible } from '@/components/context-elements-chips-flexible';

function isToolPart(part: UIMessagePart): part is ToolPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

export function ChatBubble({
  message: msg,
  chatError,
  isLastMessage,
}: {
  message: ChatMessage;
  chatError?: AgentError;
  isLastMessage: boolean;
}) {
  const retrySendingUserMessage = useKartonProcedure(
    (p) => p.agentChat.retrySendingUserMessage,
  );
  const undoToolCallsUntilUserMessage = useKartonProcedure(
    (p) => p.agentChat.undoToolCallsUntilUserMessage,
  );
  const undoToolCallsUntilLatestUserMessage = useKartonProcedure(
    (p) => p.agentChat.undoToolCallsUntilLatestUserMessage,
  );
  const assistantMadeCodeChangesUntilLatestUserMessage = useKartonProcedure(
    (p) => p.agentChat.assistantMadeCodeChangesUntilLatestUserMessage,
  );
  const activeChatId = useKartonState(
    (s) => s.workspace?.agentChat?.activeChatId || null,
  );
  const isWorking = useKartonState(
    (s) => s.workspace?.agentChat?.isWorking || false,
  );
  const { setChatInput } = useChatState();
  const [hasCodeChanges, setHasCodeChanges] = useState(false);
  const isEmptyMessage = useMemo(() => {
    if (
      msg.parts
        .map((part) => part.type)
        .some(
          (type) =>
            type === 'dynamic-tool' ||
            type.startsWith('tool-') ||
            type === 'file',
        )
    )
      return false;

    return msg.parts.every(
      (part) =>
        (part.type !== 'text' && part.type !== 'reasoning') ||
        ((part.type === 'text' || part.type === 'reasoning') &&
          part.text.trim() === ''),
    );
  }, [msg.parts]);

  useEffect(() => {
    if (
      msg.role === 'assistant' &&
      isLastMessage &&
      !isWorking &&
      activeChatId
    ) {
      const checkCodeChanges = async () => {
        try {
          const hasChanges =
            await assistantMadeCodeChangesUntilLatestUserMessage(activeChatId);
          setHasCodeChanges(hasChanges);
        } catch (error) {
          console.warn('Failed to check for code changes:', error);
          setHasCodeChanges(false);
        }
      };
      void checkCodeChanges();
    } else {
      setHasCodeChanges(false);
    }
  }, [
    msg.role,
    isLastMessage,
    isWorking,
    activeChatId,
    assistantMadeCodeChangesUntilLatestUserMessage,
  ]);

  const confirmRestore = useCallback(async () => {
    if (!msg.id || !activeChatId) return;

    const textContent = msg.parts
      .filter((part) => part.type === 'text')
      .map((part) => (part as TextUIPart).text)
      .join('\n');

    setChatInput(textContent);
    try {
      await undoToolCallsUntilUserMessage(msg.id, activeChatId);
    } catch (error) {
      console.warn('Failed to undo tool calls:', error);
    }
  }, [msg.id, activeChatId, setChatInput, undoToolCallsUntilUserMessage]);

  const confirmUndo = useCallback(async () => {
    if (!activeChatId) return;

    try {
      const latestUserMessage =
        await undoToolCallsUntilLatestUserMessage(activeChatId);
      if (!latestUserMessage) {
        console.warn('Could not find latest user message');
        return;
      }

      // Extract text content from message parts
      const textContent = latestUserMessage.parts
        .filter((part) => part.type === 'text')
        .map((part) => (part as TextUIPart).text)
        .join('\n');

      // Populate the input with the text content
      setChatInput(textContent);
    } catch (error) {
      console.warn('Failed to undo tool calls:', error);
    }

    // TODO: restore selected elements
  }, [activeChatId, setChatInput, undoToolCallsUntilLatestUserMessage]);

  const selectedPreviewElements = useMemo(() => {
    return msg.metadata?.selectedPreviewElements ?? [];
  }, [msg.metadata?.selectedPreviewElements]);
  const fileAttachments = useMemo(() => {
    return msg.parts.filter((part) => part.type === 'file') as FileUIPart[];
  }, [msg.parts]);

  if (isEmptyMessage) return null; // Message parts start long before the message is sent - bubble should only show after the first chunk is received

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'group/chat-bubble mt-2 flex w-full shrink-0 items-center justify-start gap-2',
          msg.role === 'assistant' ? 'flex-row' : 'flex-row-reverse',
        )}
      >
        <div className="flex max-w-full flex-col items-start gap-2">
          <div
            className={cn(
              'glass-body group relative min-h-8 max-w-full animate-chat-bubble-appear space-y-3 break-words rounded-2xl bg-white/5 px-3 py-2 font-normal text-sm last:mb-0.5',
              msg.role === 'assistant'
                ? 'min-w-1/3 origin-bottom-left rounded-bl-xs bg-zinc-100/60 pl-4 text-zinc-950 dark:bg-zinc-800/60 dark:text-zinc-50'
                : 'origin-bottom-right rounded-br-xs bg-blue-600/90 pr-4 text-white',
              msg.parts.length > 1 && 'w-full',
              msg.role === 'user' &&
                '[--color-background:var(--color-blue-600)] [--color-busy:var(--color-blue-200)] [--color-error:var(--color-rose-200)] [--color-foreground:var(--color-white)] [--color-muted-background:var(--color-blue-500)] [--color-muted-foreground:var(--color-blue-200)] [--color-primary:var(--color-blue-200)] [--color-success:var(--color-green-200)]',
              msg.role === 'user'
                ? 'group/chat-bubble-user'
                : 'group/chat-bubble-assistant',
            )}
          >
            <div
              className={cn(
                'group-hover/chat-bubble:-top-3 -top-2 absolute z-20 w-auto max-w-36 whitespace-nowrap rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-zinc-950/80 opacity-0 shadow-sm ring-1 ring-zinc-500/10 ring-inset transition-all duration-150 ease-out group-hover/chat-bubble:opacity-100',
                msg.role === 'assistant' ? 'left-1' : 'right-1',
              )}
            >
              {(() => {
                const createdAt = msg.metadata?.createdAt
                  ? new Date(msg.metadata.createdAt)
                  : new Date();
                const now = new Date();
                const diffMs = now.getTime() - createdAt.getTime();
                const diffMins = diffMs / 60000;
                if (diffMins >= 1) {
                  return <TimeAgo date={createdAt} />;
                }
                return 'Just now';
              })()}
            </div>
            {(() => {
              const typeCounters: Record<string, number> = {};
              return msg.parts.map((part, index) => {
                const currentTypeIndex = typeCounters[part.type] ?? 0;
                typeCounters[part.type] = currentTypeIndex + 1;
                const stableKey = `${msg.id}:${part.type}:${currentTypeIndex}`;

                if (isToolPart(part) && isInteractionToolPart(part)) {
                  return (
                    <InteractionToolPartItem
                      key={stableKey}
                      toolPart={part as InteractionToolPart}
                    />
                  );
                }
                switch (part.type) {
                  case 'text':
                    return (
                      <TextPart key={stableKey} part={part as TextUIPart} />
                    );
                  case 'reasoning':
                    if (part.text.trim() === '') return null; // Sometimes, empty reasoning parts are returned
                    return (
                      <ThinkingPart
                        key={stableKey}
                        thinkingDuration={msg.metadata?.thinkingDuration}
                        part={part as ReasoningUIPart}
                        isLastPart={index === msg.parts.length - 1}
                      />
                    );
                  case 'file':
                    return (
                      <FilePart key={stableKey} part={part as FileUIPart} />
                    );
                  case 'tool-deleteFileTool':
                    return <DeleteFileToolPart key={stableKey} part={part} />;
                  case 'tool-globTool':
                    return <GlobToolPart key={stableKey} part={part} />;
                  case 'tool-grepSearchTool':
                    return <GrepSearchToolPart key={stableKey} part={part} />;
                  case 'tool-listFilesTool':
                    return <ListFilesToolPart key={stableKey} part={part} />;
                  case 'tool-multiEditTool':
                    return <MultiEditToolPart key={stableKey} part={part} />;
                  case 'tool-overwriteFileTool':
                    return (
                      <OverwriteFileToolPart key={stableKey} part={part} />
                    );
                  case 'tool-readFileTool':
                    return <ReadFileToolPart key={stableKey} part={part} />;
                  default:
                    return null;
                }
              });
            })()}
            {(fileAttachments.length > 0 ||
              selectedPreviewElements.length > 0) && (
              <div className="flex flex-row flex-wrap gap-2">
                <ContextElementsChipsFlexible
                  selectedElements={selectedPreviewElements.map(
                    (selectedPreviewElement) => ({
                      selectedElement: selectedPreviewElement,
                    }),
                  )}
                />
              </div>
            )}
          </div>
          {msg.role === 'assistant' &&
            isLastMessage &&
            !isWorking &&
            hasCodeChanges && (
              <Popover>
                <PopoverTrigger>
                  <Button variant="secondary" size="xs">
                    Undo changes
                    <Undo2 className="size-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent>
                  <PopoverTitle>Undo changes?</PopoverTitle>
                  <PopoverDescription>
                    This will undo all changes the assistant made since your
                    last message.
                  </PopoverDescription>
                  <PopoverClose />
                  <PopoverFooter>
                    <Button variant="primary" size="sm" onClick={confirmUndo}>
                      Undo
                    </Button>
                  </PopoverFooter>
                </PopoverContent>
              </Popover>
            )}
        </div>

        {msg.role === 'user' && msg.id && !isWorking && (
          <Popover>
            <PopoverTrigger>
              <Button
                aria-label="Restore checkpoint"
                variant="secondary"
                size="icon-sm"
                className="shrink-0 opacity-0 blur-xs transition-all group-hover/chat-bubble:scale-100 group-hover/chat-bubble:opacity-100 group-hover/chat-bubble:blur-none"
              >
                <Undo2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <PopoverTitle>Restore checkpoint?</PopoverTitle>
              <PopoverDescription>
                This will clear the chat history and undo file changes after
                this point.
              </PopoverDescription>
              <PopoverClose />
              <PopoverFooter>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    confirmRestore();
                  }}
                >
                  Restore
                </Button>
              </PopoverFooter>
            </PopoverContent>
          </Popover>
        )}

        <div className="flex h-full min-w-12 grow flex-row items-center justify-start">
          {msg.role === 'assistant' &&
            chatError?.type === AgentErrorType.AGENT_ERROR && (
              <Button
                aria-label={'Retry'}
                variant="secondary"
                size="icon-sm"
                className="opacity-0 blur-xs group-hover:opacity-100 group-hover:blur-none"
                onClick={() => void retrySendingUserMessage()}
              >
                <RefreshCcwIcon className="size-4" />
              </Button>
            )}
        </div>
      </div>
    </div>
  );
}
