import { FileAttachmentChips } from '@/components/file-attachment-chips';
import { IconXmark } from 'nucleo-micro-bold';
import { ContextUsageRing } from './context-usage-ring';
import { ContextElementsChipsFlexible } from '@/components/context-elements-chips-flexible';
import { Button } from '@stagewise/stage-ui/components/button';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { HotkeyActions } from '@shared/hotkeys';
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
  useKartonReconnectState,
  useComparingSelector,
} from '@/hooks/use-karton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { HotkeyComboText } from '@/components/hotkey-combo-text';
import { useHotKeyListener } from '@/hooks/use-hotkey-listener';
import { Layout, MainTab } from '@shared/karton-contracts/ui';
import { useEventListener } from '@/hooks/use-event-listener';
import { usePostHog } from 'posthog-js/react';

const GlassyTextInputClassNames =
  'origin-center rounded-md border border-black/10 ring-1 ring-white/20 transition-all duration-150 ease-out after:absolute after:inset-0 after:size-full after:content-normal after:rounded-[inherit] after:bg-gradient-to-b after:from-white/5 after:to-white/0 after:transition-colors after:duration-150 after:ease-out disabled:pointer-events-none disabled:bg-black/5 disabled:text-foreground/60 disabled:opacity-30';

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
      activeChatId: s.agentChat?.activeChatId,
      isWorking: s.agentChat?.isWorking,
      chats: s.agentChat?.chats,
    })),
  );

  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTab = useMemo(() => {
    return tabs[activeTabId];
  }, [tabs, activeTabId]);

  const workspaceStatus = useKartonState((s) => s.workspaceStatus);

  const focusChatHotkeyText = HotkeyComboText({ action: HotkeyActions.CTRL_I });

  const contextSelectionActive = useKartonState(
    (s) => s.browser.contextSelectionMode,
  );
  const setContextSelectionActive = useKartonProcedure(
    (p) => p.browser.contextSelection.setActive,
  );
  const clearContextElements = useKartonProcedure(
    (p) => p.browser.contextSelection.clearElements,
  );

  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );

  const stopAgent = useKartonProcedure((p) => p.agentChat.abortAgentCall);
  const canStop = isWorking;
  const isConnected = useKartonConnected();
  const reconnectState = useKartonReconnectState();
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
    // Disable input if agent is not connected or reconnecting
    if (!isConnected || reconnectState.isReconnecting) return false;

    return !isWorking;
  }, [isWorking, isConnected, reconnectState.isReconnecting]);

  const canSendMessage = useMemo(() => {
    return enableInputField && chatState.chatInput.trim().length > 2;
  }, [enableInputField, chatState]);

  const hasOpenedStartPage = useMemo(() => {
    return activeTab?.url === 'ui-main';
  }, [activeTab?.url]);

  const createChat = useKartonProcedure((p) => p.agentChat.create);
  const deleteChat = useKartonProcedure((p) => p.agentChat.delete);

  const closeWorkspace = useKartonProcedure((p) => p.workspace.close);

  const closeWorkspaceSetupAndCreateNewChat = useCallback(
    async (setupChatId: string) => {
      await closeWorkspace();
      await createChat();
      void deleteChat(setupChatId);
    },
    [closeWorkspace, createChat, deleteChat],
  );

  const handleSubmit = useCallback(() => {
    if (canSendMessage) {
      chatState.sendMessage();
      setContextSelectionActive(false);
      setChatInputActive(false);
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
          posthog.capture('agent_file_uploaded', {
            file_type: file.type,
            method: 'chat_paste',
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

  const [chatInputActive, setChatInputActive] = useState<boolean>(false);

  useEffect(() => {
    if (chatInputActive) {
      // Wait for the next tick to ensure the input is mounted
      setTimeout(() => {
        void inputRef.current?.focus();
      }, 0);
    } else {
      setContextSelectionActive(false);
      void inputRef.current?.blur();
    }
  }, [chatInputActive]);

  const onInputFocus = useCallback(() => {
    if (!chatInputActive) setChatInputActive(true);
  }, [chatInputActive]);

  const onInputBlur = useCallback(
    async (ev: React.FocusEvent<HTMLTextAreaElement, Element>) => {
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
    useCallback(async () => {
      if (!chatInputActive) {
        window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
        setContextSelectionActive(true); // We trigger this here again because the user might go into context selection mode after already having the input active
        await togglePanelKeyboardFocus('stagewise-ui');
      } else {
        window.dispatchEvent(new Event('sidebar-chat-panel-closed'));
        await togglePanelKeyboardFocus('tab-content');
      }
    }, [chatInputActive, contextSelectionActive, isWorking]),
    HotkeyActions.CTRL_I,
  );

  useEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (contextSelectionActive) setContextSelectionActive(false);
        else setChatInputActive(false);
      }
    },
    {},
    inputRef.current,
  );

  useEffect(() => {
    if (chatInputActive)
      window.dispatchEvent(new Event('sidebar-chat-panel-focused'));
  }, [chatInputActive]);

  useEventListener('sidebar-chat-panel-closed', () => {
    setChatInputActive(false);
    setContextSelectionActive(false);
  });

  useEventListener('sidebar-chat-panel-opened', () => {
    if (!isWorking) {
      setChatInputActive(true);
      setContextSelectionActive(true);
    }
  });

  return (
    <footer className="relative z-20 flex flex-col items-stretch gap-1 p-0">
      <div
        className="flex flex-row items-stretch gap-1 rounded-md bg-background p-2 shadow-[0_0_6px_0_rgba(0,0,0,0.04)] ring-1 ring-muted-foreground/15 before:absolute before:inset-0 before:rounded-lg data-[chat-active=true]:bg-primary/1 data-[chat-active=true]:shadow-lg data-[chat-active=true]:shadow-primary/10"
        id="chat-input-container-box"
        data-chat-active={chatInputActive}
      >
        <div className="flex flex-1 flex-col items-stretch gap-1">
          {/* Text input area */}
          <div className="relative flex pr-1">
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
                'scrollbar-subtle z-10 h-28 w-full resize-none border-none bg-transparent px-2 py-1 text-foreground text-sm outline-none ring-0 transition-all duration-300 ease-out focus:outline-none disabled:bg-transparent',
              )}
            />
            {chatState.chatInput.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-20 size-full px-[9px] py-[2px]">
                <span className="text-muted-foreground text-sm">
                  Ask anything about this page{' '}
                </span>
                <span className="text-muted-foreground/60 text-sm">
                  {focusChatHotkeyText}
                </span>
              </div>
            )}
          </div>

          {/* Other attachments area */}
          <div className="flex flex-row flex-wrap items-center justify-start gap-1 *:shrink-0">
            {activeChat && (isVerboseMode || contextUsed > 80) && (
              <ContextUsageRing
                percentage={contextUsed}
                usedKb={activeChat.usage.usedContextWindowSize / 1000}
                maxKb={activeChat.usage.maxContextWindowSize / 1000}
              />
            )}
            <FileAttachmentChips
              fileAttachments={chatState.fileAttachments}
              removeFileAttachment={chatState.removeFileAttachment}
            />
            <ContextElementsChipsFlexible
              selectedElements={chatState.selectedElements}
              removeSelectedElementById={chatState.removeSelectedElement}
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
                  clearContextElements();
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
                  className="group z-10 size-8 cursor-pointer rounded-full p-1 opacity-100! shadow-md backdrop-blur-lg !disabled:*:opacity-10"
                >
                  <SquareIcon className="size-3.5 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop agent</TooltipContent>
            </Tooltip>
          )}
          {!canStop && (
            <>
              {openTab === MainTab.BROWSING && (
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={hasOpenedStartPage}
                      className="text-muted-foreground data-[context-selector-active=true]:bg-primary/5 data-[context-selector-active=true]:text-primary data-[context-selector-active=true]:hover:bg-primary/10"
                      data-context-selector-active={contextSelectionActive}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (contextSelectionActive) {
                          setContextSelectionActive(false);
                        } else {
                          setChatInputActive(true);
                          setContextSelectionActive(true);
                        }
                      }}
                      aria-label="Select context elements"
                    >
                      <SquareDashedMousePointerIcon className="size-3.5 stroke-[2.5px]" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {contextSelectionActive ? (
                      'Stop selecting elements (Esc)'
                    ) : (
                      <>
                        Add reference elements (
                        <HotkeyComboText action={HotkeyActions.CTRL_I} />)
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
                          posthog.capture('agent_file_uploaded', {
                            file_type: file.type,
                            method: 'chat_file_attachment_menu',
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
      {workspaceStatus === 'setup' && (
        <div className="-z-10 absolute right-1 bottom-full left-1 flex flex-row items-center justify-between gap-2 rounded-t-lg border-primary/20 border-t border-r border-l bg-blue-100/10 p-0.75 pl-2.5 backdrop-blur-lg">
          <span className="truncate text-primary/80 text-xs dark:text-blue-400">
            You are in workspace setup-mode.
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0 text-muted-foreground"
            onClick={() => closeWorkspaceSetupAndCreateNewChat(activeChatId)}
          >
            <IconXmark className="size-3" />
            Cancel setup
          </Button>
        </div>
      )}
    </footer>
  );
}
