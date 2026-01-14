import { cn } from '@/utils';
import type {
  ChatMessage,
  TextUIPart,
  FileUIPart,
} from '@shared/karton-contracts/ui';
import { Undo2 } from 'lucide-react';
import { useMemo, useCallback, memo } from 'react';
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
import { TextPart } from './message-part-ui/text';
import { SelectedElementsChipsFlexible } from '@/components/selected-elements-chips-flexible';
import type { SelectedElement } from '@shared/selected-elements';

type UserMessage = ChatMessage & { role: 'user' };

export const MessageUser = memo(
  function MessageUser({
    message: msg,
    isLastMessage,
    measureRef,
  }: {
    message: UserMessage;
    isLastMessage: boolean;
    measureRef?: (el: HTMLDivElement | null) => void;
  }) {
    const undoEditsUntilUserMessage = useKartonProcedure(
      (p) => p.agentChat.undoEditsUntilUserMessage,
    );
    const activeChatId = useKartonState(
      (s) => s.agentChat?.activeChatId || null,
    );
    const isWorking = useKartonState((s) => s.agentChat?.isWorking || false);
    const { setChatInput } = useChatActions();

    const confirmRestore = useCallback(async () => {
      if (!msg.id || !activeChatId) return;

      const textContent = msg.parts
        .filter((part) => part.type === 'text')
        .map((part) => (part as TextUIPart).text)
        .join('\n');

      setChatInput(textContent);
      try {
        await undoEditsUntilUserMessage(msg.id, activeChatId);
      } catch (error) {
        console.warn('Failed to undo tool calls:', error);
      }
    }, [
      msg.id,
      msg.parts,
      activeChatId,
      setChatInput,
      undoEditsUntilUserMessage,
    ]);

    const selectedPreviewElements = useMemo(() => {
      return msg.metadata?.selectedPreviewElements ?? [];
    }, [msg.metadata?.selectedPreviewElements]);

    const fileAttachments = useMemo(() => {
      return msg.parts.filter((part) => part.type === 'file') as FileUIPart[];
    }, [msg.parts]);

    // User messages should not be empty in normal usage
    const isEmptyMessage = useMemo(() => {
      return msg.parts.every(
        (part) =>
          part.type !== 'text' ||
          (part.type === 'text' && part.text.trim() === ''),
      );
    }, [msg.parts]);

    if (isEmptyMessage && !isLastMessage) return null;

    return (
      <div className={cn('flex w-full flex-col gap-1')}>
        {/* measureRef wraps just the content, NOT the min-h element, to avoid circular measurement */}
        <div ref={measureRef} className="w-full">
          <div
            className={cn(
              'group/chat-bubble mt-2 flex w-full shrink-0 flex-row-reverse items-center justify-start gap-2',
              isEmptyMessage ? 'hidden' : '',
            )}
          >
            <div
              className={cn(
                'group group/chat-bubble-user wrap-break-word relative min-h-8 max-w-xl origin-bottom-right select-text space-y-2 rounded-lg rounded-br-sm border border-derived-subtle bg-surface-tinted px-2.5 py-1.5 font-normal text-foreground text-sm last:mb-0.5',
              )}
            >
              {msg.parts.map((part, index) => {
                const stableKey = `${msg.id}:${part.type}:${index}`;

                if (part.type === 'text') {
                  if ((part as TextUIPart).text.trim() === '') return null;
                  return (
                    <TextPart
                      key={stableKey}
                      part={part as TextUIPart}
                      messageRole="user"
                    />
                  );
                }
                return null;
              })}

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

            {msg.id && !isWorking && (
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
                      size="xs"
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
      </div>
    );
  },
  // Custom comparison to prevent re-renders when message object references change
  (prevProps, nextProps) => {
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.isLastMessage !== nextProps.isLastMessage) return false;
    // Check if measureRef presence changed (for height tracking)
    if (!!prevProps.measureRef !== !!nextProps.measureRef) return false;
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
    }

    return true;
  },
);
