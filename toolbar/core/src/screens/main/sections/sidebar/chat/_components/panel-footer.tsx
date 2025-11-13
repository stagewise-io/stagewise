import { ContextElementsChipsFlexible } from '@/components/context-elements-chips-flexible';
import { FileAttachmentChips } from '@/components/file-attachment-chips';
import { TextSlideshow } from '@/components/ui/text-slideshow';
import { ContextUsageRing } from './context-usage-ring';
import { Button } from '@stagewise/stage-ui/components/button';
import { useChatState } from '@/hooks/use-chat-state';
import { cn, HotkeyActions } from '@/utils';
import {
  ArrowUpIcon,
  SquareIcon,
  SquareDashedMousePointerIcon,
  ImageUpIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  useKartonState,
  useKartonProcedure,
  useKartonConnected,
  useComparingSelector,
} from '@/hooks/use-karton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { HotkeyComboText } from '@/components/hotkey-combo-text';
import { useHotKeyListener } from '@/hooks/use-hotkey-listener';
import { Layout, MainTab } from '@stagewise/karton-contract';
import { useEventListener } from '@/hooks/use-event-listener';
import { usePostHog } from 'posthog-js/react';

const GlassyTextInputClassNames =
  'origin-center rounded-xl border border-black/10 ring-1 ring-white/20 transition-all duration-150 ease-out after:absolute after:inset-0 after:size-full after:content-normal after:rounded-[inherit] after:bg-gradient-to-b after:from-white/5 after:to-white/0 after:transition-colors after:duration-150 after:ease-out disabled:pointer-events-none disabled:bg-black/5 disabled:text-foreground/60 disabled:opacity-30';

