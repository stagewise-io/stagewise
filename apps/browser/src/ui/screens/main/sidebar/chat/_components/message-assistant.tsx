import { cn } from '@/utils';
import { IconMagicWandSparkle } from 'nucleo-glass';
import type {
  ChatMessage,
  TextUIPart,
  FileUIPart,
  ReasoningUIPart,
  UIMessagePart,
  ToolUIPart,
  DynamicToolUIPart,
} from '@shared/karton-contracts/ui';
import { useMemo, memo } from 'react';
import { useKartonState } from '@/hooks/use-karton';
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
import {
  ExploringToolParts,
  isReadOnlyToolPart,
  type ReadOnlyToolPart,
} from './message-part-ui/tools/exploring';
import { UnknownToolPart } from './message-part-ui/tools/unknown';
import { ExecuteConsoleScriptToolPart } from './message-part-ui/tools/execute-console-script';
import { ReadConsoleLogsToolPart } from './message-part-ui/tools/read-console-logs';
import { isToolPart, isToolOrReasoningPart } from './message-utils';

type AssistantMessage = ChatMessage & { role: 'assistant' };

export const MessageAssistant = memo(
  function MessageAssistant({
    message: msg,
    isLastMessage,
  }: {
    message: AssistantMessage;
    isLastMessage: boolean;
  }) {
    const isWorking = useKartonState((s) => s.agentChat?.isWorking || false);

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

    if (isEmptyMessage && !isLastMessage) return null;

    return (
      <div className={cn('flex w-full flex-col gap-1')}>
        <div className="w-full">
          <div
            className={cn(
              'group/chat-bubble mt-2 flex w-full shrink-0 flex-row items-center justify-start gap-2',
              isEmptyMessage ? 'hidden' : '',
            )}
          >
            <div
              className={cn(
                'group group/chat-bubble-assistant wrap-break-word relative min-h-8 w-full min-w-1/3 max-w-xl origin-bottom-left select-text space-y-2 rounded-bl-sm py-1.5 font-normal text-foreground text-sm last:mb-0.5',
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
                let exploringGroupIndex = 0;

                return parts.map((part, index) => {
                  const isLastPart = index === parts.length - 1;
                  if (Array.isArray(part)) {
                    const stableKey = `${msg.id}:exploring:${exploringGroupIndex}`;
                    exploringGroupIndex++;
                    return (
                      // Handles glob, grep, listFiles, readFile tools
                      <ExploringToolParts
                        key={stableKey}
                        parts={part}
                        thinkingDurations={msg.metadata?.thinkingDurations}
                        isAutoExpanded={isLastPart}
                        isShimmering={isWorking && isLastPart && isLastMessage}
                      />
                    );
                  }

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
                      if ((part as TextUIPart).text.trim() === '') return null;
                      return (
                        <TextPart
                          key={stableKey}
                          part={part as TextUIPart}
                          messageRole="assistant"
                        />
                      );
                    case 'reasoning':
                      if (part.text.trim() === '') return null;
                      return (
                        <ThinkingPart
                          key={stableKey}
                          thinkingDuration={
                            msg.metadata?.thinkingDurations?.[currentTypeIndex]
                          }
                          part={part as ReasoningUIPart}
                          isLastPart={isLastPart}
                          isShimmering={
                            isWorking &&
                            part.state === 'streaming' &&
                            isLastPart &&
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
                          isLastPart={isLastPart}
                        />
                      );
                    case 'tool-readConsoleLogsTool':
                      return (
                        <ReadConsoleLogsToolPart
                          key={stableKey}
                          part={part}
                          isLastPart={isLastPart}
                        />
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
            </div>
          </div>
        </div>
        {msg.metadata?.autoCompactInformation?.isAutoCompacted && (
          <div
            key={`compact-${msg.id}`}
            className="mt-2 flex w-full flex-row items-center gap-2 text-xs"
          >
            <IconMagicWandSparkle className="size-3 text-muted-foreground" />
            <span className="shimmer-duration-1500 shimmer-from-muted-foreground shimmer-text-once shimmer-to-foreground font-normal">
              Summarized chat history
            </span>
          </div>
        )}
      </div>
    );
  },
  // Custom comparison to prevent re-renders when message object references change
  (prevProps, nextProps) => {
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.isLastMessage !== nextProps.isLastMessage) return false;
    if (prevProps.message.parts.length !== nextProps.message.parts.length)
      return false;

    // Check for autoCompactInformation changes
    const prevAutoCompact =
      prevProps.message.metadata?.autoCompactInformation?.isAutoCompacted;
    const nextAutoCompact =
      nextProps.message.metadata?.autoCompactInformation?.isAutoCompacted;
    if (prevAutoCompact !== nextAutoCompact) return false;

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
