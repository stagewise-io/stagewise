import { useEffect, useRef } from 'react';
import { ChatBubble } from './chat-bubble';
import { Loader2Icon } from 'lucide-react';

export function ChatHistory() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  const messages: {
    fromAgent: boolean;
    message: string;
    timestamp: Date;
  }[] = [
    {
      fromAgent: false,
      message: 'I want to clean up the design of the app',
      timestamp: new Date(),
    },
    {
      fromAgent: true,
      message:
        "Hey, okay let's do that! Do you have any kind of inspiration in mind?",
      timestamp: new Date(),
    },
    {
      fromAgent: false,
      message:
        'The app is really cluttered right now. I want to clean it up a bit.',
      timestamp: new Date(),
    },
    {
      fromAgent: false,
      message: 'A design like Notion would be awesome.',
      timestamp: new Date(),
    },
    {
      fromAgent: true,
      message:
        'Okay, so: Rounded corners, very minimalistic, and a lot of white space?',
      timestamp: new Date(),
    },
    {
      fromAgent: false,
      message: 'Yes, that sounds great!',
      timestamp: new Date(),
    },
    {
      fromAgent: true,
      message:
        "Okay, I'll first revamp the page you're on right now. We can that take that as a starting point for the rest of the app.",
      timestamp: new Date(),
    },
  ];

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
  }, [messages]);

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

  /* We're adding a bg color on hover because there's a brower bug
     that prevents auto scroll-capturing if we don't do this.
     The onMouseEnter methods is also in place to help with another heuristic to get the browser to capture scroll in this element on hover. */

  return (
    <section
      ref={scrollContainerRef}
      aria-label="Agent message display"
      className="scrollbar-thin pointer-events-auto overflow-y-scroll overscroll-contain px-3 py-4 pt-16 pb-14 text-foreground text-sm focus-within:outline-none hover:bg-white/0 focus:outline-none"
      onScroll={handleScroll}
      onMouseEnter={() => {
        scrollContainerRef.current?.focus();
      }}
    >
      {messages.map((message, index) => {
        return (
          <ChatBubble key={`item_${index + 1}`} {...message} ToolCalls={[]} />
        );
      })}
      <div className="mt-2 flex w-full flex-row items-center justify-start gap-2 pl-1 text-xs text-zinc-500">
        <Loader2Icon className="size-4 animate-spin stroke-blue-600" />
        <span className="max-w-48 truncate">Looking for files...</span>
      </div>
    </section>
  );
}
