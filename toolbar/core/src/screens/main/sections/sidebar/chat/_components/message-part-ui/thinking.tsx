import { cn } from '@/utils';
import type { ReasoningUIPart } from '@stagewise/karton-contract';
import { useState, useEffect, useRef } from 'react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@stagewise/stage-ui/components/collapsible';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import { Streamdown } from '@/components/streamdown';
import { useTypeWriterText } from '@/hooks/use-type-writer-text';

export const ThinkingPart = ({
  part,
  isLastPart,
}: {
  part: ReasoningUIPart;
  isLastPart: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [containerReady, setContainerReady] = useState(false);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const isUserScrolledRef = useRef(false);

  useEffect(() => {
    setIsExpanded(isLastPart);
  }, [isLastPart]);

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
    <div
      data-state={part.state}
      className="-mx-1 group/thinking-part block min-w-32 rounded-xl border-border/20 bg-muted-foreground/5"
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger
          size="condensed"
          className="h-6 cursor-pointer gap-1.5 rounded-full px-2.5 text-muted-foreground"
        >
          <BrainIcon className="size-3 group-data-[state=streaming]/thinking-part:animate-thinking-part-brain-pulse" />
          <span className="flex-1 text-start text-xs group-data-[state=streaming]/thinking-part:animate-thinking-part-brain-pulse">
            {part.state === 'streaming' ? 'Thinking...' : 'Thought'}
          </span>
          <ChevronDownIcon
            className={cn(
              'size-3 transition-transform duration-150',
              isExpanded && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_16px,black_calc(100%_-_8px),transparent)] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-transparent hover:scrollbar-thumb-black/30 block max-h-32 overflow-y-auto overscroll-y-none pt-1.5 pb-0.5 pl-2.5 text-[0.8rem]">
          <div ref={setContentWrapperRef} className="pt-2 pb-1 opacity-60">
            <Streamdown isAnimating={part.state === 'streaming'}>
              {displayedText}
            </Streamdown>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
