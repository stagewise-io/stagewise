import { ContextElementsChipsFlexible } from '@/components/context-elements-chips-flexible';
import { TextSlideshow } from '@/components/ui/text-slideshow';
import { Button } from '@/components/ui/button';
import { PanelFooter } from '@/components/ui/panel';
import { useAgents } from '@/hooks/agent/use-agent-provider';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { Textarea } from '@headlessui/react';
import { ArrowUpIcon, SquareIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useAgentChat } from '@/hooks/agent/use-agent-chat/index';

const GlassyTextInputClassNames =
  'origin-center rounded-xl border border-black/10 ring-1 ring-white/20 transition-all duration-150 ease-out after:absolute after:inset-0 after:size-full after:content-normal after:rounded-[inherit] after:bg-gradient-to-b after:from-white/5 after:to-white/0 after:transition-colors after:duration-150 after:ease-out disabled:pointer-events-none disabled:bg-black/5 disabled:text-foreground/60 disabled:opacity-30';

export function ChatPanelFooter({
  ref,
}: {
  ref: React.RefObject<HTMLDivElement>;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatState = useChatState();
  const { isWorking, activeChat, stopAgent, canStop } = useAgentChat();
  const { connected } = useAgents();
  const [isComposing, setIsComposing] = useState(false);

  const enableInputField = useMemo(() => {
    // Disable input if agent is not connected
    if (!connected) {
      return false;
    }
    return !isWorking;
  }, [isWorking, connected]);

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

  const showMultiLineTextArea = useMemo(() => {
    // Show a large text area if we have a line break or more than 40 characters.
    return (
      chatState.chatInput.includes('\n') || chatState.chatInput.length > 40
    );
  }, [chatState.chatInput]);

  const showTextSlideshow = useMemo(() => {
    return (
      (activeChat?.messages.length ?? 0) === 0 &&
      chatState.chatInput.length === 0
    );
  }, [activeChat?.messages.length, chatState.chatInput]);

  return (
    <PanelFooter
      clear
      className="absolute right-px bottom-px left-px z-10 flex flex-col items-stretch gap-1 px-3 pt-1 pb-3"
      ref={ref}
    >
      <ContextElementsChipsFlexible
        domContextElements={chatState.domContextElements}
        removeChatDomContext={chatState.removeChatDomContext}
      />
      <div className="flex h-fit flex-1 flex-row items-end justify-between gap-1">
        <div className="relative flex flex-1 pr-1">
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
              'scrollbar-thin scrollbar-thumb-black/20 scrollbar-track-transparent z-10 w-full resize-none rounded-2xl bg-zinc-500/5 px-2 py-1 text-zinc-950 shadow-md backdrop-blur-lg transition-all duration-300 ease-out placeholder:text-foreground/40 focus:bg-blue-200/20 focus:shadow-blue-400/10 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
              showMultiLineTextArea ? 'h-26' : 'h-8',
            )}
            placeholder={!showTextSlideshow && 'Type a message...'}
          />
          <div className="pointer-events-none absolute inset-0 z-20 size-full px-[9px] py-[5px]">
            {/* TODO: Only render this if there is no chat history yet. */}
            <TextSlideshow
              className={cn(
                'text-foreground/40 text-sm',
                !showTextSlideshow && 'opacity-0',
              )}
              texts={[
                'Try: Add a new button into the top right corner',
                'Try: Convert these cards into accordions',
                'Try: Add a gradient to the background',
              ]}
            />
          </div>
        </div>
        {canStop && (
          <Button
            onClick={stopAgent}
            glassy
            variant="secondary"
            className="!opacity-100 group z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg !disabled:*:opacity-10 hover:bg-rose-600/20"
          >
            <SquareIcon className="size-3 fill-zinc-500 stroke-zinc-500 group-hover:fill-zinc-800 group-hover:stroke-zinc-800" />
          </Button>
        )}
        <Button
          disabled={!canSendMessage}
          onClick={handleSubmit}
          glassy
          variant="primary"
          className="!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg disabled:bg-transparent disabled:shadow-none disabled:*:stroke-zinc-500/50"
        >
          <ArrowUpIcon className="size-4 stroke-3" />
        </Button>
      </div>
    </PanelFooter>
  );
}