const chatTextSlideshowTexts: Record<MainTab | 'fallback', string[]> = {
  [MainTab.DEV_APP_PREVIEW]: [
    'Try: Turn this card into a reusable component',
    'Try: Do they have the same border radius?',
    'Try: Make this badge use our design system',
    'Try: Does this card use a reusable component?',
    'Try: Show me where this header is implemented',
    "Try: Let's try a different icon for this button",
    'Try: Make the press animation of the component more subtle',
  ],
  [MainTab.IDEATION_CANVAS]: ['Try: Build a form field with my design system'],
  [MainTab.SETTINGS]: ['Ask stage any question...'],
  fallback: ['Ask stage any question...'],
};
export function ChatPanelFooter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openTab = useKartonState((s) =>
    s.userExperience.activeLayout === Layout.MAIN
      ? s.userExperience.activeMainTab
      : null,
  );
  const chatState = useChatState();
  const { isWorking, activeChatId, chats } = useKartonState(
    useComparingSelector((s) => ({
      activeChatId: s.workspace?.agentChat?.activeChatId,
      isWorking: s.workspace?.agentChat?.isWorking,
      chats: s.workspace?.agentChat?.chats,
    })),
  );
  const stopAgent = useKartonProcedure((p) => p.agentChat.abortAgentCall);
  const canStop = isWorking;
  const isConnected = useKartonConnected();
  const posthog = usePostHog();

  const abortAgent = useCallback(() => {
    stopAgent();
  }, [stopAgent]);

  const activeChat = useMemo(() => {
    return activeChatId && chats ? chats[activeChatId] : null;
  }, [activeChatId, chats]);

  const [isComposing, setIsComposing] = useState(false);

  const isVerboseMode = useKartonState((s) => s.appInfo.verbose);

  const enableInputField = useMemo(() => {
    // Disable input if agent is not connected
    if (!isConnected) return false;

    return !isWorking;
  }, [isWorking, isConnected]);

  const canSendMessage = useMemo(() => {
    return enableInputField && chatState.chatInput.trim().length > 2;
  }, [enableInputField, chatState]);

  const handleSubmit = useCallback(() => {
    if (canSendMessage) {
      chatState.sendMessage();
      chatState.stopContextSelector();
      setChatInputActive(false);
      // stopPromptCreation is already called in sendMessage
    }
  }, [chatState, canSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, isComposing],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.items;
      const files: File[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        // Prevent default paste for files
        e.preventDefault();
        files.forEach((file) => {
          chatState.addFileAttachment(file);
          posthog.capture('agent-file-uploaded', {
            file_type: file.type,
            method: 'chat-paste',
          });
        });

        // Start prompt creation if not already active
        inputRef.current?.focus();
      }
    },
    [chatState],
  );

  const handleCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false);
  }, []);

  const contextUsed = useMemo(() => {
    const used = activeChat?.usage.usedContextWindowSize ?? 0;
    const max = activeChat?.usage.maxContextWindowSize ?? 1;
    return Math.min(100, Math.round((used / max) * 100));
  }, [
    activeChat?.usage.usedContextWindowSize,
    activeChat?.usage.maxContextWindowSize,
  ]);

  const showTextSlideshow = useMemo(() => {
    return (
      (activeChat?.messages.length ?? 0) === 0 &&
      chatState.chatInput.length === 0
    );
  }, [activeChat?.messages.length, chatState.chatInput]);

  const [chatInputActive, setChatInputActive] = useState<boolean>(false);

  useEffect(() => {
    if (chatInputActive) {
      void inputRef.current?.focus();
      chatState.startContextSelector();
    } else {
      chatState.stopContextSelector();
      void inputRef.current?.blur();
    }
  }, [chatInputActive]);

  const onInputFocus = useCallback(() => {
    if (!chatInputActive) {
      setChatInputActive(true);
    }
  }, [chatInputActive]);

  const onInputBlur = useCallback(
    (ev: React.FocusEvent<HTMLTextAreaElement, Element>) => {
      // We should only allow chat blur if the user clicked outside the chat box or the context selector element tree. Otherwise, we should keep the input active by refocusing it.
      const target = ev.relatedTarget as HTMLElement;
      if (target?.closest('#chat-file-attachment-menu-content')) {
        return true;
      }
      if (
        !target ||
        (!target.closest('#chat-input-container-box') &&
          !target.closest('#context-selector-element-canvas'))
      ) {
        setChatInputActive(false);
      } else if (chatInputActive) {
        void inputRef.current?.focus();
      }
    },
    [chatInputActive],
  );

  useHotKeyListener(
    useCallback(() => {
      setChatInputActive(true);
      chatState.startContextSelector();
      return true;
    }, [chatState]),
    HotkeyActions.CTRL_ALT_PERIOD,
  );
  useHotKeyListener(
    useCallback(() => {
      if (chatState.isContextSelectorActive) {
        chatState.stopContextSelector();
      } else {
        setChatInputActive(false);
      }
      return true;
    }, [chatState]),
    HotkeyActions.ESC,
  );

  useEffect(() => {
    if (chatInputActive) {
      window.dispatchEvent(new Event('sidebar-chat-panel-focussed'));
    }
  }, [chatInputActive]);

  useEventListener('sidebar-chat-panel-closed', () => {
    setChatInputActive(false);
  });

  useEventListener('sidebar-chat-panel-opened', () => {
    setChatInputActive(true);
  });

  return (
    <footer className="z-10 flex flex-col items-stretch gap-1 p-0">
      <div
        className="glass-body glass-body-interactive flex flex-row items-stretch gap-1 rounded-xl rounded-t-lg bg-background/20 p-2 shadow shadow-black/5 before:absolute before:inset-0 before:rounded-xl data-[chat-active=true]:bg-primary/5 data-[chat-active=true]:shadow-lg data-[chat-active=true]:shadow-primary/10"
        id="chat-input-container-box"
        data-chat-active={chatInputActive}
      >
        <div className="flex flex-1 flex-col items-stretch gap-1">
          {/* Text input area */}
          <div className="relative flex flex-1 pr-1">
            <textarea
              ref={inputRef}
              value={chatState.chatInput}
              onChange={(e) => {
                chatState.setChatInput(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              disabled={!enableInputField}
              className={cn(
                GlassyTextInputClassNames,
                'scrollbar-thin scrollbar-thumb-foreground/20 scrollbar-track-transparent z-10 h-28 w-full resize-none border-none bg-transparent px-2 py-1 text-foreground text-sm outline-none ring-0 transition-all duration-300 ease-out placeholder:text-muted-foreground focus:outline-none disabled:bg-transparent',
              )}
              placeholder={!showTextSlideshow ? 'Type a message...' : undefined}
            />
            <div className="pointer-events-none absolute inset-0 z-20 size-full px-[9px] py-[5px]">
              {/* TODO: Only render this if there is no chat history yet. */}
              <TextSlideshow
                className={cn(
                  'text-muted-foreground text-sm',
                  !showTextSlideshow && 'opacity-0',
                )}
                texts={chatTextSlideshowTexts[openTab ?? 'fallback']}
              />
            </div>
          </div>

          {/* Other attachments area */}
          <div className="flex flex-row flex-wrap items-center justify-start gap-1 *:shrink-0">
            {activeChat && (isVerboseMode || contextUsed > 80) && (
              <ContextUsageRing
                percentage={contextUsed}
                usedKb={activeChat.usage.usedContextWindowSize}
                maxKb={activeChat.usage.maxContextWindowSize}
              />
            )}
            <FileAttachmentChips
              fileAttachments={chatState.fileAttachments}
              removeFileAttachment={chatState.removeFileAttachment}
            />
            <ContextElementsChipsFlexible
              selectedElements={chatState.selectedElements}
              removeSelectedElement={chatState.removeSelectedElement}
            />
            {chatState.fileAttachments.length +
              chatState.selectedElements.length >
              1 && (
              <Button
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  chatState.clearFileAttachments();
                  chatState.clearSelectedElements();
                }}
              >
                Clear all
              </Button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center justify-end gap-1">
          {canStop && (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  onClick={abortAgent}
                  aria-label="Stop agent"
                  variant={'secondary'}
                  className="!opacity-100 group z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg !disabled:*:opacity-10"
                >
                  <SquareIcon className="size-3.5 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop agent</TooltipContent>
            </Tooltip>
          )}
          {!canStop && (
            <>
              {openTab === MainTab.DEV_APP_PREVIEW && (
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground data-[context-selector-active=true]:bg-primary/5 data-[context-selector-active=true]:text-primary data-[context-selector-active=true]:hover:bg-primary/10"
                      data-context-selector-active={
                        chatState.isContextSelectorActive
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (chatState.isContextSelectorActive) {
                          chatState.stopContextSelector();
                        } else {
                          setChatInputActive(true);
                          chatState.startContextSelector();
                        }
                      }}
                      aria-label="Select context elements"
                    >
                      <SquareDashedMousePointerIcon className="size-3.5 stroke-[2.5px]" />
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
              <input
                type="file"
                multiple
                className="hidden"
                accept="image/png, image/jpeg, image/gif, image/webp"
                id="chat-file-attachment-input-file"
              />
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Upload image"
                    className="mb-1 text-muted-foreground"
                    onClick={() => {
                      const input = document.getElementById(
                        'chat-file-attachment-input-file',
                      ) as HTMLInputElement;
                      input.value = '';
                      input.click();
                      input.onchange = (e) => {
                        Array.from(
                          (e.target as HTMLInputElement).files ?? [],
                        ).forEach((file) => {
                          chatState.addFileAttachment(file);
                          posthog.capture('agent-file-uploaded', {
                            file_type: file.type,
                            method: 'chat-file-attachment-menu',
                          });
                        });
                      };
                    }}
                  >
                    <ImageUpIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload image</TooltipContent>
              </Tooltip>
            </>
          )}
          <Tooltip>
            <TooltipTrigger>
              <Button
                disabled={!canSendMessage || !chatInputActive}
                onClick={handleSubmit}
                aria-label="Send message"
                variant={chatInputActive ? 'primary' : 'secondary'}
                className="z-10 size-8 cursor-pointer rounded-full p-1 shadow-md backdrop-blur-lg transition-all"
              >
                <ArrowUpIcon className="size-4 stroke-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </footer>
  );
}
