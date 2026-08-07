import { Button } from '@stagewise/stage-ui/components/button';
import {
  IconArrowUpOutline24,
  IconGripDotsVerticalOutline18,
  IconTrash2Outline24,
} from '@stagewise/icons';
import { ChevronDownIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@ui/utils';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import {
  AttachmentLinkRouter,
  parseMessageSegments,
  getAttachmentKey,
} from '@ui/components/streamdown/attachment-links';
import { AttachmentMetadataProvider } from '@ui/hooks/use-attachment-metadata';
import type { StatusCardSection } from './shared';
import { getMessageText } from './shared';

export interface QueuedMessagesSectionProps {
  queuedMessages: AgentMessage[];
  onRemoveMessage: (messageId: string) => void;
  onSendMessage: (messageId: string) => void;
  onMoveMessage: (messageId: string, toIndex: number) => void;
}

function SortableQueuedMessage({
  queuedMsg,
  showButtons,
  onHover,
  onRemoveMessage,
  onSendMessage,
}: {
  queuedMsg: AgentMessage;
  showButtons: boolean;
  onHover: (messageId: string) => void;
  onRemoveMessage: QueuedMessagesSectionProps['onRemoveMessage'];
  onSendMessage: QueuedMessagesSectionProps['onSendMessage'];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: queuedMsg.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative flex w-full items-center rounded px-1 py-0.5 text-foreground hover:bg-surface-1',
        isDragging && 'z-10 bg-surface-1 shadow-elevation-1',
      )}
      onMouseEnter={() => onHover(queuedMsg.id)}
    >
      <button
        type="button"
        aria-label="Reorder queued message"
        className="flex size-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <IconGripDotsVerticalOutline18 className="size-3.5" />
      </button>
      <span
        className={cn(
          'inline-flex w-full items-center gap-0.5 overflow-x-hidden text-ellipsis whitespace-nowrap text-xs transition-[mask-image] duration-200',
          showButtons
            ? 'mask-[linear-gradient(to_left,transparent_0px,transparent_104px,black_136px)]'
            : 'mask-[linear-gradient(to_left,transparent_0px,black_24px)]',
        )}
      >
        {parseMessageSegments(getMessageText(queuedMsg)).map((seg) =>
          seg.kind === 'text' ? (
            seg.content
          ) : (
            <AttachmentLinkRouter
              key={getAttachmentKey(seg.linkData)}
              linkData={seg.linkData}
            />
          ),
        )}
      </span>
      <div
        className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center"
        hidden={!showButtons}
      >
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onSendMessage(queuedMsg.id)}
        >
          Send now
          <IconArrowUpOutline24 className="size-3" />
        </Button>
        <Tooltip>
          <TooltipTrigger>
            <Button
              aria-label="Remove from queue"
              variant="ghost"
              size="icon-xs"
              onClick={() => onRemoveMessage(queuedMsg.id)}
            >
              <IconTrash2Outline24 className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove from queue</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function MessageQueueSectionContent({
  queuedMessages,
  onRemoveMessage,
  onSendMessage,
  onMoveMessage,
}: QueuedMessagesSectionProps) {
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [orderedMessages, setOrderedMessages] = useState(queuedMessages);

  useEffect(() => setOrderedMessages(queuedMessages), [queuedMessages]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const fromIndex = orderedMessages.findIndex(({ id }) => id === active.id);
    const toIndex = orderedMessages.findIndex(({ id }) => id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;

    setOrderedMessages(arrayMove(orderedMessages, fromIndex, toIndex));
    onMoveMessage(String(active.id), toIndex);
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={orderedMessages}
        strategy={verticalListSortingStrategy}
      >
        <div className="pt-1" onMouseLeave={() => setHoveredMessageId(null)}>
          {orderedMessages.map((queuedMsg, index) => (
            <SortableQueuedMessage
              key={queuedMsg.id}
              queuedMsg={queuedMsg}
              showButtons={
                hoveredMessageId === queuedMsg.id ||
                (index === 0 && hoveredMessageId === null)
              }
              onHover={setHoveredMessageId}
              onRemoveMessage={onRemoveMessage}
              onSendMessage={onSendMessage}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export function MessageQueueSection(
  props: QueuedMessagesSectionProps,
): StatusCardSection | null {
  if (props.queuedMessages.length === 0) return null;

  return {
    key: 'message-queue',
    trigger: (isOpen: boolean) => (
      <div className="flex h-6 w-full items-center gap-2 pl-1.5 text-muted-foreground text-xs hover:text-foreground">
        <ChevronDownIcon
          className={cn(
            'size-3 shrink-0 transition-transform duration-50',
            isOpen && 'rotate-180',
          )}
        />
        {`${props.queuedMessages.length} Queued`}
      </div>
    ),
    scrollable: true,
    contentClassName: 'px-0',
    content: (
      <AttachmentMetadataProvider messages={props.queuedMessages}>
        <MessageQueueSectionContent {...props} />
      </AttachmentMetadataProvider>
    ),
  };
}
