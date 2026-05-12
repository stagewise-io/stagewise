import { useState, useMemo } from 'react';
import { cn } from '@ui/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@stagewise/stage-ui/components/collapsible';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import type { FileDiff } from '@shared/karton-contracts/ui/shared-types';

/** Extract text content from a AgentMessage's parts */
export function getMessageText(message: {
  parts: { type: string; text?: string }[];
}): string {
  const textPart = message.parts.find((p) => p.type === 'text');
  return textPart && 'text' in textPart ? (textPart.text ?? '') : '';
}

/** Extends FileDiff, only adds derived display prop */
export type FormattedFileDiff = FileDiff & {
  fileName: string;
};

/** Compute line stats on-demand from lineChanges */
export function getLineStats(diff: FormattedFileDiff): {
  added: number;
  removed: number;
} {
  if (diff.isExternal) return { added: 0, removed: 0 };
  return {
    added: diff.lineChanges.reduce(
      (acc, c) => acc + (c.added ? (c.count ?? 0) : 0),
      0,
    ),
    removed: diff.lineChanges.reduce(
      (acc, c) => acc + (c.removed ? (c.count ?? 0) : 0),
      0,
    ),
  };
}

/** Check if diff represents a real change (not a noop) */
export function hasRealChanges(diff: FormattedFileDiff): boolean {
  if (diff.isExternal) return diff.baselineOid !== diff.currentOid;
  // Line changes alone miss empty-file transitions (null -> "" / "" -> null)
  // where diffLines produces no add/remove entries. Fall back to the oid
  // transition, which matches the backend's synthetic-hunk criterion.
  if (diff.lineChanges.some((c) => c.added || c.removed)) return true;
  return diff.baselineOid !== diff.currentOid;
}

/** Get hunk IDs for accept/reject operations */
export function getHunkIds(diff: FormattedFileDiff): string[] {
  return diff.isExternal ? [diff.hunkId] : diff.hunks.map((h) => h.id);
}

export interface StatusCardSection {
  trigger: (isOpen: boolean) => React.ReactNode;
  contentClassName?: string;
  content: React.ReactNode;
  key: string;
  defaultOpen?: boolean;
  /** When true, content is wrapped in an OverlayScrollbar with max-h and fade mask. */
  scrollable?: boolean;
}

function ScrollableContent({ children }: { children: React.ReactNode }) {
  const [viewport, setViewport] = useState<HTMLElement | null>(null);

  const viewportRef = useMemo(
    () => ({ current: viewport }),
    [viewport],
  ) as React.RefObject<HTMLElement>;

  const { maskStyle } = useScrollFadeMask(viewportRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

  return (
    <OverlayScrollbar
      className="mask-alpha max-h-48"
      style={maskStyle}
      options={{
        overflow: { x: 'hidden', y: 'scroll' },
      }}
      onViewportRef={setViewport}
    >
      {children}
    </OverlayScrollbar>
  );
}

export function StatusCardSectionComponent({
  item,
  showDivider,
}: {
  item: StatusCardSection;
  showDivider: boolean;
}) {
  const [isOpen, setIsOpen] = useState(item.defaultOpen ?? true);

  return (
    <div className="w-full">
      <Collapsible className="w-full" open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          size="condensed"
          render={<div />}
          className="w-full cursor-pointer p-0 hover:bg-transparent active:bg-transparent"
        >
          {item.trigger(isOpen)}
        </CollapsibleTrigger>
        {item.content && (
          <CollapsibleContent
            className={cn('w-full duration-0!', item.contentClassName)}
          >
            {item.scrollable ? (
              <ScrollableContent>{item.content}</ScrollableContent>
            ) : (
              item.content
            )}
          </CollapsibleContent>
        )}
      </Collapsible>
      {showDivider && (
        <hr className="my-1 h-px w-full border-derived bg-background" />
      )}
    </div>
  );
}

export function StatusCardComponent({
  items,
  ref,
}: {
  items: StatusCardSection[];
  ref?: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      data-status-card
      className="absolute right-2 bottom-[calc(100%+1px)] left-2 -z-10 flex flex-col items-center justify-between rounded-t-lg border-derived border-t border-r border-l bg-background p-1"
    >
      {items.map((item, index) => (
        <StatusCardSectionComponent
          key={item.key}
          item={item}
          showDivider={index < items.length - 1}
        />
      ))}
    </div>
  );
}
