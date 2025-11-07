import { useEffect, useMemo, useRef } from 'react';
import { ChatBubble } from './chat-bubble';
import { Loader2Icon, SparklesIcon } from 'lucide-react';
import { useComparingSelector, useKartonState } from '@/hooks/use-karton';
import { cn } from '@/utils';
import { ChatErrorBubble } from './chat-error-bubble';

export const ChatHistory = () => {
  const wasAtBottomRef = useRef(true);
  const ref = useRef<HTMLDivElement>(null);
  const { activeChatId, isWorking, chats } = useKartonState(
    useComparingSelector((s) => ({
      activeChatId: s.workspace?.agentChat?.activeChatId,
      isWorking: s.workspace?.agentChat?.isWorking,
      chats: s.workspace?.agentChat?.chats,
    })),
  );

  const activeChat = useMemo(() => {
    return activeChatId ? chats?.[activeChatId] : null;
  }, [activeChatId, chats]);

  // Force scroll to the very bottom
  const scrollToBottom = () => {
    const container = (ref as React.RefObject<HTMLDivElement>)?.current;
    if (!container) return;

    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 0);
  };

  // Check if user is at the bottom of the scroll container
  const checkIfAtBottom = () => {
    const container = (ref as React.RefObject<HTMLDivElement>)?.current;
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
    const container = (ref as React.RefObject<HTMLDivElement>)?.current;
    if (!container) return;

    if (wasAtBottomRef.current) {
      // Always scroll to bottom if user was at bottom before the update
      scrollToBottom();
    }
  }, [activeChat]);

  // Initialize scroll position tracking
  useEffect(() => {
    const container = (ref as React.RefObject<HTMLDivElement>)?.current;
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

    return activeChat?.messages.filter(
      (message) => message.role === 'user' || message.role === 'assistant',
    );
  }, [activeChat]);

  /* We're adding a bg color on hover because there's a brower bug
     that prevents auto scroll-capturing if we don't do this.
     The onMouseEnter methods is also in place to help with another heuristic to get the browser to capture scroll in this element on hover. */

  return (
    <section
      ref={ref}
      aria-label="Agent message display"
      className="scrollbar-thin scrollbar-thumb-black/15 scrollbar-track-transparent pointer-events-auto mr-1.5 block h-full min-h-[inherit] overflow-y-scroll overscroll-contain py-4 pt-16 pb-4 pl-1.5 text-foreground text-sm focus-within:outline-none focus:outline-none"
      onScroll={handleScroll}
    >
      {renderedMessages.map((message, index) => {
        return (
          <ChatBubble
            key={`${message.role}-${index}`}
            message={message}
            isLastMessage={index === renderedMessages.length - 1}
          />
        );
      }) ?? []}

      {activeChat?.error && <ChatErrorBubble error={activeChat.error} />}

      <div
        className={cn(
          'mt-4 flex h-0 w-full flex-row items-center justify-start gap-2 pl-2 text-xs text-zinc-500 opacity-0',
          isWorking && 'h-auto opacity-100',
        )}
      >
        <Loader2Icon className="size-4 animate-spin stroke-blue-600" />
      </div>

      {renderedMessages.length === 0 && (
        <div className="absolute inset-0 flex size-full flex-col items-center justify-center gap-3 px-4 py-2 text-black/30 text-sm">
          <SparklesIcon className="size-8 stroke-black opacity-10" />
          <span>Start by writing a message</span>
        </div>
      )}
    </section>
  );
};
