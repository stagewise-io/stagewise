import { useEffect, useMemo, useRef } from 'react';
import { ChatBubble } from './chat-bubble';
import { Loader2Icon } from 'lucide-react';
import { useAgentChat } from '@/hooks/agent/use-agent-chat/index';
import type {
  ToolApprovalPart,
  ToolResultPart,
} from '@stagewise/agent-interface-internal/toolbar';

export function ChatHistory() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  const { activeChat, isWorking } = useAgentChat();

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
  }, [activeChat]);

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

  const renderedMessages = useMemo(() => {
    if (!activeChat?.messages) return [];
    return activeChat.messages.filter((message) => {
      return message.role === 'user' || message.role === 'assistant';
    });
  }, [activeChat]);

  const toolResultParts = useMemo(() => {
    if (!activeChat?.messages) return [];
    return activeChat.messages.reduce((acc, message) => {
      for (const part of message.content) {
        if (part.type === 'tool-result') {
          acc.push(part);
        }
      }
      return acc;
    }, [] as ToolResultPart[]);
  }, [activeChat]);

  const toolApprovalParts = useMemo(() => {
    if (!activeChat?.messages) return [];
    return activeChat.messages.reduce((acc, message) => {
      for (const part of message.content) {
        if (part.type === 'tool-approval') {
          acc.push(part);
        }
      }
      return acc;
    }, [] as ToolApprovalPart[]);
  }, [activeChat]);

  /* We're adding a bg color on hover because there's a brower bug
     that prevents auto scroll-capturing if we don't do this.
     The onMouseEnter methods is also in place to help with another heuristic to get the browser to capture scroll in this element on hover. */

  return (
    <section
      ref={scrollContainerRef}
      aria-label="Agent message display"
      className="scrollbar-thin pointer-events-auto min-h-full overflow-y-scroll overscroll-contain px-3 py-4 pt-16 pb-14 text-foreground text-sm focus-within:outline-none hover:bg-white/0 focus:outline-none"
      onScroll={handleScroll}
      onMouseEnter={() => {
        scrollContainerRef.current?.focus();
      }}
    >
      {renderedMessages.map((message) => {
        return (
          <ChatBubble
            key={message.id}
            message={message}
            toolResultParts={toolResultParts}
            toolApprovalParts={toolApprovalParts}
          />
        );
      }) ?? []}

      {isWorking && (
        <div className="mt-2 flex w-full flex-row items-center justify-start gap-2 pl-1 text-xs text-zinc-500">
          <Loader2Icon className="size-4 animate-spin stroke-blue-600" />
        </div>
      )}
    </section>
  );
}
