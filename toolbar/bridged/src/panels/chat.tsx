import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelFooter,
} from '@/components/ui/panel';
import { CircleQuestionMark } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { useAgentState } from '@/hooks/agent/use-agent-state';
import { useChatState } from '@/hooks/use-chat-state';
import { usePlugins } from '@/hooks/use-plugins';
import { usePanels } from '@/hooks/use-panels';
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
  CopyIcon,
  MousePointerIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContextElementsChips } from '@/components/context-elements-chips';
import { AgentMessageDisplay } from '@/components/agent-message-display';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HotkeyComboText } from '@/components/hotkey-combo-text';
import { HotkeyActions } from '@/utils';
import {
  GradientBackgroundChat,
  type GradientBackgroundVariant,
} from '@/components/ui/gradient-background-chat';
import { TextSlideshow } from '@/components/ui/text-slideshow';
import { useAgentMessaging } from '@/hooks/agent/use-agent-messaging';
import { useAgents } from '@/hooks/agent/use-agent-provider';
import { createPrompt, type PluginContextSnippets } from '@/prompts';
import { collectUserMessageMetadata, getSelectedElementInfo } from '@/utils';
import {
  CursorLogoImg,
  TraeLogoImg,
  WindsurfLogoImg,
  ClineLogoImg,
  RooCodeLogoImg,
  GithubCopilotLogoImg,
  KilocodeLogoImg,
} from '@/components/logos';

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

const getAgentLogo = (name: string, description: string): string | null => {
  const searchText = `${name} ${description}`.toLowerCase();

  if (searchText.includes('cursor')) return CursorLogoImg;
  if (searchText.includes('windsurf')) return WindsurfLogoImg;
  if (searchText.includes('cline')) return ClineLogoImg;
  if (searchText.includes('roo') && searchText.includes('code'))
    return RooCodeLogoImg;
  if (searchText.includes('trae')) return TraeLogoImg;
  if (searchText.includes('kilocode') || searchText.includes('kilo-code'))
    return KilocodeLogoImg;
  if (searchText.includes('github') || searchText.includes('copilot'))
    return GithubCopilotLogoImg;

  return null;
};

