import { useState, useEffect, useRef } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@stagewise/stage-ui/components/collapsible';
import { cn } from '@/utils';
import { ChevronDownIcon } from 'lucide-react';

export const ToolPartUI = ({
  trigger,
  content,
  contentClassName,
  contentFooter,
  contentFooterClassName,
  expanded: controlledExpanded,
  setExpanded: controlledSetExpanded,
  showBorder = true,
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

  const [containerReady, setContainerReady] = useState(false);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const isUserScrolledRef = useRef(false);
  const [topFadeDistance, setTopFadeDistance] = useState(0);
  const [bottomFadeDistance, setBottomFadeDistance] = useState(0);
  const [hasVerticalScrollbar, setHasVerticalScrollbar] = useState(false);
  const [hasHorizontalScrollbar, setHasHorizontalScrollbar] = useState(false);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  // Find the scrollable container element (the CollapsibleContent with overflow-y-auto)
  const findScrollContainer = (
    element: HTMLElement | null,
  ): HTMLElement | null => {
    if (!element) return null;
    const style = window.getComputedStyle(element);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll')
      return element;

    return findScrollContainer(element.parentElement);
  };

  // Callback ref to find scroll container when wrapper mounts
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const setContentWrapperRef = (element: HTMLDivElement | null) => {
    contentWrapperRef.current = element;
    const container = findScrollContainer(element);
    if (element && container) {
      scrollContainerRef.current = container;
      setContainerReady(true);
    } else setContainerReady(false);
  };

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
    const container = scrollContainerRef.current;
    if (!container || !expanded || !containerReady) return;

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
  }, [expanded, containerReady]);

  // Auto-scroll to bottom when content changes (if user hasn't scrolled away)
  useEffect(() => {
    const container = scrollContainerRef.current;
    const contentWrapper = contentWrapperRef.current;

    if (!container || !contentWrapper || !expanded || !containerReady) return;

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
  }, [expanded, containerReady]);

  // Track scroll position of content to smoothly adjust fade effects
  useEffect(() => {
    const contentDiv = contentScrollRef.current;
    if (!contentDiv || !expanded) return;

    let rafId: number | null = null;

    const updateScrollPosition = () => {
      const minFade = 6; // Subtle fade at edges
      const maxFade = 16; // Normal fade when scrolling
      const transitionDistance = 24; // Distance over which to transition

      // Check if content is actually scrollable
      const isScrollable = contentDiv.scrollHeight > contentDiv.clientHeight;

      // If not scrollable, no fade should be shown
      if (!isScrollable) {
        setTopFadeDistance(0);
        setBottomFadeDistance(0);
        setHasVerticalScrollbar(false);
        setHasHorizontalScrollbar(
          contentDiv.scrollWidth > contentDiv.clientWidth,
        );
        return;
      }

      // Calculate distance from top
      const distanceFromTop = contentDiv.scrollTop;
      const topFadeAmount = Math.min(
        maxFade,
        minFade + (distanceFromTop / transitionDistance) * (maxFade - minFade),
      );

      // Calculate distance from bottom
      const distanceFromBottom =
        contentDiv.scrollHeight -
        contentDiv.scrollTop -
        contentDiv.clientHeight;
      const bottomFadeAmount = Math.min(
        maxFade,
        minFade +
          (distanceFromBottom / transitionDistance) * (maxFade - minFade),
      );

      setTopFadeDistance(topFadeAmount);
      setBottomFadeDistance(bottomFadeAmount);

      // Check for scrollbar visibility
      setHasVerticalScrollbar(true);
      setHasHorizontalScrollbar(
        contentDiv.scrollWidth > contentDiv.clientWidth,
      );
    };

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        updateScrollPosition();
        rafId = null;
      });
    };

    // Initial check
    updateScrollPosition();

    contentDiv.addEventListener('scroll', handleScroll);

    // ResizeObserver to detect size changes after CSS animation completes
    const resizeObserver = new ResizeObserver(() => {
      updateScrollPosition();
    });
    resizeObserver.observe(contentDiv);

    return () => {
      contentDiv.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [expanded, content]);

  // Generate inline style for mask with CSS custom properties
  const getMaskStyle = (): React.CSSProperties =>
    ({
      '--top-fade': `${topFadeDistance}px`,
      '--bottom-fade': `${bottomFadeDistance}px`,
    }) as React.CSSProperties;

  if (content === undefined) {
    return (
      <div
        className={cn(
          '-mx-1 flex h-6 items-center gap-1 truncate rounded-xl px-2.5 font-normal text-muted-foreground',
          showBorder &&
            'border-muted-foreground/10 bg-muted/30 dark:border-muted-foreground/5',
        )}
      >
        {trigger}
      </div>
    );
  }

  return (
    <div
      className={cn(
        // '-mx-1 block overflow-hidden rounded-xl border-border/20 bg-muted-foreground/5', // Current state of the product
        'block overflow-hidden rounded-xl', // Very heavy inset glass
        showBorder &&
          '-mx-1 border border-muted-foreground/10 dark:border-muted-foreground/5',
        // '-mx-1 glass-inset-chat-bubble block overflow-hidden rounded-xl border-border/20',
      )}
    >
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger
          size="condensed"
          className={cn(
            `group/trigger gap-1 rounded-t-xl px-0 font-normal text-muted-foreground`,
            content !== undefined
              ? 'cursor-pointer'
              : 'cursor-default hover:bg-transparent active:bg-transparent',
            showBorder && 'h-6 bg-muted/30 px-2',
            !showBorder &&
              'justify-start py-0 hover:bg-transparent active:bg-transparent',
          )}
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
              'relative flex flex-col pb-0 text-xs',
              !showBorder && 'pt-1',
            )}
          >
            <div
              ref={contentScrollRef}
              className={cn(
                'mask-alpha scrollbar-hover-only block max-h-32 overscroll-contain py-0.5 transition-[max-height] duration-300 ease-[var(--ease-spring-soft)]',
                !showBorder && 'max-h-none',
                contentClassName,
              )}
              style={
                {
                  ...getMaskStyle(),
                  overflowY: 'auto',
                  overflowX: 'auto',
                  maskImage: `
                  linear-gradient(to right, black calc(100% - ${hasVerticalScrollbar ? '10px' : '0px'}), transparent 100%),
                  linear-gradient(to bottom, transparent 0px, black var(--top-fade), black calc(100% - var(--bottom-fade) - ${hasHorizontalScrollbar ? '10px' : '0px'}), transparent 100%)
                `,
                  WebkitMaskImage: `
                  linear-gradient(to right, black calc(100% - ${hasVerticalScrollbar ? '10px' : '0px'}), transparent 100%),
                  linear-gradient(to bottom, transparent 0px, black var(--top-fade), black calc(100% - var(--bottom-fade) - ${hasHorizontalScrollbar ? '10px' : '0px'}), transparent 100%)
                `,
                  maskComposite: 'intersect',
                  WebkitMaskComposite: 'source-in',
                } as React.CSSProperties
              }
            >
              <div ref={setContentWrapperRef}>{content}</div>
            </div>
            {contentFooter && (
              <div
                className={cn(
                  '-ml-2 -mr-2 flex h-6 shrink-0 flex-row items-center justify-start gap-1 rounded-b-xl px-2 py-1 text-muted-foreground transition-all duration-150 ease-out',
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
