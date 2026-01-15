import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEventListener } from '@/hooks/use-event-listener';
import { useScrollbarGutterWidth } from '@/hooks/use-scrollbar-gutter-width';
import { Button } from '@stagewise/stage-ui/components/button';
import { MessageUser } from './message-user';
import { MessageAssistant } from './message-assistant';
import { MessageLoading } from './message-loading';
import {
  useComparingSelector,
  useKartonState,
  useKartonProcedure,
} from '@/hooks/use-karton';
import { cn } from '@/utils';
import { MessageError } from './message-error';
import type { History, ChatMessage } from '@shared/karton-contracts/ui';
import { IconXmark } from 'nucleo-micro-bold';
import { isEmptyAssistantMessage } from './message-utils';

export const ChatHistory = () => {
  // Detect scrollbar gutter width for padding adjustment
  const scrollbarGutterWidth = useScrollbarGutterWidth();

  const wasAtBottomRef = useRef(true);
  const isScrollingProgrammaticallyRef = useRef(false);
  const forceScrollOnNextUpdateRef = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [lastUserMessageHeight, setLastUserMessageHeight] = useState(0);
  const lastUserMessageRef = useRef<HTMLDivElement | null>(null);
  const lastUserMessageResizeObserverRef = useRef<ResizeObserver | null>(null);

  // Track section height using ResizeObserver
  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Callback ref for the last user message
  const lastUserMessageMeasureRef = useCallback((el: HTMLDivElement | null) => {
    // Clean up previous observer
    if (lastUserMessageResizeObserverRef.current) {
      lastUserMessageResizeObserverRef.current.disconnect();
      lastUserMessageResizeObserverRef.current = null;
    }

    lastUserMessageRef.current = el;

    if (el) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setLastUserMessageHeight(entry.contentRect.height);
        }
      });
      observer.observe(el);
      lastUserMessageResizeObserverRef.current = observer;
    } else {
      setLastUserMessageHeight(0);
    }
  }, []);
  const { activeChatId, chats, isWorking } = useKartonState(
    useComparingSelector((s) => ({
      activeChatId: s.agentChat?.activeChatId,
      isWorking: s.agentChat?.isWorking ?? false,
      chats: s.agentChat?.chats,
      workspaceStatus: s.workspaceStatus,
    })),
  );

  const createTab = useKartonProcedure((s) => s.browser.createTab);
  const sendUserMessage = useKartonProcedure(
    (s) => s.agentChat.sendUserMessage,
  );

  const [removedSuggestionUrls, setRemovedSuggestionUrls] = useState<
    Set<string>
  >(new Set());

  // Shuffle suggestions once on mount using Fisher-Yates algorithm
  const [shuffledSuggestions] = useState(() => {
    const shuffled = [...suggestions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  });

  const visibleSuggestions = useMemo(() => {
    return shuffledSuggestions
      .filter((s) => !removedSuggestionUrls.has(s.url))
      .slice(0, 3);
  }, [removedSuggestionUrls, shuffledSuggestions]);

  const handleRemoveSuggestion = (url: string) => {
    setRemovedSuggestionUrls((prev) => new Set([...Array.from(prev), url]));
  };

  const activeChat = useMemo(() => {
    return activeChatId ? chats?.[activeChatId] : null;
  }, [activeChatId, chats]);

  // Force scroll to the very bottom
  const scrollToBottom = () => {
    const container = (ref as React.RefObject<HTMLDivElement>)?.current;
    if (!container) return;

    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      isScrollingProgrammaticallyRef.current = true;
      container.scrollTop = container.scrollHeight;
      // Reset after scroll event has been processed
      requestAnimationFrame(() => {
        isScrollingProgrammaticallyRef.current = false;
      });
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
    // Ignore programmatic scrolls - only track user-initiated scrolls
    if (isScrollingProgrammaticallyRef.current) {
      return;
    }
    const isAtBottom = checkIfAtBottom();
    wasAtBottomRef.current = isAtBottom;
  };

  // Auto-scroll to bottom when content changes, but only if user was at bottom
  // or if a message was just sent (forceScrollOnNextUpdateRef)
  useEffect(() => {
    if (forceScrollOnNextUpdateRef.current || wasAtBottomRef.current) {
      scrollToBottom();
      wasAtBottomRef.current = true;
      forceScrollOnNextUpdateRef.current = false;
    }
  }, [activeChat]);

  // Initialize scroll position to bottom on mount
  useEffect(() => {
    // Set initial position to bottom
    scrollToBottom();
    wasAtBottomRef.current = true;
  }, []);

  // Force scroll to bottom when user sends a message
  // We set a flag here instead of scrolling immediately because the message
  // hasn't been added to state yet (sendMessage is async). The actual scroll
  // happens in the useEffect when activeChat updates with the new message.
  const handleMessageSent = useCallback(() => {
    forceScrollOnNextUpdateRef.current = true;
    wasAtBottomRef.current = true;
  }, []);

  useEventListener('chat-message-sent', handleMessageSent);

  // Adjust scroll position when FileDiffCard height changes
  // This makes it look like the container grew/shrank at the bottom
  const handleFileDiffCardHeightChanged = useCallback(
    (e: CustomEvent<{ delta: number; height: number }>) => {
      const container = ref.current;
      if (!container) return;

      const { delta } = e.detail;
      if (delta !== 0) {
        // Adjust scroll by the delta to keep content visually in place
        isScrollingProgrammaticallyRef.current = true;
        container.scrollTop += delta;
        requestAnimationFrame(() => {
          isScrollingProgrammaticallyRef.current = false;
        });
      }
    },
    [],
  );

  useEventListener(
    'file-diff-card-height-changed',
    handleFileDiffCardHeightChanged as EventListener,
  );

  const renderedMessages = useMemo(() => {
    if (!activeChat?.messages) return [];

    return activeChat?.messages
      .filter(
        (message) => message.role === 'user' || message.role === 'assistant',
      )
      .reduce<History>((curr, message) => {
        // If the last message is the same role as the current message and the role is 'assistant, we append the parts to the previous message instead of pushing the new message to the array.
        const lastMessage = curr[curr.length - 1];
        if (!lastMessage) {
          // Shallow copy to avoid mutating original, but preserve part references
          curr.push({ ...message, parts: [...message.parts] });
          return curr;
        }

        if (lastMessage.role === message.role && message.role === 'assistant') {
          lastMessage.parts = [...lastMessage.parts, ...message.parts];
          // Use the longer thinkingDurations array (each message has cumulative durations)
          if (
            message.metadata?.thinkingDurations &&
            message.metadata.thinkingDurations.length >
              (lastMessage.metadata?.thinkingDurations?.length ?? 0)
          ) {
            lastMessage.metadata = {
              ...lastMessage.metadata,
              thinkingDurations: message.metadata.thinkingDurations,
            };
          }
        } else {
          // Shallow copy to avoid mutating original, but preserve part references
          curr.push({ ...message, parts: [...message.parts] });
        }
        return curr;
      }, []);
  }, [activeChat]);

  // Find the index of the last user message
  const lastUserMessageIndex = useMemo(() => {
    for (let i = renderedMessages.length - 1; i >= 0; i--) {
      if (renderedMessages[i].role === 'user') {
        return i;
      }
    }
    return -1;
  }, [renderedMessages]);

  // Determine if we should show the "Working..." indicator
  const showWorkingIndicator = useMemo(() => {
    if (!isWorking) return false;

    const lastMessage = renderedMessages[renderedMessages.length - 1];
    if (!lastMessage) return false;

    // Show if last message is from user (agent hasn't responded yet)
    if (lastMessage.role === 'user') return true;

    // Show if last message is an empty assistant message (agent just started)
    if (
      lastMessage.role === 'assistant' &&
      isEmptyAssistantMessage(lastMessage)
    )
      return true;

    return false;
  }, [isWorking, renderedMessages]);

  /* We're adding a bg color on hover because there's a brower bug
     that prevents auto scroll-capturing if we don't do this.
     The onMouseEnter methods is also in place to help with another heuristic to get the browser to capture scroll in this element on hover. */

  // Calculate right padding to account for scrollbar gutter
  // When scrollbarGutterWidth > 0 (classic scrollbars), reduce right padding
  // so that paddingRight + gutterWidth = 16px (same as left padding)
  const basePadding = 16; // px-4 = 16px
  const rightPadding = Math.max(0, basePadding - scrollbarGutterWidth);

  return (
    <section
      ref={ref}
      aria-label="Agent message display"
      className={cn(
        'mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_4px,black_100%)] pointer-events-auto block h-full min-h-[inherit] overflow-y-auto overscroll-contain text-foreground text-sm focus-within:outline-none focus:outline-none',
        'scrollbar-hover-only',
        renderedMessages.length === 0 && 'mb-1 h-max overflow-y-hidden',
      )}
      style={{
        paddingLeft: basePadding,
        paddingRight: rightPadding,
        paddingBottom: `calc(1rem + var(--file-diff-card-height, 0px))`,
        scrollbarGutter: 'stable',
      }}
      onScroll={handleScroll}
    >
      {renderedMessages.map((message, index) => {
        const isLastMessage = index === renderedMessages.length - 1;
        const isLastAssistantMessage =
          isLastMessage && message.role === 'assistant';

        const messageComponent =
          message.role === 'user' ? (
            <MessageUser
              key={message.id ?? `user-${index}`}
              message={message as ChatMessage & { role: 'user' }}
              isLastMessage={isLastMessage}
              measureRef={
                index === lastUserMessageIndex
                  ? lastUserMessageMeasureRef
                  : undefined
              }
            />
          ) : (
            <MessageAssistant
              key={message.id ?? `assistant-${index}`}
              message={message as ChatMessage & { role: 'assistant' }}
              isLastMessage={isLastMessage}
            />
          );

        // Wrap last assistant message + error + loading in a flex container with minHeight
        if (isLastAssistantMessage)
          return (
            <div
              key={`wrapper-${message.id ?? index}`}
              className="flex flex-col"
              style={{
                minHeight: containerHeight - lastUserMessageHeight,
              }}
            >
              {messageComponent}
              {activeChat?.error && <MessageError error={activeChat.error} />}
              {/* Working indicator inside wrapper when last message is assistant */}
              {showWorkingIndicator && <MessageLoading />}
            </div>
          );

        return messageComponent;
      }) ?? []}

      {/* Render error after messages only if last message is user (or no messages) */}
      {(renderedMessages.length === 0 ||
        renderedMessages[renderedMessages.length - 1]?.role === 'user') &&
        activeChat?.error && <MessageError error={activeChat.error} />}

      {/* Working indicator outside wrapper when last message is user (or no messages) */}
      {showWorkingIndicator &&
        (renderedMessages.length === 0 ||
          renderedMessages[renderedMessages.length - 1]?.role === 'user') && (
          <div
            className="flex flex-col"
            style={{
              minHeight: containerHeight - lastUserMessageHeight,
            }}
          >
            <MessageLoading />
          </div>
        )}

      {renderedMessages.length === 0 && (
        <div className="flex w-full flex-col items-center justify-center gap-1 text-sm">
          {visibleSuggestions.map((suggestion) => (
            <ChatSuggestion
              key={suggestion.url}
              {...suggestion}
              onClick={async () => {
                await createTab(suggestion.url);
                await sendUserMessage({
                  id: crypto.randomUUID(),
                  role: 'user',
                  parts: [
                    {
                      type: 'text',
                      text: suggestion.prompt,
                    },
                  ],
                });
              }}
              onRemove={() => handleRemoveSuggestion(suggestion.url)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

type ChatSuggestionProps = {
  prompt: string;
  suggestion: string | React.ReactNode;
  faviconUrl: string;
  url: string;
};

const ChatSuggestion: React.FC<
  ChatSuggestionProps & { onClick?: () => void; onRemove?: () => void }
> = ({ suggestion, faviconUrl, url: _url, onClick, onRemove }) => {
  return (
    <div
      onClick={onClick}
      className="group/suggestion relative flex w-full cursor-pointer flex-row items-center justify-start gap-3 rounded-lg p-2 text-muted-foreground hover:bg-hover-derived hover:text-foreground"
    >
      <span className="flex shrink-0 items-center">
        <img src={faviconUrl} className="size-3 rounded-sm" alt="Favicon" />
      </span>
      <span className="group-hover/suggestion:mask-[linear-gradient(to_left,transparent_0px,transparent_24px,black_48px)] w-full overflow-hidden text-sm leading-tight transition-[mask-image] duration-200">
        {suggestion}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="-translate-y-1/2 absolute top-1/2 right-2 ml-auto hidden text-muted-foreground group-hover/suggestion:flex"
        onClick={(e) => {
          e.stopPropagation();
          onRemove?.();
        }}
      >
        <IconXmark className="size-3" />
      </Button>
    </div>
  );
};

const suggestions: ChatSuggestionProps[] = [
  {
    prompt:
      'You are looking at airbnb.com. Please inspect the page to find out how their icons work, and provide a simple explanation. If possible, find and focus on a specific, interesting icon that you could clone and use in my own application.',
    suggestion: (
      <span className="font-normal">
        How do{' '}
        <span className="font-medium text-primary-foreground group-hover/suggestion:text-hover-derived">
          airbnb.com
        </span>{' '}
        icons work?
      </span>
    ),
    faviconUrl: 'https://airbnb.com/favicon.ico',
    url: 'https://airbnb.com',
  },
  {
    prompt:
      'You are looking at reflect.app. Please inspect the page to find out how their glow effect works, and extract all the necessary styles you need to replicate it 1:1 in my own application.',
    suggestion: (
      <span className="font-normal">
        Take the glow effect from{' '}
        <span className="font-medium text-primary-foreground group-hover/suggestion:text-hover-derived">
          reflect.app
        </span>
      </span>
    ),
    faviconUrl: 'https://reflect.app/favicon.ico',
    url: 'https://reflect.app',
  },
  {
    prompt:
      'You are looking at react.email. Please inspect the page to find out how their frosted glass effect works, and extract all the necessary styles you need to replicate it 1:1 in my own application.',
    suggestion: (
      <span className="font-normal">
        Copy the glass effect from{' '}
        <span className="font-medium text-primary-foreground group-hover/suggestion:text-hover-derived">
          react.email
        </span>{' '}
      </span>
    ),
    faviconUrl: 'https://react.email/meta/favicon.ico',
    url: 'https://react.email',
  },
  {
    prompt:
      'You are looking at posthog.com. Please inspect the page to find out exactly what their button looks like, and extract all the necessary styles and animations you need to make the button in our application look and behave exactly like it.',
    suggestion: (
      <span className="font-normal">
        Make our button look like{' '}
        <span className="font-medium text-primary-foreground group-hover/suggestion:text-hover-derived">
          posthog.com
        </span>
      </span>
    ),
    faviconUrl: 'https://posthog.com/favicon-32x32.png',
    url: 'https://posthog.com',
  },
  {
    prompt:
      'You are looking at cursor.com. Please inspect the page to find out what their color theme is, and provide a concise summary of the colors and their usage, so I can learn something from it for my own application.',
    suggestion: (
      <span className="font-normal">
        What's the theme of{' '}
        <span className="font-medium text-primary-foreground group-hover/suggestion:text-hover-derived">
          cursor.com
        </span>
        ?
      </span>
    ),
    faviconUrl: 'https://cursor.com/favicon.ico',
    url: 'https://cursor.com',
  },
];
