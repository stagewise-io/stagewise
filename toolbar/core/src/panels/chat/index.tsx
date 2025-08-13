import { Panel, PanelContent } from '@/components/ui/panel';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { useEffect, useMemo, useRef } from 'react';
import { ChatHistory } from './chat-history';
import { ChatPanelFooter } from './panel-footer';
import { ChatPanelHeader } from './panel-header';
import {
  useComparingSelector,
  useKartonConnected,
  useKartonState,
} from '@/hooks/use-karton';

export function ChatPanel() {
  const chatState = useChatState();
  const { activeChatId, isWorking, chats } = useKartonState(
    useComparingSelector((s) => ({
      activeChatId: s.activeChatId,
      isWorking: s.isWorking,
      chats: s.chats,
    })),
  );
  const isConnected = useKartonConnected();

  const activeChat = useMemo(() => {
    return activeChatId ? (chats[activeChatId] ?? null) : null;
  }, [activeChatId, chats]);

  const enableInputField = useMemo(() => {
    // Disable input if agent is not connected
    if (!isConnected) {
      return false;
    }
    return !isWorking;
  }, [isWorking, isConnected]);

  const anyMessageInChat = useMemo(() => {
    return activeChat?.messages?.length > 0;
  }, [activeChat?.messages]);

  /* If the user clicks on prompt creation mode, we force-focus the input field all the time. */
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const shouldMaintainFocusRef = useRef<boolean>(false);

  // Start prompt creation mode when chat panel opens
  useEffect(() => {
    if (enableInputField) {
      chatState.startPromptCreation();
    }
  }, []);

  // Handle escape key to stop prompt creation
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && chatState.isPromptCreationActive) {
        chatState.stopPromptCreation();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [chatState.isPromptCreationActive, chatState.stopPromptCreation]);

  // Focus management for prompt creation mode
  useEffect(() => {
    if (chatState.isPromptCreationActive && enableInputField) {
      shouldMaintainFocusRef.current = true;

      // Initial focus
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);

      // Set up interval to check and maintain focus
      focusIntervalRef.current = setInterval(() => {
        if (
          shouldMaintainFocusRef.current &&
          chatState.isPromptCreationActive
        ) {
          const activeElement = document.activeElement;
          const inputElement = inputRef.current;

          // Only refocus if the active element is not the input and not within the footer
          if (inputElement && activeElement !== inputElement) {
            // Check if focus is on something within the footer (like buttons)
            const isFooterElement = footerRef.current?.contains(
              activeElement as Node,
            );
            if (!isFooterElement) {
              inputElement.focus();
            }
          }
        }
      }, 100); // Check every 100ms
    } else {
      shouldMaintainFocusRef.current = false;
      if (focusIntervalRef.current) {
        clearInterval(focusIntervalRef.current);
        focusIntervalRef.current = null;
      }
      inputRef.current?.blur();
    }

    return () => {
      if (focusIntervalRef.current) {
        clearInterval(focusIntervalRef.current);
        focusIntervalRef.current = null;
      }
    };
  }, [chatState.isPromptCreationActive, enableInputField]);

  const footerRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle clicks outside footer to stop prompt creation
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!chatState.isPromptCreationActive) return;

      const target = e.target as HTMLElement;
      // Check if click is outside the footer
      if (footerRef.current && !footerRef.current.contains(target)) {
        shouldMaintainFocusRef.current = false;
        chatState.stopPromptCreation();
      }
    };

    // Also handle clicks on the document to catch iframe clicks
    const handleDocumentClick = (e: MouseEvent) => {
      if (!chatState.isPromptCreationActive) return;

      const target = e.target as HTMLElement;
      // Check if the click target is the iframe
      if (target.id === 'user-app-iframe' || target.tagName === 'IFRAME') {
        // Don't stop prompt creation when clicking on iframe - just refocus
        setTimeout(() => {
          if (
            chatState.isPromptCreationActive &&
            shouldMaintainFocusRef.current
          ) {
            inputRef.current?.focus();
          }
        }, 50);
      }
    };

    if (panelRef.current && chatState.isPromptCreationActive) {
      panelRef.current.addEventListener('click', handleClick);
      document.addEventListener('click', handleDocumentClick, true);
    }

    return () => {
      panelRef.current?.removeEventListener('click', handleClick);
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [chatState.isPromptCreationActive, chatState.stopPromptCreation]);

  useEffect(() => {
    if (chatHistoryRef.current && footerRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        // calculate the height difference because we will need to apply that to the scroll position
        const heightDifference =
          Number.parseInt(
            window
              .getComputedStyle(footerRef.current)
              .getPropertyValue('padding-bottom'),
          ) - chatHistoryRef.current.clientHeight;

        // scroll the chat history by the height difference after applying the updated padding
        chatHistoryRef.current.style.paddingBottom = `${footerRef.current.clientHeight}px`;
        chatHistoryRef.current.scrollTop -= heightDifference;
      });
      resizeObserver.observe(footerRef.current);
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [chatHistoryRef.current]);

  return (
    <Panel
      ref={panelRef}
      className={cn(
        anyMessageInChat
          ? 'h-[35vh] max-h-[50vh] min-h-[20vh]'
          : '!h-[calc-size(auto,size)] h-auto min-h-0',
      )}
    >
      <ChatPanelHeader />
      <PanelContent
        className={cn(
          'block px-1 py-0',
          'h-full max-h-96 min-h-64',
          'mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_48px,black_calc(95%-16px),transparent_calc(100%-16px))]',
          'overflow-hidden rounded-[inherit]',
        )}
      >
        {/* This are renders the output of the agent as markdown and makes it scrollable if necessary. */}
        <ChatHistory ref={chatHistoryRef} />
      </PanelContent>
      <ChatPanelFooter ref={footerRef} inputRef={inputRef} />
    </Panel>
  );
}
