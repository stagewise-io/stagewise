import { ContextElementsChips } from '@/components/context-elements-chips';
import { TextSlideshow } from '@/components/ui/text-slideshow';
import { Button } from '@/components/ui/button';
import { PanelFooter } from '@/components/ui/panel';
import { useAgents } from '@/hooks/agent/use-agent-provider';
import { useAgentState } from '@/hooks/agent/use-agent-state';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { Textarea } from '@headlessui/react';
import { AgentStateType } from '@stagewise/agent-interface/toolbar';
import { ArrowUpIcon, SquareIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

const GlassyTextInputClassNames =
  'origin-center rounded-xl border border-black/10 ring-1 ring-white/20 transition-all duration-150 ease-out after:absolute after:inset-0 after:size-full after:content-normal after:rounded-[inherit] after:bg-gradient-to-b after:from-white/5 after:to-white/0 after:transition-colors after:duration-150 after:ease-out disabled:pointer-events-none disabled:bg-black/5 disabled:text-foreground/60 disabled:opacity-30';

export function ChatPanelFooter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatState = useChatState();
  const agentState = useAgentState();
  const { connected } = useAgents();
  const [isComposing, setIsComposing] = useState(false);

  const enableInputField = useMemo(() => {
    // Disable input if agent is not connected
    if (!connected) {
      return false;
    }
    return (
      agentState.state === AgentStateType.WAITING_FOR_USER_RESPONSE ||
      agentState.state === AgentStateType.IDLE
    );
  }, [agentState.state, connected]);

  const canSendMessage = useMemo(() => {
    return (
      enableInputField &&
      chatState.chatInput.trim().length > 2 &&
      chatState.isPromptCreationActive
    );
  }, [enableInputField, chatState]);

  const handleSubmit = useCallback(() => {
    chatState.sendMessage();
    chatState.stopPromptCreation();
  }, [chatState]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, isComposing],
  );

  const handleCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false);
  }, []);

  return (
    <PanelFooter
      clear
      className="absolute right-px bottom-px left-px z-10 flex flex-col items-stretch gap-1"
    >
      <ContextElementsChips />
      <div className="flex h-fit flex-1 flex-row items-end justify-between gap-1">
        <div className="relative flex flex-1">
          <Textarea
            ref={inputRef}
            value={chatState.chatInput}
            onChange={(e) => {
              chatState.setChatInput(e.target.value);
            }}
            onFocus={() => {
              chatState.startPromptCreation();
            }}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            disabled={!enableInputField}
            className={cn(
              GlassyTextInputClassNames,
              'z-10 h-8 w-full resize-none rounded-2xl bg-zinc-500/5 px-2 py-1 text-zinc-950 shadow-md backdrop-blur-lg focus:bg-blue-200/20 focus:shadow-blue-400/10 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
            )}
          />
          <div className="pointer-events-none absolute inset-0 z-20 size-full px-[9px] py-[5px]">
            {/* TODO: Only render this if there is no chat history yet. */}
            <TextSlideshow
              className={cn(
                'text-foreground/40 text-sm',
                chatState.chatInput.length !== 0 && 'opacity-0',
              )}
              texts={[
                'Try: Add a new button into the top right corner',
                'Try: Convert these cards into accordions',
                'Try: Add a gradient to the background',
              ]}
            />
          </div>
        </div>
        <Button
          onClick={handleSubmit}
          glassy
          variant="secondary"
          className="!opacity-100 group z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg !disabled:*:opacity-10 hover:bg-rose-600/20"
        >
          <SquareIcon className="size-3 fill-zinc-500 stroke-zinc-500 group-hover:fill-zinc-800 group-hover:stroke-zinc-800" />
        </Button>
        <Button
          disabled={!canSendMessage}
          onClick={handleSubmit}
          glassy
          variant="primary"
          className="!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg !disabled:*:opacity-10"
        >
          <ArrowUpIcon className="size-4 stroke-3" />
        </Button>
      </div>
    </PanelFooter>
  );
}
