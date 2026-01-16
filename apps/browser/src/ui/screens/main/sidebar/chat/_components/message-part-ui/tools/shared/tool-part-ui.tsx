import { useState, useEffect, useRef } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@stagewise/stage-ui/components/collapsible';
import { cn } from '@/utils';
import { ChevronDownIcon } from 'lucide-react';
import { useIsContainerScrollable } from '@/hooks/use-is-container-scrollable';

export const ToolPartUI = ({
  trigger,
  content,
  contentClassName,
  contentFooter,
  contentFooterClassName,
  expanded: controlledExpanded,
  setExpanded: controlledSetExpanded,
  showBorder = false,
}: {
  trigger?: React.ReactNode;
  content?: React.ReactNode;
  contentClassName?: string;
  contentFooter?: React.ReactNode;
  contentFooterClassName?: string;
  expanded?: boolean;
  setExpanded?: (expanded: boolean) => void;
  showBorder?: boolean;
}) => {
  // Internal state for uncontrolled mode
  const [internalExpanded, setInternalExpanded] = useState(true);

  // Use controlled props if provided, otherwise fall back to internal state
  const expanded =
    controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const setExpanded = controlledSetExpanded ?? setInternalExpanded;

  const contentScrollRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const isUserScrolledRef = useRef(false);

  // Use the hook for scroll state detection
  const { canScrollUp, canScrollDown, canScrollLeft, canScrollRight } =
    useIsContainerScrollable(contentScrollRef);

  // Binary fade distances based on scroll state
  const FADE_DISTANCE = 16;
  const topFade = canScrollUp ? FADE_DISTANCE : 0;
  const bottomFade = canScrollDown ? FADE_DISTANCE : 0;
  const leftFade = canScrollLeft ? FADE_DISTANCE : 0;
  const rightFade = canScrollRight ? FADE_DISTANCE : 0;

  // Check if user is at bottom of scroll container
  const isAtBottom = (element: HTMLElement): boolean => {
    const threshold = 10;
    return (
      element.scrollHeight - element.scrollTop - element.clientHeight <=
      threshold
    );
  };

  // Track user scroll position and scroll to bottom on initial expansion
  useEffect(() => {
    const container = contentScrollRef.current;
    if (!container || !expanded) return;

    // Only scroll to bottom on initial expansion
    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = container.scrollHeight;
        isUserScrolledRef.current = false;
      }
    });

    const handleScroll = () => {
      isUserScrolledRef.current = !isAtBottom(container);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [expanded]);

  // Auto-scroll to bottom when content changes (if user hasn't scrolled away)
  useEffect(() => {
    const container = contentScrollRef.current;
    const contentWrapper = contentWrapperRef.current;

    if (!container || !contentWrapper || !expanded) return;

    const shouldAutoScroll = () => !isUserScrolledRef.current;

    const scrollToBottom = () => {
      if (shouldAutoScroll()) {
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        });
      }
    };

    // Initial scroll on expansion
    scrollToBottom();

    // Observe DOM mutations in the content area
    const observer = new MutationObserver(() => {
      scrollToBottom();
    });

    observer.observe(contentWrapper, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [expanded]);

  // Generate inline style for mask with CSS custom properties
  const getMaskStyle = (): React.CSSProperties =>
    ({
      '--top-fade': `${topFade}px`,
      '--bottom-fade': `${bottomFade}px`,
      '--left-fade': `${leftFade}px`,
      '--right-fade': `${rightFade}px`,
    }) as React.CSSProperties;

  if (content === undefined) {
    return (
      <div
        className={cn(
          '-mx-1 flex h-6 w-full items-center gap-1 truncate font-normal text-muted-foreground',
          showBorder &&
            'rounded-lg border border-border bg-background px-2.5 dark:bg-surface-1',
        )}
      >
        {trigger}
      </div>
    );
  }

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
            `group/trigger gap-1 px-0 font-normal text-muted-foreground`,
            content !== undefined
              ? 'cursor-pointer'
              : 'cursor-default hover:bg-transparent active:bg-transparent',
            showBorder &&
              'h-6 rounded-t-lg rounded-b-none border-b bg-background px-2.5 dark:bg-surface-1',
            // Always have border-b, toggle color to avoid transition-all animating border
            showBorder &&
              (expanded
                ? 'border-border-subtle/50 dark:border-border/70'
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
          <ChevronDownIcon
            className={cn(
              'size-3 shrink-0 transition-transform duration-150',
              expanded && 'rotate-180',
              !showBorder && !expanded && 'hidden group-hover/trigger:block',
              showBorder && 'pl-auto',
            )}
          />
        </CollapsibleTrigger>
        {content && (
          <CollapsibleContent
            className={cn(
              'relative pb-0 text-xs duration-0!',
              !showBorder && 'pt-1',
            )}
          >
            <div
              ref={contentScrollRef}
              className={cn(
                'scrollbar-hover-only mask-alpha overscroll-contain py-0.5',
                showBorder ? 'max-h-32' : 'max-h-none',
                contentFooter && 'mb-6',
                contentClassName,
              )}
              style={
                {
                  ...getMaskStyle(),
                  overflowY: 'auto',
                  overflowX: 'auto',
                  contain: 'layout',
                  maskImage: `
                    linear-gradient(to right, transparent 0px, black var(--left-fade), black calc(100% - var(--right-fade)), transparent 100%),
                    linear-gradient(to bottom, transparent 0px, black var(--top-fade), black calc(100% - var(--bottom-fade)), transparent 100%)
                  `,
                  WebkitMaskImage: `
                    linear-gradient(to right, transparent 0px, black var(--left-fade), black calc(100% - var(--right-fade)), transparent 100%),
                    linear-gradient(to bottom, transparent 0px, black var(--top-fade), black calc(100% - var(--bottom-fade)), transparent 100%)
                  `,
                  maskComposite: 'intersect',
                  WebkitMaskComposite: 'source-in',
                } as React.CSSProperties
              }
            >
              <div ref={contentWrapperRef}>{content}</div>
            </div>
            {contentFooter && (
              <div
                className={cn(
                  'absolute right-0 bottom-0 left-0 flex h-6 flex-row items-center justify-start gap-1 rounded-b-lg border-derived border-t bg-background px-2 py-1 text-muted-foreground dark:bg-surface-1',
                  contentFooterClassName,
                )}
              >
                {contentFooter}
              </div>
            )}
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
};
