import { cn } from '@/utils';
import type {
  ToolPart,
  ChatMessage,
  TextUIPart,
  FileUIPart,
  ReasoningUIPart,
  UIMessagePart,
  ToolUIPart,
  DynamicToolUIPart,
} from '@shared/karton-contracts/ui';
import { Undo2 } from 'lucide-react';
import { useMemo, useCallback, useState, useEffect, memo } from 'react';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { useChatActions } from '@/hooks/use-chat-state';
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
import { MultiEditToolPart } from './message-part-ui/tools/multi-edit';
import { OverwriteFileToolPart } from './message-part-ui/tools/overwrite-file';
import { SelectedElementsChipsFlexible } from '@/components/selected-elements-chips-flexible';
import type { SelectedElement } from '@shared/selected-elements';
import {
  ExploringToolParts,
  isReadOnlyToolPart,
  type ReadOnlyToolPart,
} from './message-part-ui/tools/exploring';
import { UnknownToolPart } from './message-part-ui/tools/unknown';
import { ExecuteConsoleScriptToolPart } from './message-part-ui/tools/execute-console-script';
import { ReadConsoleLogsToolPart } from './message-part-ui/tools/read-console-logs';

function isToolPart(part: UIMessagePart): part is ToolPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

function isToolOrReasoningPart(
  part: UIMessagePart,
): part is ToolPart | ReasoningUIPart {
  return (
    part.type === 'dynamic-tool' ||
    part.type.startsWith('tool-') ||
    part.type === 'reasoning'
  );
}

