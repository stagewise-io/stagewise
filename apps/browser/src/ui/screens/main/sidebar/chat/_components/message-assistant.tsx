import { cn } from '@ui/utils';
import type {
  ReasoningUIPart,
  DynamicToolUIPart,
  FileUIPart,
  TextUIPart,
  UIMessagePart,
  UIDataTypes,
} from 'ai';
import type {
  AgentMessage,
  AgentToolUIPart,
} from '@shared/karton-contracts/ui/agent';
import type { UIAgentTools } from '@shared/karton-contracts/ui/agent/tools/types';
import { useMemo, memo, useState, useCallback } from 'react';
import { ThinkingPart } from './message-part-ui/thinking';
import { FilePart } from './message-part-ui/file';
import { TextPart } from './message-part-ui/text';
import { CopyToolPart } from './message-part-ui/tools/copy';
import { DeleteFileToolPart } from './message-part-ui/tools/delete-file';
import { UpdateWorkspaceMdToolPart } from './message-part-ui/tools/update-workspace-md';
import { MultiEditToolPart } from './message-part-ui/tools/multi-edit';
import { WriteToolPart } from './message-part-ui/tools/overwrite-file';
import {
  ExploringToolParts,
  isReadOnlyToolPart,
  type ReadOnlyToolPart,
} from './message-part-ui/tools/exploring';
import { UnknownToolPart } from './message-part-ui/tools/unknown';
import { ExecuteSandboxJsToolPart } from './message-part-ui/tools/execute-sandbox-js';
import { ReadConsoleLogsToolPart } from './message-part-ui/tools/read-console-logs';
import { AskUserQuestionsToolPart } from './message-part-ui/tools/ask-user-questions';
import { ExecuteShellCommandToolPart } from './message-part-ui/tools/execute-shell-command';
import { isToolOrReasoningPart } from './message-utils';
import { MessageBetweenSteps } from './message-between-steps';
import { IconDotsOutline18 } from 'nucleo-ui-outline-18';
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from '@stagewise/stage-ui/components/menu';
import { HistoryIcon } from 'lucide-react';
import { RevertConfirmPopover } from './revert-confirm-popover';

type AssistantMessage = AgentMessage & { role: 'assistant' };

/** Part with its original index in msg.parts for correct metadata lookup */
type PartWithOriginalIndex =
  | {
      part: UIMessagePart<UIDataTypes, UIAgentTools>;
      originalIndex: number;
    }
  | {
      parts: { part: ReadOnlyToolPart; originalIndex: number }[];
    };

