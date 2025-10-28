import { ContextElementsChipsFlexible } from '@/components/context-elements-chips-flexible';
import { FileAttachmentChips } from '@/components/file-attachment-chips';
import { TextSlideshow } from '@/components/ui/text-slideshow';
import { Button } from '@stagewise/stage-ui/components/button';
import { useChatState } from '@/hooks/use-chat-state';
import { cn, HotkeyActions } from '@/utils';
import {
  ArrowUpIcon,
  SquareIcon,
  SquareDashedMousePointerIcon,
  PaperclipIcon,
  ImageUpIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState, useEffect } from 'react';
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
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '@stagewise/stage-ui/components/menu';
import { Layout, MainTab } from '@stagewise/karton-contract';

const GlassyTextInputClassNames =
  'origin-center rounded-xl border border-black/10 ring-1 ring-white/20 transition-all duration-150 ease-out after:absolute after:inset-0 after:size-full after:content-normal after:rounded-[inherit] after:bg-gradient-to-b after:from-white/5 after:to-white/0 after:transition-colors after:duration-150 after:ease-out disabled:pointer-events-none disabled:bg-black/5 disabled:text-foreground/60 disabled:opacity-30';

const chatTextSlideshowTexts: Record<MainTab | 'fallback', string[]> = {
  [MainTab.DEV_APP_PREVIEW]: [
    'Try: Add a new button into the top right corner',
    'Try: Convert these cards into accordions',
    'Try: Add a gradient to the background',
  ],
  [MainTab.IDEATION_CANVAS]: [
    'Try: Build a new prototype button',
    'Try: Build a form field with my design system',
  ],
  [MainTab.SETTINGS]: ['Ask stage any question...'],
  fallback: ['Ask stage any question...'],
};
export function ChatPanelFooter({
  ref,
  inputRef,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
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

  const abortAgent = useCallback(() => {
    stopAgent();
  }, [stopAgent]);

  const activeChat = useMemo(() => {
    return activeChatId && chats ? chats[activeChatId] : null;
  }, [activeChatId, chats]);

  const [isComposing, setIsComposing] = useState(false);

  const enableInputField = useMemo(() => {
    // Disable input if agent is not connected
    if (!isConnected) {
      return false;
    }
    return !isWorking;
  }, [isWorking, isConnected]);

  const canSendMessage = useMemo(() => {
    return enableInputField && chatState.chatInput.trim().length > 2;
  }, [enableInputField, chatState]);

  const handleSubmit = useCallback(() => {
    if (canSendMessage) {
      chatState.sendMessage();
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

  return (
    <footer
      className="absolute right-0 bottom-0 left-0 z-10 flex flex-col items-stretch gap-1 p-0 pt-2"
      ref={ref}
    >
      <div
        className="glass-body flex flex-row items-stretch gap-1 rounded-xl bg-background/20 p-2 before:absolute before:inset-0 before:rounded-xl data-[chat-active=true]:shadow-blue-600/20 data-[chat-active=true]:before:bg-blue-500/5"
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
                'scrollbar-thin scrollbar-thumb-black/20 scrollbar-track-transparent z-10 h-28 w-full resize-none border-none bg-transparent px-2 py-1 text-foreground outline-none ring-0 transition-all duration-300 ease-out placeholder:text-muted-foreground focus:outline-none disabled:bg-transparent',
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
            <FileAttachmentChips
              fileAttachments={chatState.fileAttachments}
              removeFileAttachment={chatState.removeFileAttachment}
            />
            <ContextElementsChipsFlexible
              domContextElements={chatState.domContextElements}
              removeChatDomContext={chatState.removeChatDomContext}
            />
            {chatState.fileAttachments.length +
              chatState.domContextElements.length >
              1 && (
              <Button
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  chatState.clearFileAttachments();
                  chatState.domContextElements.forEach((element) => {
                    chatState.removeChatDomContext(element.element);
                  });
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
                  className="!opacity-100 group z-10 size-8 cursor-pointer rounded-full bg-rose-100/60 p-1 shadow-md backdrop-blur-lg !disabled:*:opacity-10 dark:bg-rose-900/60"
                >
                  <SquareIcon className="size-3.5 fill-current text-rose-600" />
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
              <Menu
                onOpenChangeComplete={(open) => {
                  if (!open && chatInputActive) {
                    void inputRef.current?.focus();
                  }
                }}
              >
                <Tooltip>
                  <TooltipTrigger>
                    <MenuTrigger>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Add additional attachments"
                        className="mb-1 text-muted-foreground"
                      >
                        <PaperclipIcon className="size-4" />
                      </Button>
                    </MenuTrigger>
                  </TooltipTrigger>

                  <TooltipContent>Add additional attachments</TooltipContent>
                </Tooltip>
                <MenuContent
                  id="chat-file-attachment-menu-content"
                  side="right"
                >
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/png, image/jpeg, image/gif, image/webp"
                    id="chat-file-attachment-input-file"
                  />
                  <MenuItem
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
                        });
                      };
                    }}
                  >
                    <ImageUpIcon className="size-4" />
                    Upload image
                  </MenuItem>
                </MenuContent>
              </Menu>
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
