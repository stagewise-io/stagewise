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
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContextElementsChips } from '@/components/context-elements-chips';
import { AgentMessageDisplay } from '@/components/agent-message-display';
import {
  GradientBackgroundChat,
  type GradientBackgroundVariant,
} from '@/components/ui/gradient-background-chat';
import { TextSlideshow } from '@/components/ui/text-slideshow';
import { useAgentMessaging } from '@/hooks/agent/use-agent-messaging';
import { useAgents } from '@/hooks/agent/use-agent-provider';

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

export function ChatPanel() {
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
          'mb-0 origin-bottom transition-all duration-300 ease-out',
          agentState.state !== AgentStateType.IDLE
            ? '!h-[calc-size(auto,size)] h-auto'
            : 'h-0 scale-x-75 scale-y-0 p-0 opacity-0 blur-md',
        )}
        title={
          <span className="text-base">
            {agentStateToText[agentState.state]}
          </span>
        }
        description={
          agentState.description && (
            <span className="text-sm">{agentState.description}</span>
          )
        }
        iconArea={
          <div className="flex size-8 items-center justify-center">
            {Object.values(AgentStateType).map((state) => (
              <StateIcon key={state} shouldRender={agentState.state === state}>
                {agentStateToIcon[state]}
              </StateIcon>
            ))}
          </div>
        }
        actionArea={
          <>
            <div className="-z-10 pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-50">
              <GradientBackgroundChat
                className="size-full"
                currentVariant={agentState.state}
                variants={GradientBackgroundVariants}
                transparent={agentState.state === AgentStateType.IDLE}
              />
            </div>
            {/* This area can be used to clean chats, etc. But this will come later...
            <div className="flex flex-row-reverse gap-1">
              <Button
                variant="secondary"
                glassy
                className="size-8 rounded-full p-1"
              >
                <BrushCleaningIcon className="size-4" />
              </Button>
              <Button
                variant="secondary"
                glassy
                className="size-8 rounded-full p-1"
              >
                <ListIcon className="size-4" />
              </Button>
            </div>
            */}
          </>
        }
      />
      <PanelContent
        className={cn(
          'flex basis-[initial] flex-col gap-0 px-1 py-0',
          anyMessageInChat ? '!h-[calc-size(auto,size)] h-auto flex-1' : 'h-0',
          agentState.state === AgentStateType.IDLE
            ? 'rounded-t-[inherit]'
            : 'rounded-t-none',
          'mask-alpha mask-[linear-gradient(to_bottom,transparent_0%,black_5%,black_95%,transparent_100%)]',
          'overflow-hidden',
        )}
      >
        {/* This are renders the output of the agent as markdown and makes it scrollable if necessary. */}
        <AgentMessageDisplay />
      </PanelContent>
      <PanelFooter
        className={cn(
          'mt-0 flex origin-top flex-col items-stretch gap-0 px-2 pt-1 pb-2 duration-150 ease-out',
          !enableInputField && 'pointer-events-none opacity-80 brightness-75',
          chatState.isPromptCreationActive && 'bg-blue-400/10',
          anyMessageInChat ? 'h-24' : 'h-36',
          !anyMessageInChat &&
            agentState.state === AgentStateType.IDLE &&
            'rounded-t-[inherit] border-transparent border-t-none pt-3 pl-3',
        )}
      >
        <ContextElementsChips />
        <div className="flex flex-1 flex-row items-end justify-between gap-2">
          <div className="h-full flex-1">
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
              className="m-1 h-full w-full resize-none focus:outline-none"
            />
            <div className="pointer-events-none absolute inset-0 z-10 p-1">
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
            disabled={!canSendMessage}
            onClick={handleSubmit}
            glassy
            variant="primary"
            className="size-8 cursor-pointer rounded-full p-1"
          >
            <ArrowUpIcon className="size-4 stroke-3" />
          </Button>
        </div>
      </PanelFooter>
    </Panel>
  );
}

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