export const MessageAssistant = memo(
  function MessageAssistant({
    message: msg,
    isLastMessage,
    isWorking,
    showBetweenStepsIndicator,
    hasSubsequentFileModifications,
  }: {
    message: AssistantMessage;
    isLastMessage: boolean;
    isWorking: boolean;
    showBetweenStepsIndicator?: boolean;
    hasSubsequentFileModifications?: boolean;
  }) {
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

    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const dispatchRestore = useCallback(
      (undoToolCalls: boolean) => {
        setIsConfirmOpen(false);
        window.dispatchEvent(
          new CustomEvent('chat-restore-checkpoint', {
            detail: {
              assistantMessageId: msg.id,
              undoToolCalls,
            },
          }),
        );
      },
      [msg.id],
    );

    const handleRestoreCheckpoint = useCallback(() => {
      if (hasSubsequentFileModifications) {
        setIsConfirmOpen(true);
      } else {
        dispatchRestore(false);
      }
    }, [hasSubsequentFileModifications, dispatchRestore]);

    if (isEmptyMessage && !isLastMessage) return null;

    return (
      <div className={cn('flex w-full flex-col gap-1')}>
        <div className="w-full">
          <div
            className={cn(
              'mt-2 flex w-full shrink-0 flex-row items-center justify-start gap-2',
              isEmptyMessage ? 'hidden' : '',
            )}
          >
            <div
              className={cn(
                'group group/chat-message-assistant wrap-break-word relative min-h-8 w-full min-w-1/3 origin-bottom-left select-text space-y-2 rounded-bl-sm py-1.5 font-normal text-foreground text-sm last:mb-0.5',
              )}
            >
              {(() => {
                // Merge read-only tools into groups, preserving original indices for metadata lookup
                const partsWithIndices = msg.parts.reduce(
                  (acc, part, originalIndex) => {
                    // Skip step-start parts, they don't contain information we need to render
                    if (part.type === 'step-start') return acc;

                    // Check if this is a read-only tool or reasoning part
                    if (
                      isToolOrReasoningPart(part) &&
                      isReadOnlyToolPart(part)
                    ) {
                      const previousItem = acc[acc.length - 1];
                      // Merge into previous group if one exists
                      if (previousItem && 'parts' in previousItem)
                        previousItem.parts.push({ part, originalIndex });
                      // Create a new group
                      else acc.push({ parts: [{ part, originalIndex }] });
                      // Non-grouped part
                    } else acc.push({ part, originalIndex });

                    return acc;
                  },
                  [] as PartWithOriginalIndex[],
                );

                const typeCounters: Record<string, number> = {};
                let exploringGroupIndex = 0;

                return partsWithIndices.map((item, index) => {
                  const isLastPart = index === partsWithIndices.length - 1;

                  // Handle grouped read-only parts (exploring tools + reasoning)
                  if ('parts' in item) {
                    const stableKey = `${msg.id}:exploring:${exploringGroupIndex}`;
                    exploringGroupIndex++;
                    return (
                      <ExploringToolParts
                        key={stableKey}
                        parts={item.parts.map((p) => p.part)}
                        partsMetadata={msg.metadata?.partsMetadata ?? []}
                        originalIndices={item.parts.map((p) => p.originalIndex)}
                        isAutoExpanded={isLastPart}
                        isShimmering={isWorking && isLastPart && isLastMessage}
                        messageAttachments={msg.metadata?.attachments}
                      />
                    );
                  }

                  // Handle single parts
                  const { part, originalIndex } = item;
                  const currentTypeIndex = typeCounters[part.type] ?? 0;
                  typeCounters[part.type] = currentTypeIndex + 1;
                  const stableKey = `${msg.id}:${part.type}:${currentTypeIndex}`;

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
                            (msg.metadata?.partsMetadata?.[
                              originalIndex
                            ]?.endedAt?.getTime() ?? 0) -
                            (msg.metadata?.partsMetadata?.[
                              originalIndex
                            ]?.startedAt?.getTime() ?? 0)
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
                    case 'tool-copy':
                      return <CopyToolPart key={stableKey} part={part} />;
                    case 'tool-delete':
                      return <DeleteFileToolPart key={stableKey} part={part} />;
                    case 'tool-updateWorkspaceMd':
                      return (
                        <UpdateWorkspaceMdToolPart
                          key={stableKey}
                          part={part}
                        />
                      );
                    case 'tool-multiEdit':
                      return <MultiEditToolPart key={stableKey} part={part} />;
                    case 'tool-executeSandboxJs':
                      return (
                        <ExecuteSandboxJsToolPart
                          key={stableKey}
                          part={part}
                          isLastPart={isLastPart}
                          messageAttachments={msg.metadata?.attachments}
                        />
                      );
                    case 'tool-readConsoleLogs':
                      return (
                        <ReadConsoleLogsToolPart
                          key={stableKey}
                          part={part}
                          isLastPart={isLastPart}
                        />
                      );
                    case 'tool-write':
                      return <WriteToolPart key={stableKey} part={part} />;
                    case 'tool-askUserQuestions':
                      return (
                        <AskUserQuestionsToolPart key={stableKey} part={part} />
                      );
                    case 'tool-executeShellCommand':
                      return (
                        <ExecuteShellCommandToolPart
                          key={stableKey}
                          part={part}
                          isLastPart={isLastPart}
                        />
                      );
                    default:
                      return (
                        <UnknownToolPart
                          shimmer={
                            isWorking &&
                            index === partsWithIndices.length - 1 &&
                            isLastMessage
                          }
                          key={stableKey}
                          part={part as AgentToolUIPart | DynamicToolUIPart}
                        />
                      );
                  }
                });
              })()}
              {showBetweenStepsIndicator && <MessageBetweenSteps />}
              {/* Actions menu — hidden on last message (restore would be a noop) and while streaming */}
              {!isLastMessage && (
                <div className="flex justify-end">
                  <Menu>
                    <MenuTrigger>
                      <button
                        type="button"
                        className="flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <IconDotsOutline18 className="size-3.5" />
                      </button>
                    </MenuTrigger>
                    <MenuContent
                      side="bottom"
                      align="end"
                      sideOffset={2}
                      size="xs"
                    >
                      <MenuItem size="xs" onClick={handleRestoreCheckpoint}>
                        <HistoryIcon className="size-3" />
                        Restore checkpoint
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                  <RevertConfirmPopover
                    open={isConfirmOpen}
                    onOpenChange={setIsConfirmOpen}
                    onConfirm={dispatchRestore}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
  // Custom comparison to prevent re-renders when message object references change
  (prevProps, nextProps) => {
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.isLastMessage !== nextProps.isLastMessage) return false;
    // Only re-render for isWorking changes if this is the last message
    // (shimmer effects only apply to last message)
    if (prevProps.isLastMessage && prevProps.isWorking !== nextProps.isWorking)
      return false;
    if (
      prevProps.showBetweenStepsIndicator !==
      nextProps.showBetweenStepsIndicator
    )
      return false;
    if (
      prevProps.hasSubsequentFileModifications !==
      nextProps.hasSubsequentFileModifications
    )
      return false;

    if (prevProps.message.parts.length !== nextProps.message.parts.length)
      return false;

    // Check for autoCompactInformation changes
    const prevAutoCompact = prevProps.message.metadata?.compressedHistory;
    const nextAutoCompact = nextProps.message.metadata?.compressedHistory;
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
      // For tool parts, compare state, input, and output to allow streaming updates
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
        // Compare output so completed tool results trigger re-render
        const prevOutput = JSON.stringify((prevPart as any).output);
        const nextOutput = JSON.stringify((nextPart as any).output);
        if (prevOutput !== nextOutput) return false;
      }
    }

    return true;
  },
);
