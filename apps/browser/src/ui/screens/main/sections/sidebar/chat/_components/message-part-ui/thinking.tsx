import { cn } from '@/utils';
import type { ReasoningUIPart } from '@shared/karton-contracts/ui';
import { useState, useEffect, useRef, useMemo } from 'react';
import { BrainIcon } from 'lucide-react';
import { Streamdown } from '@/components/streamdown';
import { useTypeWriterText } from '@/hooks/use-type-writer-text';
import { ToolPartUI } from './tools/shared/tool-part-ui';

export const ThinkingPart = ({
  part,
  isAutoExpanded,
  isShimmering,
  thinkingDuration,
}: {
  part: ReasoningUIPart;
  isAutoExpanded: boolean;
  isShimmering: boolean;
  thinkingDuration?: number;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [containerReady, setContainerReady] = useState(false);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const isUserScrolledRef = useRef(false);
  const formattedThinkingDuration = useMemo(() => {
    if (!thinkingDuration) return null;
    // thinkingDuration is ms, convert to s without decimals
    return `${Math.round(thinkingDuration / 1000)}s`;
  }, [thinkingDuration]);

  useEffect(() => {
    setIsExpanded(isAutoExpanded);
  }, [isAutoExpanded]);

  // Find the scrollable container element (the CollapsibleContent with overflow-y-auto)
  const findScrollContainer = (
    element: HTMLElement | null,
  ): HTMLElement | null => {
    if (!element) return null;
    const style = window.getComputedStyle(element);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      return element;
    }
    return findScrollContainer(element.parentElement);
  };

  // Callback ref to find scroll container when wrapper mounts
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const setContentWrapperRef = (element: HTMLDivElement | null) => {
    contentWrapperRef.current = element;
    if (element) {
      const container = findScrollContainer(element);
      if (container) {
        scrollContainerRef.current = container;
        setContainerReady(true);
      } else {
        setContainerReady(false);
      }
    } else {
      setContainerReady(false);
    }
  };

  // Check if user is at bottom of scroll container
  const isAtBottom = (element: HTMLElement): boolean => {
    const threshold = 10; // pixels from bottom to consider "at bottom"
    return (
      element.scrollHeight - element.scrollTop - element.clientHeight <=
      threshold
    );
  };

  // Track user scroll position and reset when expanded
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isExpanded || !containerReady) return;

    // When first expanded, scroll to bottom and reset scroll state
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
  }, [isExpanded, containerReady]);

  // Auto-scroll to bottom when text changes (if user hasn't scrolled away)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isExpanded || !containerReady) return;

    // If user was at bottom before, keep auto-scrolling
    const shouldAutoScroll = !isUserScrolledRef.current;

    if (shouldAutoScroll) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [part.text, isExpanded, containerReady]);

  const displayedText = useTypeWriterText(part.text, {
    charsPerInterval: 2,
    framesPerInterval: 1,
    showAllOnFirstRender: true,
    animateOnIncreaseOnly: true,
  });
  return (
    <ToolPartUI
      expanded={isExpanded}
      setExpanded={setIsExpanded}
      contentClassName="max-h-24"
      trigger={
        <>
          <BrainIcon
            className={cn(
              'size-3 text-muted-foreground',
              isShimmering
                ? 'animate-thinking-part-brain-pulse text-primary'
                : '',
            )}
          />
          <span
            className={cn(
              'flex-1 truncate text-start text-xs',
              isShimmering
                ? 'shimmer-text shimmer-duration-1500 shimmer-from-primary shimmer-to-blue-300'
                : 'text-muted-foreground',
            )}
          >
            {part.state === 'streaming' && 'Thinking...'}
            {part.state === 'done' && formattedThinkingDuration && (
              <span>Thought for {formattedThinkingDuration}</span>
            )}
            {part.state === 'done' && !formattedThinkingDuration && (
              <span>Thought</span>
            )}
          </span>
        </>
      }
      content={
        <div
          ref={setContentWrapperRef}
          className="pb-1 opacity-60 group-data-[state=streaming]/thinking-part:opacity-90"
        >
          <Streamdown isAnimating={part.state === 'streaming'}>
            {displayedText}
          </Streamdown>
        </div>
      }
    />
  );
};
