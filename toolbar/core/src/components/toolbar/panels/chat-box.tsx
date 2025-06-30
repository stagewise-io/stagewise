import { useChatState } from '@/hooks/use-chat-state';
import { useHotkeyListenerComboText } from '@/hooks/use-hotkey-listener-combo-text';
import { cn, HotkeyActions } from '@/utils';
import { Button, Textarea } from '@headlessui/react';
import { SendIcon, CopyIcon, CheckIcon } from 'lucide-react';
import { createPrompt, type PluginContextSnippets } from '@/prompts';
import { usePlugins } from '@/hooks/use-plugins';
import {
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useState,
} from 'preact/hooks';

export function ToolbarChatArea() {
  const chatState = useChatState();
  const [isComposing, setIsComposing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const { plugins } = usePlugins();
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentChat = useMemo(
    () => chatState.chats.find((c) => c.id === chatState.currentChatId),
    [chatState.chats, chatState.currentChatId],
  );

  const currentInput = useMemo(
    () => currentChat?.inputValue || '',
    [currentChat?.inputValue],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      chatState.setChatInput(chatState.currentChatId, value);
    },
    [chatState.setChatInput, chatState.currentChatId],
  );

  const handleSubmit = useCallback(() => {
    if (!currentChat || !currentInput.trim()) return;
    chatState.addMessage(currentChat.id, currentInput);
  }, [currentChat, currentInput, chatState.addMessage]);

  const handleCopy = useCallback(async () => {
    if (!currentInput.trim()) return;

    try {
      // Collect plugin context snippets
      const pluginContextSnippets: PluginContextSnippets[] = [];

      const pluginProcessingPromises = plugins.map(async (plugin) => {
        const userMessagePayload = {
          id: 'copy-action',
          text: currentInput,
          contextElements:
            currentChat?.domContextElements.map((el) => el.element) || [],
          sentByPlugin: false,
        };

        const handlerResult = await plugin.onPromptSend?.(userMessagePayload);

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

      allPluginContexts.forEach((pluginCtx) => {
        if (pluginCtx) {
          pluginContextSnippets.push(pluginCtx);
        }
      });

      // Create the formatted prompt
      const prompt = createPrompt(
        currentChat?.domContextElements.map((e) => e.element) || [],
        currentInput,
        window.location.href,
        pluginContextSnippets,
      );

      // Copy to clipboard
      await navigator.clipboard.writeText(prompt);
      setIsCopied(true);
      setCopyError(false);

      // Clear any existing timeout
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }

      // Reset after 1.5 seconds
      copyTimeoutRef.current = setTimeout(() => {
        setIsCopied(false);
      }, 1500);
    } catch (error) {
      console.error('Failed to copy prompt:', error);
      setCopyError(true);
      setIsCopied(false);

      // Clear any existing timeout
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }

      // Reset error state after 2 seconds
      copyTimeoutRef.current = setTimeout(() => {
        setCopyError(false);
      }, 2000);
    }
  }, [currentInput, currentChat, plugins]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const blurHandler = () => inputRef.current?.focus();

    if (chatState.isPromptCreationActive) {
      inputRef.current?.focus();
      inputRef.current?.addEventListener('blur', blurHandler);
    } else {
      inputRef.current?.blur();
    }

    return () => {
      inputRef.current?.removeEventListener('blur', blurHandler);
    };
  }, [chatState.isPromptCreationActive]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const baseButtonClassName =
    'flex size-8 items-center justify-center rounded-full bg-transparent p-1 text-zinc-950 opacity-20 transition-all duration-150';

  const disabledButtonClassName =
    'cursor-not-allowed bg-zinc-300 text-zinc-500 opacity-30';

  const buttonClassName = useMemo(
    () =>
      cn(
        baseButtonClassName,
        currentInput.length > 0 && 'bg-blue-600 text-white opacity-100',
        chatState.promptState === 'loading' && disabledButtonClassName,
      ),
    [currentInput.length, chatState.promptState],
  );

  const copyButtonClassName = useMemo(
    () =>
      cn(
        baseButtonClassName,
        currentInput.length > 0 &&
          'bg-zinc-600 text-white opacity-100 hover:bg-zinc-700',
        isCopied && 'bg-green-600 text-white opacity-100',
        copyError && 'bg-red-600 text-white opacity-100',
        chatState.promptState === 'loading' && disabledButtonClassName,
      ),
    [currentInput.length, chatState.promptState, isCopied, copyError],
  );

  const textareaClassName = useMemo(
    () =>
      cn(
        'h-full w-full flex-1 resize-none bg-transparent text-zinc-950 transition-all duration-150 placeholder:text-zinc-950/50 focus:outline-none',
        chatState.promptState === 'loading' &&
          'text-zinc-500 placeholder:text-zinc-400',
      ),
    [chatState.promptState],
  );

  // Container styles based on prompt state
  const containerClassName = useMemo(() => {
    const baseClasses =
      'flex h-24 w-full flex-1 flex-row items-end gap-1 rounded-2xl p-4 text-sm text-zinc-950 shadow-md backdrop-blur transition-all duration-150 placeholder:text-zinc-950/70';

    switch (chatState.promptState) {
      case 'loading':
        return cn(
          baseClasses,
          'border-2 border-transparent bg-zinc-50/80',
          'chat-loading-gradient',
        );
      case 'success':
        return cn(
          baseClasses,
          'border-2 border-transparent bg-zinc-50/80',
          'chat-success-border',
        );
      case 'error':
        return cn(
          baseClasses,
          'border-2 border-transparent bg-zinc-50/80',
          'chat-error-border animate-shake',
        );
      default:
        return cn(baseClasses, 'border border-border/30 bg-zinc-50/80');
    }
  }, [chatState.promptState]);

  const ctrlAltCText = useHotkeyListenerComboText(HotkeyActions.CTRL_ALT_C);

  return (
    <div
      className={containerClassName}
      onClick={() => chatState.startPromptCreation()}
      role="button"
      tabIndex={0}
    >
      <Textarea
        ref={inputRef}
        className={textareaClassName}
        value={currentInput}
        onChange={(e) => handleInputChange(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder={
          chatState.isPromptCreationActive
            ? chatState.promptState === 'loading'
              ? 'Processing...'
              : 'Enter prompt...'
            : `What do you want to change? (${ctrlAltCText})`
        }
        disabled={chatState.promptState === 'loading'}
      />
      <Button
        className={copyButtonClassName}
        disabled={
          currentInput.length === 0 || chatState.promptState === 'loading'
        }
        onClick={handleCopy}
        title="Copy prompt to clipboard"
        aria-label={
          copyError
            ? 'Failed to copy prompt'
            : isCopied
              ? 'Prompt copied'
              : 'Copy prompt to clipboard'
        }
      >
        {isCopied ? (
          <CheckIcon className="size-4" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </Button>
      <Button
        className={buttonClassName}
        disabled={
          currentInput.length === 0 || chatState.promptState === 'loading'
        }
        onClick={handleSubmit}
      >
        <SendIcon className="size-4" />
      </Button>
    </div>
  );
}
