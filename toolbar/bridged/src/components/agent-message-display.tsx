import { useAgentMessaging } from '@/hooks/agent/use-agent-messaging';
import { useAgentState } from '@/hooks/agent/use-agent-state';
import { AgentStateType } from '@stagewise/agent-interface/toolbar';
import { useEffect, useRef } from 'react';

export function AgentMessageDisplay() {
  const messaging = useAgentMessaging();
  const agentState = useAgentState();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // Force scroll to the very bottom
  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 0);
  };

  // Check if user is at the bottom of the scroll container
  const checkIfAtBottom = () => {
    const container = scrollContainerRef.current;
    if (!container) return true;

    // Use a more generous threshold to account for sub-pixel differences
    const threshold = 10;
    return (
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - threshold
    );
  };

  // Handle scroll events to track user scroll position
  const handleScroll = () => {
    const isAtBottom = checkIfAtBottom();
    wasAtBottomRef.current = isAtBottom;
  };

  // Auto-scroll to bottom when content changes, but only if user was at bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (wasAtBottomRef.current) {
      // Always scroll to bottom if user was at bottom before the update
      scrollToBottom();
    }
  }, [messaging.agentMessage?.contentItems, agentState.state]);

  // Initialize scroll position tracking
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);

    // Set initial position to bottom
    scrollToBottom();
    wasAtBottomRef.current = true;

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const shouldShow =
    messaging.agentMessage?.contentItems?.length > 0 ||
    agentState.state === AgentStateType.IDLE;

  if (!shouldShow) {
    return null;
  }

  /* We're adding a bg color on hover because there's a brower bug
     that prevents auto scroll-capturing if we don't do this.
     The onMouseEnter methods is also in place to help with another heuristic to get the browser to capture scroll in this element on hover. */

  return (
    <section
      ref={scrollContainerRef}
      aria-label="Agent message display"
      className="scrollbar-thin pointer-events-auto space-y-2 overflow-y-scroll overscroll-contain px-3 py-4 text-foreground text-sm focus-within:outline-none hover:bg-white/0 focus:outline-none"
      onScroll={handleScroll}
      onMouseEnter={() => {
        scrollContainerRef.current?.focus();
      }}
    >
      {messaging.agentMessage?.contentItems?.map((item, index) => {
        if (item.type === 'text') {
          return (
            <p key={`item_${index + 1}`} className="whitespace-pre-wrap">
              {item.text}
            </p>
          );
        }

        if (item.type === 'image') {
          return (
            <div key={`item_${index + 1}`} className="text-sm">
              <img
                src={item.data}
                alt="Agent message attachment"
                className="max-w-full rounded-lg border border-black/15 ring-1 ring-white/20"
              />
            </div>
          );
        }

        return null;
      })}
    </section>
  );
}
