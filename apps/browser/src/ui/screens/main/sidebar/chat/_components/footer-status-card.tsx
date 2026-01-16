import { Button } from '@stagewise/stage-ui/components/button';
import {
  IconTrash2Outline24,
  IconArrowUpOutline24,
} from 'nucleo-core-outline-24';
import { ChevronDownIcon } from 'lucide-react';
import { FileIcon } from './message-part-ui/tools/shared/file-icon';
import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import { diffLines } from 'diff';
import { cn } from '@/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@stagewise/stage-ui/components/collapsible';

import type { QueuedMessage } from '@shared/karton-contracts/ui';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';

// Stable empty array to avoid creating new instances in selectors (prevents infinite loops)
const EMPTY_MESSAGE_QUEUE: QueuedMessage[] = [];

/** Extract text content from a ChatMessage's parts */
function getMessageText(message: {
  parts: { type: string; text?: string }[];
}): string {
  const textPart = message.parts.find((p) => p.type === 'text');
  return textPart && 'text' in textPart ? (textPart.text ?? '') : '';
}

interface StatusCardItem {
  trigger: (isOpen: boolean) => React.ReactNode;
  contentClassName?: string;
  content: React.ReactNode;
  key: string;
  defaultOpen?: boolean;
}

interface FileDiffItemProps {
  formattedEdits: Array<{
    path: string;
    fileName: string;
    linesAdded: number;
    linesRemoved: number;
  }>;
  onRejectAll: () => void;
  onAcceptAll: () => void;
  onOpenDiffReview: (filePath?: string) => void;
}

interface MessageQueueItemProps {
  messageQueue: QueuedMessage[];
  activeChatId: string | null;
  onRemoveMessage: (chatId: string, messageId: string) => Promise<void>;
  onSendNow: (chatId: string, messageId: string) => Promise<void>;
}

function StatusCardItemComponent({
  item,
  showDivider,
}: {
  item: StatusCardItem;
  showDivider: boolean;
}) {
  const [isOpen, setIsOpen] = useState(item.defaultOpen ?? true);

  return (
    <div className="w-full">
      <Collapsible className="w-full" open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          size="condensed"
          className="w-full cursor-pointer p-0 hover:bg-transparent active:bg-transparent"
        >
          {item.trigger(isOpen)}
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn('w-full overflow-hidden', item.contentClassName)}
        >
          {item.content}
        </CollapsibleContent>
      </Collapsible>
      {showDivider && (
        <hr className="my-1 h-px w-[calc(100%+6px)] border-derived-subtle bg-background" />
      )}
    </div>
  );
}

function StatusCardComponent({
  items,
  ref,
}: {
  items: StatusCardItem[];
  ref?: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className="-z-10 absolute right-2 bottom-[calc(100%+1px)] left-2 flex flex-col items-center justify-between rounded-t-lg border-derived border-t border-r border-l bg-background p-1 backdrop-blur-lg"
    >
      {items.map((item, index) => (
        <StatusCardItemComponent
          key={item.key}
          item={item}
          showDivider={index < items.length - 1}
        />
      ))}
    </div>
  );
}

