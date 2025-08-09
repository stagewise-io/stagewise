import { Panel, PanelContent } from '@/components/ui/panel';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { useEffect, useMemo, useRef } from 'react';
import { useAgentChat } from '@/hooks/agent/use-agent-chat/use-agent-chat';
import { useAgents } from '@/hooks/agent/use-agent-provider';
import { ChatHistory } from './chat-history';
import { ChatPanelFooter } from './panel-footer';
import { ChatPanelHeader } from './panel-header';

export function ChatPanel() {
  const chatState = useChatState();
  const { activeChat, isWorking } = useAgentChat();
  const { connected } = useAgents();

  const enableInputField = useMemo(() => {
    // Disable input if agent is not connected
    if (!connected) {
      return false;
    }
    return !isWorking;
  }, [isWorking, connected]);

  const anyMessageInChat = useMemo(() => {
    return activeChat?.messages?.length > 0;
  }, [activeChat?.messages]);

  /* If the user clicks on prompt creation mode, we force-focus the input field all the time. */
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isIntentionallyStoppingRef = useRef<boolean>(false);

  useEffect(() => {
    const blurHandler = () => {
      // Don't refocus if we're intentionally stopping prompt creation
      if (isIntentionallyStoppingRef.current) {
        isIntentionallyStoppingRef.current = false;
        return;
      }
      inputRef.current?.focus();
    };

    if (chatState.isPromptCreationActive && enableInputField) {
      inputRef.current?.focus();
      // We only force re-focus if the prompt creation is active.
      inputRef.current?.addEventListener('blur', blurHandler);
      isIntentionallyStoppingRef.current = false;
    } else {
      // When stopping prompt creation, set the flag to prevent refocus
      if (inputRef.current === document.activeElement) {
        isIntentionallyStoppingRef.current = true;
      }
      inputRef.current?.blur();
    }

    return () => {
      inputRef.current?.removeEventListener('blur', blurHandler);
    };
  }, [chatState.isPromptCreationActive, enableInputField]);

  const footerRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatHistoryRef.current && footerRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        chatHistoryRef.current.style.paddingBottom = `${footerRef.current.clientHeight}px`;
      });
      resizeObserver.observe(footerRef.current);
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [chatHistoryRef.current]);

  return (
    <Panel
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
      <ChatPanelFooter ref={footerRef} />
    </Panel>
  );
}