export function ChatPanel() {
  const agentState = useAgentState();
  const chatState = useChatState();
  const chatMessaging = useAgentMessaging();
  const [isComposing, setIsComposing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const { connected, availableAgents, connectAgent, disconnectAgent } =
    useAgents();
  const { plugins } = usePlugins();
  const { isInfoOpen, openInfo, closeInfo } = usePanels();

  const enableInputField = useMemo(() => {
    // Always enable input for clipboard mode or when agent is connected and ready
    if (!connected) {
      return true; // Enable for clipboard mode
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
  }, [enableInputField, chatState.chatInput, chatState.isPromptCreationActive]);

  const anyMessageInChat = useMemo(() => {
    return chatMessaging.agentMessage?.contentItems?.length > 0;
  }, [chatMessaging.agentMessage?.contentItems]);

  const handleSubmit = useCallback(() => {
    chatState.sendMessage();
    chatState.stopPromptCreation();
  }, [chatState]);

  const buildFullPrompt = useCallback(async () => {
    // Get metadata for selected elements
    const metadata = collectUserMessageMetadata(
      chatState.domContextElements.map((item) =>
        getSelectedElementInfo(item.element),
      ),
    );

    // Process plugin context snippets
    const pluginProcessingPromises = plugins.map(async (plugin) => {
      const baseUserMessage = {
        id: '',
        createdAt: new Date(),
        contentItems: [{ type: 'text' as const, text: chatState.chatInput }],
        metadata,
        pluginContent: {},
        sentByPlugin: false,
      };

      const handlerResult = await plugin.onPromptSend?.(baseUserMessage);

      if (
        !handlerResult ||
        !handlerResult.contextSnippets ||
        handlerResult.contextSnippets.length === 0
      ) {
        return null;
      }

      const snippetPromises = handlerResult.contextSnippets.map(
        async (snippet) => {
          const resolvedContent =
            typeof snippet.content === 'string'
              ? snippet.content
              : await snippet.content();
          return {
            promptContextName: snippet.promptContextName,
            content: resolvedContent,
          };
        },
      );

      const resolvedSnippets = await Promise.all(snippetPromises);

      if (resolvedSnippets.length > 0) {
        const pluginSnippets: PluginContextSnippets = {
          pluginName: plugin.pluginName,
          contextSnippets: resolvedSnippets,
        };
        return pluginSnippets;
      }
      return null;
    });

    const allPluginContexts = await Promise.all(pluginProcessingPromises);
    const validPluginContexts = allPluginContexts.filter(
      (context): context is PluginContextSnippets => context !== null,
    );

    // Create the full prompt using createPrompt
    const fullPrompt = createPrompt(
      chatState.domContextElements.map((item) => item.element),
      chatState.chatInput,
      metadata.currentUrl || '',
      validPluginContexts,
    );

    return fullPrompt;
  }, [chatState.chatInput, chatState.domContextElements, plugins]);

  const handleCopyToClipboard = useCallback(async () => {
    if (chatState.chatInput.trim()) {
      try {
        // Build the full prompt with metadata
        const fullPrompt = await buildFullPrompt();

        // Copy the full prompt to clipboard
        await navigator.clipboard.writeText(fullPrompt);

        // Clear input and selected elements
        chatState.setChatInput('');
        chatState.stopPromptCreation();

        // Clear any existing timeout
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }

        // Show checkmark for 1 second
        setIsCopied(true);
        copyTimeoutRef.current = setTimeout(() => {
          setIsCopied(false);
          copyTimeoutRef.current = null;
        }, 1000);
      } catch (error) {
        console.error('Failed to copy prompt to clipboard:', error);
      }
    }
  }, [chatState, buildFullPrompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
        e.preventDefault();
        if (!connected) {
          // In clipboard mode, trigger copy to clipboard
          handleCopyToClipboard();
        } else {
          // Connected to agent, send message
          handleSubmit();
        }
      }
    },
    [handleSubmit, handleCopyToClipboard, isComposing, connected],
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
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          'mask-alpha mask-[linear-gradient(to_bottom,transparent_0px,black_48px,black_calc(95%_-_16px),transparent_calc(100%_-_16px))]',
          'overflow-hidden',
        )}
      >
        {/* This are renders the output of the agent as markdown and makes it scrollable if necessary. */}
        <AgentMessageDisplay />
      </PanelContent>
      <PanelFooter
        className={cn(
          'mt-0 flex origin-top flex-col items-stretch gap-1 px-2 pt-1 pb-2 duration-150 ease-out',
          !enableInputField && 'pointer-events-none opacity-80 brightness-75',
          chatState.isPromptCreationActive && 'bg-blue-400/10',
          !anyMessageInChat &&
            agentState.state === AgentStateType.IDLE &&
            'rounded-t-[inherit] border-transparent border-t-none pt-3',
        )}
      >
        <ContextElementsChips />
        <div className="flex flex-col gap-2">
          <div className="relative w-full">
            <Textarea
              ref={inputRef}
              value={chatState.chatInput}
              onChange={(e) => {
                chatState.setChatInput(e.target.value);
              }}
              onFocus={() => {
                if (!chatState.isPromptCreationActive) {
                  chatState.startPromptCreation();
                  chatState.startContextSelector();
                }
              }}
              onKeyDown={handleKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              disabled={!enableInputField}
              className="m-1 h-16 w-full resize-none focus:outline-none"
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
          <div className="flex flex-row items-center justify-end gap-4">
            <div className="mr-auto flex h-8 flex-row items-center pl-2">
              <div
                className="cursor-pointer"
                onClick={() => {
                  if (isInfoOpen) {
                    closeInfo();
                  } else {
                    openInfo();
                  }
                }}
                role="button"
              >
                <CircleQuestionMark className="!text-foreground/60 size-4" />
              </div>
            </div>
            {/* Agent selector */}
            <Select
              onChange={(value) => {
                if (value === 'clipboard') {
                  // Disconnect from any connected agent when clipboard is selected
                  disconnectAgent(true); // Pass true to indicate clipboard mode
                  return;
                }
                const port =
                  typeof value === 'number'
                    ? value
                    : Number.parseInt(String(value));
                if (port && !Number.isNaN(port)) {
                  connectAgent(port);
                }
              }}
              items={[
                {
                  label: 'Clipboard',
                  value: 'clipboard',
                  icon: <CopyIcon className="size-4" />,
                },
                ...availableAgents.map((agent) => {
                  const logo = getAgentLogo(agent.name, agent.description);
                  return {
                    label: `${agent.name} - ${agent.description} - Port ${agent.port}`,
                    value: agent.port,
                    icon: logo ? (
                      <img
                        src={logo}
                        alt={`${agent.name} logo`}
                        className="size-4 object-contain"
                      />
                    ) : null,
                  };
                }),
              ]}
              value={connected?.port || 'clipboard'}
              placeholder="Select destination..."
              className="h-8 w-max max-w-48 gap-4 border-none bg-transparent shadow-none hover:bg-blue-400/10 hover:shadow-none"
            />

            {/* Buttons grouped on the right */}
            <div className="flex shrink-0 flex-row gap-2">
              {/* Context selector button - shown when prompt creation is active */}
              {chatState.isPromptCreationActive && (
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      onMouseDown={(e) => {
                        // Prevent default to avoid losing focus from input
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (chatState.isContextSelectorActive) {
                          chatState.stopContextSelector();
                        } else {
                          chatState.startContextSelector();
                        }
                        // Keep input focused
                        inputRef.current?.focus();
                      }}
                      aria-label="Select context elements"
                      variant="ghost"
                      className={cn(
                        'size-8 cursor-pointer rounded-full border-none bg-transparent p-1 backdrop-blur-lg',
                        chatState.isContextSelectorActive
                          ? 'bg-blue-600/10 text-blue-600'
                          : 'text-zinc-500 opacity-70',
                      )}
                    >
                      <MousePointerIcon className={'size-4'} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {chatState.isContextSelectorActive ? (
                      <>
                        Stop selecting elements (
                        <HotkeyComboText action={HotkeyActions.ESC} />)
                      </>
                    ) : (
                      <>
                        Add reference elements (
                        <HotkeyComboText
                          action={HotkeyActions.CTRL_ALT_PERIOD}
                        />
                        )
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              )}
              {!connected && (
                <Button
                  disabled={!chatState.chatInput.trim() && !isCopied}
                  onClick={handleCopyToClipboard}
                  glassy
                  variant="primary"
                  className="size-8 cursor-pointer rounded-full p-1"
                >
                  {isCopied ? (
                    <CheckIcon className="size-4 stroke-green-600" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
              )}
              {connected && (
                <Button
                  disabled={!canSendMessage}
                  onClick={handleSubmit}
                  glassy
                  variant="primary"
                  className="size-8 cursor-pointer rounded-full p-1"
                >
                  <ArrowUpIcon className="size-4 stroke-3" />
                </Button>
              )}
            </div>
          </div>
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