function FileDiffItem(props: FileDiffItemProps): StatusCardItem | null {
  const { formattedEdits, onRejectAll, onAcceptAll, onOpenDiffReview } = props;

  if (formattedEdits.length === 0) return null;

  return {
    key: 'file-diff',
    trigger: (isOpen: boolean) => (
      <div className="flex w-full flex-row items-center justify-between gap-2 pl-1.5 text-muted-foreground text-xs hover:text-foreground has-[button:hover]:text-muted-foreground">
        <ChevronDownIcon
          className={cn(
            'size-3 shrink-0 transition-transform duration-50',
            isOpen && 'rotate-180',
          )}
        />
        {`${formattedEdits.length} Edit${formattedEdits.length > 1 ? 's' : ''}`}
        <div className="ml-auto flex flex-row items-center justify-start gap-1">
          <Button
            variant="ghost"
            size="xs"
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onRejectAll();
            }}
          >
            Reject
          </Button>
          <Button
            variant="primary"
            size="xs"
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onAcceptAll();
            }}
          >
            Accept all
          </Button>
        </div>
      </div>
    ),
    contentClassName: 'px-0',
    content: (
      <div className="pt-1">
        {formattedEdits.map((edit) => (
          <button
            type="button"
            className="flex w-full cursor-pointer flex-col items-start justify-start gap-2 rounded px-1 py-0.5 text-foreground hover:bg-surface-1 hover:text-hover-derived"
            key={edit.path}
            onClick={() => onOpenDiffReview(edit.path)}
          >
            <span className="flex flex-row items-center justify-start gap-1 truncate text-xs">
              <FileIcon filePath={edit.fileName} className="size-5 shrink-0" />
              <span className="text-xs leading-none">{edit.fileName}</span>
              {edit.linesAdded > 0 && (
                <span className="text-[10px] text-success-foreground leading-none hover:text-hover-derived">
                  +{edit.linesAdded}
                </span>
              )}
              {edit.linesRemoved > 0 && (
                <span className="text-[10px] text-error-foreground leading-none hover:text-hover-derived">
                  -{edit.linesRemoved}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    ),
  };
}

function MessageQueueContent(props: MessageQueueItemProps) {
  const { messageQueue, activeChatId, onRemoveMessage, onSendNow } = props;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="pt-1" onMouseLeave={() => setHoveredIndex(null)}>
      {messageQueue.map((queuedMsg, index) => {
        const isFirst = index === 0;
        // Show buttons for first item when nothing is hovered, or when this specific item is hovered
        const showButtons = isFirst
          ? hoveredIndex === null || hoveredIndex === 0
          : hoveredIndex === index;

        return (
          <div
            key={queuedMsg.id}
            className="relative flex w-full flex-row items-center rounded px-1 py-0.5 text-foreground hover:bg-surface-1 hover:text-hover-derived"
            onMouseEnter={() => setHoveredIndex(index)}
          >
            <div className="flex size-5 shrink-0 items-center justify-center">
              <div className="size-1 rounded-full bg-foreground" />
            </div>
            <span
              className={cn(
                'w-full overflow-hidden truncate text-xs transition-[mask-image] duration-200',
                showButtons &&
                  'mask-[linear-gradient(to_left,transparent_0px,transparent_56px,black_88px)]',
              )}
            >
              {getMessageText(queuedMsg.message)}
            </span>
            <div
              className={cn(
                '-translate-y-1/2 absolute top-1/2 right-1 flex-row items-center',
                showButtons ? 'flex' : 'hidden',
              )}
            >
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      if (activeChatId)
                        void onSendNow(activeChatId, queuedMsg.id);
                    }}
                  >
                    <IconArrowUpOutline24 className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send now</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      if (activeChatId)
                        void onRemoveMessage(activeChatId, queuedMsg.id);
                    }}
                  >
                    <IconTrash2Outline24 className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove from queue</TooltipContent>
              </Tooltip>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MessageQueueItem(props: MessageQueueItemProps): StatusCardItem | null {
  const { messageQueue } = props;

  if (messageQueue.length === 0) return null;

  return {
    key: 'message-queue',
    trigger: (isOpen: boolean) => (
      <div className="flex h-6 w-full flex-row items-center justify-start gap-2 pl-1.5 text-muted-foreground text-xs hover:text-foreground">
        <ChevronDownIcon
          className={cn(
            'size-3 shrink-0 transition-transform duration-50',
            isOpen && 'rotate-180',
          )}
        />
        {`${messageQueue.length} Queued`}
      </div>
    ),
    contentClassName: 'px-0',
    content: <MessageQueueContent {...props} />,
  };
}

export function StatusCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  // Use ref to persist previousHeight across effect re-runs (fixes flickering)
  const previousHeightRef = useRef(0);
  const activeChatId = useKartonState((s) => s.agentChat.activeChatId);
  const chats = useKartonState((s) => s.agentChat.chats);
  const activeChat = useMemo(() => {
    return activeChatId && chats ? chats[activeChatId] : null;
  }, [activeChatId, chats]);

  const rejectAllPendingEdits = useKartonProcedure(
    (p) => p.agentChat.rejectAllPendingEdits,
  );
  const acceptAllPendingEdits = useKartonProcedure(
    (p) => p.agentChat.acceptAllPendingEdits,
  );
  const createTab = useKartonProcedure((p) => p.browser.createTab);

  // Get message queue for active chat (using stable empty array to prevent infinite loops)
  const messageQueue = useKartonState((s) =>
    activeChatId
      ? (s.agentChat?.messageQueue[activeChatId] ?? EMPTY_MESSAGE_QUEUE)
      : EMPTY_MESSAGE_QUEUE,
  );

  // Procedure to remove a queued message
  const removeQueuedMessage = useKartonProcedure(
    (p) => p.agentChat.removeQueuedMessage,
  );

  // Procedure to send a queued message immediately (aborts current work)
  const sendQueuedMessageNow = useKartonProcedure(
    (p) => p.agentChat.sendQueuedMessageNow,
  );

  const openDiffReviewPage = useCallback(
    (filePath?: string) => {
      if (activeChatId) {
        const hash = filePath ? `#${encodeURIComponent(filePath)}` : '';
        void createTab(
          `stagewise://internal/diff-review/${activeChatId}${hash}`,
          true,
        );
      }
    },
    [activeChatId, createTab],
  );

  const pendingEdits = useMemo(() => {
    return activeChat?.pendingEdits ?? [];
  }, [activeChat]);

  const formattedEdits = useMemo(() => {
    const edits: {
      path: string;
      fileName: string;
      linesAdded: number;
      linesRemoved: number;
    }[] = [];
    for (const edit of pendingEdits) {
      const diff = diffLines(edit.before ?? '', edit.after ?? '');
      const fileName = edit.path.split('/').pop() ?? '';
      const linesAdded = diff.reduce(
        (acc, line) => acc + (line.added ? line.count : 0),
        0,
      );
      const linesRemoved = diff.reduce(
        (acc, line) => acc + (line.removed ? line.count : 0),
        0,
      );
      edits.push({ path: edit.path, fileName, linesAdded, linesRemoved });
    }
    return edits;
  }, [pendingEdits]);

  // Create status card items
  const items = useMemo(() => {
    const result: StatusCardItem[] = [];

    const messageQueueItem = MessageQueueItem({
      messageQueue,
      activeChatId,
      onRemoveMessage: removeQueuedMessage,
      onSendNow: sendQueuedMessageNow,
    });
    if (messageQueueItem) result.push(messageQueueItem);

    const fileDiffItem = FileDiffItem({
      formattedEdits,
      onRejectAll: () => void rejectAllPendingEdits(),
      onAcceptAll: () => void acceptAllPendingEdits(),
      onOpenDiffReview: openDiffReviewPage,
    });
    if (fileDiffItem) result.push(fileDiffItem);

    return result;
  }, [
    messageQueue,
    activeChatId,
    removeQueuedMessage,
    sendQueuedMessageNow,
    formattedEdits,
    rejectAllPendingEdits,
    acceptAllPendingEdits,
    openDiffReviewPage,
  ]);

  // Sync card height with CSS variable for ChatHistory padding
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    // Set initial height immediately (no event dispatch - just CSS update)
    const hasContent = items.length > 0;
    const initialHeight = hasContent ? card.offsetHeight : 0;
    document.documentElement.style.setProperty(
      '--file-diff-card-height',
      `${initialHeight}px`,
    );
    previousHeightRef.current = initialHeight;

    // Only dispatch events on actual resize changes (not initial mount)
    const resizeObserver = new ResizeObserver(() => {
      const height = hasContent ? card.offsetHeight : 0;
      const delta = height - previousHeightRef.current;

      document.documentElement.style.setProperty(
        '--file-diff-card-height',
        `${height}px`,
      );

      // Only dispatch scroll adjustment event on actual size changes
      if (delta !== 0) {
        window.dispatchEvent(
          new CustomEvent('file-diff-card-height-changed', {
            detail: { delta, height },
          }),
        );
      }

      previousHeightRef.current = height;
    });
    resizeObserver.observe(card);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.setProperty(
        '--file-diff-card-height',
        '0px',
      );
    };
  }, [items.length]);

  if (items.length === 0) return null;

  return <StatusCardComponent items={items} ref={cardRef} />;
}
