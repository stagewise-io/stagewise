import { Button } from '@stagewise/stage-ui/components/button';
import {
  IconTrash2Outline24,
  IconArrowUpOutline24,
} from 'nucleo-core-outline-24';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
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
  onRemoveMessage: (messageId: string) => Promise<void>;
  onFlush: () => Promise<void>;
}

function MessageQueueSectionContent({
  queuedMessages,
  onRemoveMessage,
}: QueuedMessagesSectionProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="pt-1" onMouseLeave={() => setHoveredIndex(null)}>
      {queuedMessages.map((queuedMsg, index) => {
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
                'inline-flex w-full items-center gap-0.5 overflow-x-hidden text-ellipsis whitespace-nowrap text-xs transition-[mask-image] duration-200',
                showButtons
                  ? 'mask-[linear-gradient(to_left,transparent_0px,transparent_56px,black_88px)]'
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
              className={cn(
                'absolute top-1/2 right-1 -translate-y-1/2 flex-row items-center',
                showButtons ? 'flex' : 'hidden',
              )}
            >
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      void onRemoveMessage(queuedMsg.id);
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

export function MessageQueueSection(
  props: QueuedMessagesSectionProps,
): StatusCardSection | null {
  if (props.queuedMessages.length === 0) return null;

  return {
    key: 'message-queue',
    trigger: (isOpen: boolean) => (
      <div className="flex h-6 w-full flex-row items-center justify-between gap-2 pl-1.5 text-muted-foreground text-xs hover:text-foreground has-[button:hover]:text-muted-foreground">
        <div className="flex flex-row items-center justify-start gap-2">
          <ChevronDownIcon
            className={cn(
              'size-3 shrink-0 transition-transform duration-50',
              isOpen && 'rotate-180',
            )}
          />
          {`${props.queuedMessages.length} Queued`}
        </div>
        <Button variant="ghost" size="xs" onClick={props.onFlush}>
          Send now
          <IconArrowUpOutline24 className="size-3" />
        </Button>
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
