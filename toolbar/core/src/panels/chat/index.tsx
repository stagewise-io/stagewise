import { Panel, PanelContent } from '@/components/ui/panel';
import { useAgentState } from '@/hooks/agent/use-agent-state';
import {
  ChatHistoryStateProvider,
  useChatHistoryState,
} from '@/hooks/use-chat-history-state';
import { cn } from '@/utils';
import { useEffect, useMemo, useRef } from 'react';
import { useAgentChat } from '@/hooks/agent/chat/use-agent-chat';
import { useAgents } from '@/hooks/agent/use-agent-provider';
import { ChatHistory } from './chat-history';
import { ChatPanelFooter } from './panel-footer';
import { ChatPanelHeader } from './panel-header';

function ChatWithHistoryPanelContent() {
  const agentState = useAgentState();
  const chatState = useChatHistoryState();
  const { activeChat } = useAgentChat();
  const { connected } = useAgents();

  const enableInputField = useMemo(() => {
    // Disable input if agent is not connected
    if (!connected) {
      return false;
    }
    return !agentState.isWorking;
  }, [agentState.isWorking, connected]);

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
          'flex basis-[initial] flex-col gap-0 px-1 py-0',
          '!h-[calc-size(auto,size)] h-auto max-h-96 min-h-64',
          'mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_48px,black_calc(95%-16px),transparent_calc(100%-16px))]',
          'overflow-hidden rounded-[inherit]',
        )}
      >
        {/* This are renders the output of the agent as markdown and makes it scrollable if necessary. */}
        <ChatHistory />
      </PanelContent>
      <ChatPanelFooter />
    </Panel>
  );
}

export function ChatPanel() {
  return (
    <ChatHistoryStateProvider>
      <ChatWithHistoryPanelContent />
    </ChatHistoryStateProvider>
  );
}