export const ChatBubble = memo(
  function ChatBubble({
    message: msg,
    isLastMessage,
  }: {
    message: ChatMessage;
    isLastMessage: boolean;
  }) {
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
      (s) => s.agentChat?.activeChatId || null,
    );
    const isWorking = useKartonState((s) => s.agentChat?.isWorking || false);
    const { setChatInput } = useChatActions();
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
              await assistantMadeCodeChangesUntilLatestUserMessage(
                activeChatId,
              );
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
                'group wrap-break-word relative min-h-8 max-w-full animate-chat-bubble-appear select-text space-y-3 rounded-xl px-2.5 py-1.5 font-normal text-sm last:mb-0.5',
                msg.role === 'assistant'
                  ? 'min-w-1/3 origin-bottom-left rounded-bl-sm border border-muted-foreground/10 bg-zinc-100/60 text-foreground dark:bg-zinc-700/50'
                  : 'origin-bottom-right rounded-br-sm border border-muted-foreground/10 bg-blue-600/90 text-white',
                msg.parts.length > 1 && 'w-full',
                msg.role === 'user' &&
                  '[--color-background:var(--color-blue-600)] [--color-busy:var(--color-blue-200)] [--color-error:var(--color-rose-200)] [--color-foreground:var(--color-white)] [--color-muted-background:var(--color-blue-500)] [--color-muted-foreground:var(--color-blue-200)] [--color-primary:var(--color-blue-200)] [--color-success:var(--color-green-200)]',
                msg.role === 'user'
                  ? 'group/chat-bubble-user'
                  : 'group/chat-bubble-assistant',
              )}
            >
              {(() => {
                // Merge read-only tools into the previous tool part
                const parts = msg.parts.reduce(
                  (acc, part) => {
                    // Skip step-start parts, they don't contain information we need to render and break the ReadOnly-Part detection logic
                    if (part.type === 'step-start') return acc;
                    // Forward everything except read-only tools
                    if (
                      !isToolOrReasoningPart(part) ||
                      !isReadOnlyToolPart(part)
                    )
                      acc.push(part);

                    const previousPart = acc[acc.length - 1];
                    // Merge read-only tools into the previous tool-part-array if one already exists
                    if (
                      isToolOrReasoningPart(part) &&
                      isReadOnlyToolPart(part) &&
                      Array.isArray(previousPart)
                    ) {
                      previousPart.push(part);
                    }
                    // Turn read-only tools into an array of parts if no previous tool-part-array exists
                    else if (
                      isToolOrReasoningPart(part) &&
                      isReadOnlyToolPart(part)
                    )
                      acc.push([part]);

                    return acc;
                  },
                  [] as (UIMessagePart | ReadOnlyToolPart[])[],
                );

                const typeCounters: Record<string, number> = {};

                return parts.map((part, index) => {
                  if (Array.isArray(part))
                    return (
                      // Handles glob, grep, listFiles, readFile tools
                      <ExploringToolParts
                        parts={part}
                        thinkingDurations={msg.metadata?.thinkingDurations}
                        isAutoExpanded={index === parts.length - 1}
                        isShimmering={
                          isWorking &&
                          index === parts.length - 1 &&
                          isLastMessage
                        }
                      />
                    );

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
                        <TextPart
                          key={stableKey}
                          part={part as TextUIPart}
                          role={msg.role}
                        />
                      );
                    case 'reasoning':
                      if (part.text.trim() === '') return null; // Sometimes, empty reasoning parts are returned
                      return (
                        <ThinkingPart
                          key={stableKey}
                          thinkingDuration={
                            msg.metadata?.thinkingDurations?.[currentTypeIndex]
                          }
                          part={part as ReasoningUIPart}
                          isAutoExpanded={index === parts.length - 1}
                          isShimmering={
                            isWorking &&
                            part.state === 'streaming' &&
                            index === parts.length - 1 &&
                            isLastMessage
                          }
                        />
                      );
                    case 'file':
                      return (
                        <FilePart key={stableKey} part={part as FileUIPart} />
                      );
                    case 'tool-deleteFileTool':
                      return <DeleteFileToolPart key={stableKey} part={part} />;
                    case 'tool-multiEditTool':
                      return <MultiEditToolPart key={stableKey} part={part} />;
                    case 'tool-executeConsoleScriptTool':
                      return (
                        <ExecuteConsoleScriptToolPart
                          key={stableKey}
                          part={part}
                        />
                      );
                    case 'tool-readConsoleLogsTool':
                      return (
                        <ReadConsoleLogsToolPart key={stableKey} part={part} />
                      );
                    case 'tool-overwriteFileTool':
                      return (
                        <OverwriteFileToolPart key={stableKey} part={part} />
                      );
                    default:
                      return (
                        <UnknownToolPart
                          shimmer={
                            isWorking &&
                            index === parts.length - 1 &&
                            isLastMessage
                          }
                          key={stableKey}
                          part={part as ToolUIPart | DynamicToolUIPart}
                        />
                      );
                  }
                });
              })()}

              {(fileAttachments.length > 0 ||
                selectedPreviewElements.length > 0) && (
                <div className="flex flex-row flex-wrap gap-2 pt-2">
                  <SelectedElementsChipsFlexible
                    selectedElements={
                      selectedPreviewElements as SelectedElement[]
                    }
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
        </div>
      </div>
    );
  },
  // Custom comparison to prevent re-renders when message object references change
  (prevProps, nextProps) => {
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.message.role !== nextProps.message.role) return false;
    if (prevProps.isLastMessage !== nextProps.isLastMessage) return false;
    if (prevProps.message.parts.length !== nextProps.message.parts.length)
      return false;

    // Deep compare parts by type and key content
    for (let i = 0; i < prevProps.message.parts.length; i++) {
      const prevPart = prevProps.message.parts[i];
      const nextPart = nextProps.message.parts[i];
      if (!prevPart || !nextPart) return false;
      if (prevPart.type !== nextPart.type) return false;

      // For text parts, compare text and state
      if (prevPart.type === 'text' && nextPart.type === 'text') {
        if (prevPart.text !== nextPart.text) return false;
        if (prevPart.state !== nextPart.state) return false;
      }
      // For reasoning parts, compare text and state
      if (prevPart.type === 'reasoning' && nextPart.type === 'reasoning') {
        if (prevPart.text !== nextPart.text) return false;
        if (prevPart.state !== nextPart.state) return false;
      }
      // For tool parts, compare state and input to allow streaming updates
      if (
        prevPart.type.startsWith('tool-') ||
        prevPart.type === 'dynamic-tool'
      ) {
        const prevState = (prevPart as any).state;
        const nextState = (nextPart as any).state;
        if (prevState !== nextState) return false;
        // Compare input by JSON stringification for deep equality
        const prevInput = JSON.stringify((prevPart as any).input);
        const nextInput = JSON.stringify((nextPart as any).input);
        if (prevInput !== nextInput) return false;
      }
    }

    return true;
  },
);
