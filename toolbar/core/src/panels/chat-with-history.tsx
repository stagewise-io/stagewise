import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelFooter,
} from '@/components/ui/panel';
import { useAgentState } from '@/hooks/agent/use-agent-state';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { Textarea } from '@headlessui/react';
import { Button } from '@/components/ui/button';
import { AgentStateType } from '@stagewise/agent-interface/toolbar';
import {
  Loader2Icon,
  MessageCircleQuestionIcon,
  XCircleIcon,
  CheckIcon,
  CogIcon,
  ArrowUpIcon,
  PlusIcon,
  ListFilterIcon,
  SquareIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContextElementsChips } from '@/components/context-elements-chips';
import {
  GradientBackgroundChat,
  type GradientBackgroundVariant,
} from '@/components/ui/gradient-background-chat';
import { TextSlideshow } from '@/components/ui/text-slideshow';
import { useAgentMessaging } from '@/hooks/agent/use-agent-messaging';
import { useAgents } from '@/hooks/agent/use-agent-provider';
import { ChatHistory } from './chat-with-history/chat-history';
import { ChatList } from './chat-with-history/chat-list';

const agentStateToText: Record<AgentStateType, string> = {
  [AgentStateType.WAITING_FOR_USER_RESPONSE]: 'Waiting for user response',
  [AgentStateType.IDLE]: '',
  [AgentStateType.THINKING]: 'Thinking',
  [AgentStateType.FAILED]: 'Failed',
  [AgentStateType.COMPLETED]: 'Completed',
  [AgentStateType.WORKING]: 'Working',
  [AgentStateType.CALLING_TOOL]: 'Calling tool',
};

const agentStateToIcon: Record<AgentStateType, React.ReactNode> = {
  [AgentStateType.WAITING_FOR_USER_RESPONSE]: (
    <MessageCircleQuestionIcon className="size-6" />
  ),
  [AgentStateType.IDLE]: <></>,
  [AgentStateType.THINKING]: (
    <Loader2Icon className="size-6 animate-spin stroke-violet-600" />
  ),
  [AgentStateType.FAILED]: <XCircleIcon className="size-6 stroke-rose-600" />,
  [AgentStateType.COMPLETED]: <CheckIcon className="size-6 stroke-green-600" />,
  [AgentStateType.WORKING]: (
    <Loader2Icon className="size-6 animate-spin stroke-blue-600" />
  ),
  [AgentStateType.CALLING_TOOL]: (
    <CogIcon className="size-6 animate-spin stroke-fuchsia-700" />
  ),
};

export function ChatWithHistoryPanel() {
  const agentState = useAgentState();
  const chatState = useChatState();
  const chatMessaging = useAgentMessaging();
  const [isComposing, setIsComposing] = useState(false);
  const { connected } = useAgents();

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

  const anyMessageInChat = useMemo(() => {
    return chatMessaging.agentMessage?.contentItems?.length > 0;
  }, [chatMessaging.agentMessage?.contentItems]);

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

  const [chatListOpen, setChatListOpen] = useState(false);

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
      <PanelHeader
        className={cn(
          'pointer-events-none absolute top-px right-px left-px z-20 mb-0 origin-bottom px-3 py-3 pl-4.5 transition-all duration-300 ease-out *:pointer-events-auto',
          chatListOpen
            ? 'h-[calc(100%-2px)] rounded-[inherit] bg-white/60 backdrop-blur-lg'
            : '!h-[calc-size(auto,size)] h-auto',
        )}
        title={chatListOpen && <span className="mt-0.5">Chats</span>}
        description={
          agentState.description && (
            <span className="text-sm">{agentState.description}</span>
          )
        }
        clear
        actionArea={
          <>
            {
              <div className="flex flex-row-reverse gap-1">
                <Button
                  variant="secondary"
                  glassy
                  className="!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg !disabled:*:opacity-10 hover:bg-white/60 active:bg-zinc-50/60"
                  onClick={() => setChatListOpen(!chatListOpen)}
                >
                  {chatListOpen ? (
                    <XIcon className="size-4 stroke-2" />
                  ) : (
                    <ListFilterIcon className="size-4 stroke-2" />
                  )}
                </Button>
                <Button
                  variant="secondary"
                  glassy
                  className={cn(
                    '!opacity-100 z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg transition-all duration-150 ease-out !disabled:*:opacity-10 hover:bg-white/60 active:bg-zinc-50/60',
                    chatListOpen && 'w-fit px-2.5',
                  )}
                >
                  {chatListOpen && <span className="mr-1">New chat</span>}
                  <PlusIcon className="size-4 stroke-2" />
                </Button>
              </div>
            }
            {chatListOpen && (
              <div className="mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_16px,black_calc(100%-16px),transparent_100%)] scrollbar-thin absolute top-16 right-4 bottom-4 left-4 overflow-hidden overflow-y-auto rounded-md py-4">
                <ChatList />
              </div>
            )}
          </>
        }
      />
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
    </Panel>
  );
}

