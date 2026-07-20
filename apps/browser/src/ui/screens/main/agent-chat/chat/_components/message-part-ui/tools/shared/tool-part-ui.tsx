import { useState, useCallback } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@stagewise/stage-ui/components/collapsible';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { cn } from '@ui/utils';
import { ChevronDownIcon } from 'lucide-react';
import { useAutoScroll } from '@ui/hooks/use-auto-scroll';

type ToolPartUIProps = {
  trigger?: React.ReactNode;
  content?: React.ReactNode;
  contentClassName?: string;
  contentFooter?: React.ReactNode;
  contentFooterClassName?: string;
  /**
   * When true, the footer flows in the normal block layout (no absolute
   * positioning, no fixed height). Use this when the footer needs to
   * grow vertically with its content — e.g. a classifier-explanation
   * banner stacked above action buttons. Default: false (absolute footer
   * pinned to the bottom with a fixed 24px height).
   */
  contentFooterStatic?: boolean;
  expanded?: boolean;
  setExpanded?: (expanded: boolean) => void;
  showBorder?: boolean;
  autoScroll?: boolean;
  isShimmering?: boolean;
  hideChevron?: boolean;
};

export const ToolPartUI = (props: ToolPartUIProps) => {
  if (props.content === undefined) {
    return (
      <div
        className={cn(
          'flex h-6 w-full items-center gap-1 truncate font-normal text-muted-foreground',
          props.showBorder &&
            'rounded-lg border border-border-subtle bg-background px-2.5 shadow-xs dark:border-border dark:bg-surface-1',
        )}
      >
        {props.trigger}
      </div>
    );
  }

  return <ToolPartUIWithContent {...props} content={props.content} />;
};

/**
 * Inner component that only mounts when content is defined.
 * Keeps useAutoScroll out of the content-less (trigger-only) render path.
 */
const ToolPartUIWithContent = ({
  trigger,
  content,
  contentClassName,
  contentFooter,
  contentFooterClassName,
  contentFooterStatic = false,
  expanded: controlledExpanded,
  setExpanded: controlledSetExpanded,
  showBorder = false,
  autoScroll = true,
  isShimmering = false,
  hideChevron = false,
}: Omit<ToolPartUIProps, 'content'> & { content: React.ReactNode }) => {
  // Internal state for uncontrolled mode
  const [internalExpanded, setInternalExpanded] = useState(true);

  // Use controlled props if provided, otherwise fall back to internal state
  const expanded =
    controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const setExpanded = controlledSetExpanded ?? setInternalExpanded;

  // Auto-scroll hook with smaller threshold for compact container (max-h-32 = 128px)
  const { scrollerRef } = useAutoScroll({
    enabled: expanded && autoScroll,
    scrollEndThreshold: 20,
    initializeAtBottom: false,
  });

  // Callback to receive viewport ref from OverlayScrollbar.
  const handleViewportRef = useCallback(
    (vp: HTMLElement | null) => {
      scrollerRef(vp);
    },
    [scrollerRef],
  );

  return (
    <div
      className={cn(
        'block w-full overflow-hidden',
        showBorder &&
          'rounded-lg border border-border-subtle bg-background dark:border-border dark:bg-surface-1',
        showBorder && 'shadow-xs',
      )}
    >
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger
          size="condensed"
          className={cn(
            `group/trigger select-none gap-1 px-0 font-normal text-muted-foreground`,
            'cursor-pointer',
            showBorder &&
              'h-6 rounded-t-lg rounded-b-none border-b bg-background px-2.5 dark:bg-surface-1',
            // Always have border-b, toggle color to avoid transition-all animating border
            showBorder &&
              (expanded
                ? 'border-border/30 dark:border-border/70'
                : 'border-transparent'),
            !showBorder &&
              'justify-start py-0 hover:bg-transparent active:bg-transparent',
          )}
          style={
            showBorder
              ? { transitionProperty: 'color, background-color' }
              : undefined
          }
        >
          {trigger}
          {!hideChevron && (
            <ChevronDownIcon
              className={cn(
                'size-3 shrink-0 transition-transform duration-150',
                expanded && 'rotate-180',
                !showBorder && !expanded && 'hidden group-hover/trigger:block',
                showBorder && 'ml-auto',
                isShimmering && 'text-primary-foreground',
              )}
            />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn(
            'relative pb-0 text-xs duration-0!',
            !showBorder && 'pt-1',
          )}
        >
          <div
            className={cn(
              showBorder ? 'max-h-64' : 'max-h-none',
              contentFooter && !contentFooterStatic && 'mb-6',
            )}
          >
            <OverlayScrollbar
              viewportClassName="scroll-fade-both scroll-fade-4"
              contentClassName={cn('py-0.5', contentClassName)}
              options={{
                overflow: { x: 'scroll', y: 'scroll' },
              }}
              onViewportRef={handleViewportRef}
            >
              {content}
            </OverlayScrollbar>
          </div>
          {contentFooter && (
            <div
              className={cn(
                // Base: shared typography + container chrome
                'flex select-none flex-row items-center justify-start gap-1 rounded-b-lg bg-background px-2 py-1 text-muted-foreground dark:bg-surface-1',
                // Default (absolute) mode: pin to bottom and add separator
                !contentFooterStatic &&
                  'absolute right-0 bottom-0 left-0 h-6 border-border/30 border-t dark:border-border/70',
                // Static mode: negate CollapsibleContent's outer px-2 so the
                // footer spans the full card width, matching the absolute variant.
                contentFooterStatic && '-mx-2',
                contentFooterClassName,
              )}
            >
              {contentFooter}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