const GlassyTextInputClassNames =
  'origin-center rounded-xl border border-black/10 ring-1 ring-white/20 transition-all duration-150 ease-out after:absolute after:inset-0 after:size-full after:content-normal after:rounded-[inherit] after:bg-gradient-to-b after:from-white/5 after:to-white/0 after:transition-colors after:duration-150 after:ease-out disabled:pointer-events-none disabled:bg-black/5 disabled:text-foreground/60 disabled:opacity-30';

const StateIcon = ({
  children,
  shouldRender,
}: {
  children: React.ReactNode;
  shouldRender: boolean;
}) => {
  return (
    <div
      className={cn(
        'absolute origin-center transition-all duration-500 ease-spring-soft',
        shouldRender ? 'scale-100' : 'scale-0 opacity-0 blur-md',
      )}
    >
      {children}
    </div>
  );
};

const GradientBackgroundVariants: Record<
  AgentStateType,
  GradientBackgroundVariant
> = {
  [AgentStateType.WAITING_FOR_USER_RESPONSE]: {
    activeSpeed: 'slow',
    backgroundColor: 'var(--color-blue-200)',
    colors: [
      'var(--color-blue-200)',
      'var(--color-indigo-400)',
      'var(--color-sky-100)',
      'var(--color-cyan-200)',
    ],
  },
  [AgentStateType.IDLE]: {
    activeSpeed: 'slow',
    backgroundColor: 'var(--color-white/0)',
    colors: [
      'var(--color-white/0)',
      'var(--color-white/0)',
      'var(--color-white/0)',
      'var(--color-white/0)',
    ],
  },
  [AgentStateType.THINKING]: {
    activeSpeed: 'medium',
    backgroundColor: 'var(--color-blue-400)',
    colors: [
      'var(--color-orange-300)',
      'var(--color-teal-300)',
      'var(--color-fuchsia-400)',
      'var(--color-indigo-200)',
    ],
  },
  [AgentStateType.WORKING]: {
    activeSpeed: 'medium',
    backgroundColor: 'var(--color-indigo-400)',
    colors: [
      'var(--color-sky-300)',
      'var(--color-teal-500)',
      'var(--color-violet-400)',
      'var(--color-indigo-200)',
    ],
  },
  [AgentStateType.CALLING_TOOL]: {
    activeSpeed: 'fast',
    backgroundColor: 'var(--color-fuchsia-400)',
    colors: [
      'var(--color-fuchsia-400)',
      'var(--color-violet-400)',
      'var(--color-indigo-500)',
      'var(--color-purple-200)',
    ],
  },
  [AgentStateType.FAILED]: {
    activeSpeed: 'slow',
    backgroundColor: 'var(--color-red-200)',
    colors: [
      'var(--color-red-100)',
      'var(--color-rose-300)',
      'var(--color-fuchsia-400)',
      'var(--color-indigo-300)',
    ],
  },
  [AgentStateType.COMPLETED]: {
    activeSpeed: 'slow',
    backgroundColor: 'var(--color-green-400)',
    colors: [
      'var(--color-green-300)',
      'var(--color-teal-400)',
      'var(--color-emerald-500)',
      'var(--color-lime-200)',
    ],
  },
};
