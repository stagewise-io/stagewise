import { FileAttachmentChips } from '@/components/file-attachment-chips';
import { IconXmark } from 'nucleo-micro-bold';
import { ModelSelect } from './model-select';
import { ContextUsageRing } from './context-usage-ring';
import { SelectedElementsChipsFlexible } from '@/components/selected-elements-chips-flexible';
import { Button } from '@stagewise/stage-ui/components/button';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { HotkeyActions } from '@shared/hotkeys';
import {
  ArrowUpIcon,
  SquareIcon,
  SquareDashedMousePointerIcon,
  ImageUpIcon,
  ChevronDownIcon,
} from 'lucide-react';
import { FileIcon } from './message-part-ui/tools/shared/file-icon';
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
import { useEventListener } from '@/hooks/use-event-listener';
import { usePostHog } from 'posthog-js/react';
import { diffLines } from 'diff';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@stagewise/stage-ui/components/collapsible';

export function ChatPanelFooter() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  const elementSelectionActive = useKartonState(
    (s) => s.browser.contextSelectionMode,
  );
  const setElementSelectionActive = useKartonProcedure(
    (p) => p.browser.contextSelection.setActive,
  );
  const clearSelectedElements = useKartonProcedure(
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

  const isVerboseMode = useKartonState(
    (s) => s.appInfo.releaseChannel === 'dev',
  );

  const enableInputField = useMemo(() => {
    // Disable input if agent is not connected or reconnecting
    if (!isConnected || reconnectState.isReconnecting) return false;

    return !isWorking;
  }, [isWorking, isConnected, reconnectState.isReconnecting]);

  const canSendMessage = useMemo(() => {
    return enableInputField && chatState.chatInput.trim().length > 2;
  }, [enableInputField, chatState]);

  const hasOpenedInternalPage = useMemo(() => {
    return activeTab?.url?.startsWith('stagewise://internal/') ?? false;
  }, [activeTab?.url]);

  const createChat = useKartonProcedure((p) => p.agentChat.create);
  const deleteChat = useKartonProcedure((p) => p.agentChat.delete);

  const closeWorkspace = useKartonProcedure((p) => p.workspace.close);

  const closeWorkspaceSetupAndCreateNewChat = useCallback(
    async (setupChatId: string) => {
      await closeWorkspace();
      await createChat();
      void deleteChat(setupChatId);
      window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
    },
    [closeWorkspace, createChat, deleteChat],
  );

  const handleSubmit = useCallback(() => {
    if (canSendMessage) {
      chatState.sendMessage();
      setElementSelectionActive(false);
      setChatInputActive(false);
      // Dispatch event to force scroll to bottom in chat history
      window.dispatchEvent(new Event('chat-message-sent'));
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
      setElementSelectionActive(false);
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
          !target.closest('#element-selector-element-canvas'))
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
        // State 1: Sidebar is closed → open it
        window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
        if (!isWorking) setElementSelectionActive(true);
        await togglePanelKeyboardFocus('stagewise-ui');
      } else if (
        !elementSelectionActive &&
        !isWorking &&
        !activeTab?.url?.startsWith('stagewise://internal/')
      ) {
        // State 2: Sidebar open, element selection OFF, agent not working and *not* on the start page (start page doesn't allow element selection) → activate element selection
        setElementSelectionActive(true);
      } else {
        // State 3: Sidebar open AND (element selection ON OR agent is working) → close sidebar
        window.dispatchEvent(new Event('sidebar-chat-panel-closed'));
        await togglePanelKeyboardFocus('tab-content');
      }
    }, [
      chatInputActive,
      elementSelectionActive,
      isWorking,
      setElementSelectionActive,
      togglePanelKeyboardFocus,
    ]),
    HotkeyActions.CTRL_I,
  );

  useEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (elementSelectionActive) setElementSelectionActive(false);
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

  // Ensure element selection is always turned off when agent starts working
  useEffect(() => {
    if (isWorking) setElementSelectionActive(false);
  }, [isWorking, setElementSelectionActive]);

  useEventListener('sidebar-chat-panel-closed', () => {
    setChatInputActive(false);
    setElementSelectionActive(false);
  });

  useEventListener('sidebar-chat-panel-opened', () => {
    setChatInputActive(true);
    // Only enable element selection if agent is not working
    if (!isWorking) setElementSelectionActive(true);
  });

  return (
    <footer className="z-20 flex flex-col items-stretch gap-1 px-2">
      <div
        className="relative flex flex-row items-stretch gap-1 rounded-md bg-background p-2 shadow-[0_0_6px_0_rgba(0,0,0,0.05),0_-6px_48px_-24px_rgba(0,0,0,0.08)] ring-1 ring-derived before:absolute before:inset-0 before:rounded-lg dark:bg-surface-1"
        id="chat-input-container-box"
        data-chat-active={chatInputActive}
      >
        <div className="flex flex-1 flex-col items-stretch gap-1">
          {/* Text input area */}
          <div className="relative flex h-28 pr-1">
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
                'scrollbar-subtle relative z-10 mt-0 h-full w-full resize-none overflow-visible rounded-none border-none text-foreground text-sm outline-none ring-0 transition-all duration-300 ease-out placeholder:text-muted-foreground/70 focus:outline-none disabled:bg-transparent',
              )}
              placeholder={`Ask anything about this page ${focusChatHotkeyText}`}
            />
          </div>

          {/* Other attachments area */}
          <div className="flex shrink-0 flex-row flex-wrap items-center justify-start gap-1 *:shrink-0">
            <ModelSelect
              onModelChange={() => {
                // Defer focus until after popover closes using double rAF
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    inputRef.current?.focus();
                  });
                });
              }}
            />
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
            <SelectedElementsChipsFlexible
              selectedElements={chatState.selectedElements}
              removeSelectedElementById={chatState.removeSelectedElement}
            />
            {chatState.fileAttachments.length +
              chatState.selectedElements.length >
              1 && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  chatState.clearFileAttachments();
                  clearSelectedElements();
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
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={hasOpenedInternalPage}
                    className="data-[element-selector-active=true]:bg-primary-foreground/5 data-[element-selector-active=true]:text-primary-foreground"
                    data-element-selector-active={elementSelectionActive}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (elementSelectionActive) {
                        setElementSelectionActive(false);
                      } else {
                        setChatInputActive(true);
                        setElementSelectionActive(true);
                      }
                    }}
                    aria-label="Select context elements"
                  >
                    <SquareDashedMousePointerIcon className="size-3.5 stroke-[2.5px]" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {elementSelectionActive ? (
                    'Stop selecting elements (Esc)'
                  ) : (
                    <>
                      Add reference elements (
                      <HotkeyComboText action={HotkeyActions.CTRL_I} />)
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
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
                    className="mb-1"
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
        {workspaceStatus === 'setup' && (
          <div className="-z-10 absolute right-2 bottom-full left-2 flex flex-row items-center justify-between gap-2 rounded-t-lg border-derived-subtle border-t border-r border-l bg-background p-0.75 pl-2.5 backdrop-blur-lg">
            <span className="truncate text-primary-foreground text-xs">
              You are in workspace setup-mode.
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="shrink-0"
              onClick={() => closeWorkspaceSetupAndCreateNewChat(activeChatId)}
            >
              <IconXmark className="size-3" />
              Cancel setup
            </Button>
          </div>
        )}
        <FileDiffCard />
      </div>
    </footer>
  );
}

function FileDiffCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const activeChatId = useKartonState((s) => s.agentChat.activeChatId);
  const chats = useKartonState((s) => s.agentChat.chats);
  const activeChat = useMemo(() => {
    return activeChatId && chats ? chats[activeChatId] : null;
  }, [activeChatId, chats]);
  const [isOpen, setIsOpen] = useState(false);

  const rejectAllPendingEdits = useKartonProcedure(
    (p) => p.agentChat.rejectAllPendingEdits,
  );
  const acceptAllPendingEdits = useKartonProcedure(
    (p) => p.agentChat.acceptAllPendingEdits,
  );
  const createTab = useKartonProcedure((p) => p.browser.createTab);

  const openDiffReviewPage = useCallback(
    (filePath?: string) => {
      if (activeChatId) {
        const hash = filePath ? `#${encodeURIComponent(filePath)}` : '';
        void createTab(
          `stagewise://internal/diff-review/${activeChatId}${hash}`,
          true,
        );
      }
    },
    [activeChatId, createTab],
  );

  const pendingEdits = useMemo(() => {
    return activeChat?.pendingEdits ?? [];
  }, [activeChat]);

  const formattedEdits = useMemo(() => {
    const edits: {
      path: string;
      fileName: string;
      linesAdded: number;
      linesRemoved: number;
    }[] = [];
    for (const edit of pendingEdits) {
      const diff = diffLines(edit.before ?? '', edit.after ?? '');
      const fileName = edit.path.split('/').pop() ?? '';
      const linesAdded = diff.reduce(
        (acc, line) => acc + (line.added ? line.count : 0),
        0,
      );
      const linesRemoved = diff.reduce(
        (acc, line) => acc + (line.removed ? line.count : 0),
        0,
      );
      edits.push({ path: edit.path, fileName, linesAdded, linesRemoved });
    }
    return edits;
  }, [pendingEdits]);

  // Sync card height with CSS variable for ChatHistory padding
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    let previousHeight = 0;

    const updateHeight = () => {
      const height = pendingEdits.length > 0 ? card.offsetHeight : 0;
      const delta = height - previousHeight;

      document.documentElement.style.setProperty(
        '--file-diff-card-height',
        `${height}px`,
      );

      // Dispatch event to notify chat history about height change
      if (delta !== 0) {
        window.dispatchEvent(
          new CustomEvent('file-diff-card-height-changed', {
            detail: { delta, height },
          }),
        );
      }

      previousHeight = height;
    };

    // Initial measurement
    updateHeight();

    // Observe size changes
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(card);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.setProperty(
        '--file-diff-card-height',
        '0px',
      );
    };
  }, [pendingEdits.length]);

  if (pendingEdits.length === 0) return null;

  return (
    <div
      ref={cardRef}
      className="-z-10 absolute right-2 bottom-full left-2 flex flex-col items-center justify-between gap-1 rounded-t-lg border-derived-subtle border-t border-r border-l bg-background p-0.75 backdrop-blur-lg"
    >
      <Collapsible className="w-full" open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex w-full flex-col items-start justify-start gap-2 p-0">
          <CollapsibleTrigger
            size="condensed"
            className={cn(
              'w-full cursor-pointer p-0 hover:bg-transparent active:bg-transparent',
            )}
          >
            <div className="flex w-full flex-row items-center justify-between gap-2 pl-1.5 text-muted-foreground text-xs hover:text-foreground has-[button:hover]:text-muted-foreground">
              <ChevronDownIcon
                className={cn(
                  'size-3 shrink-0 transition-transform duration-150',
                  isOpen && 'rotate-180',
                )}
              />
              {`${formattedEdits.length} Edit${formattedEdits.length > 1 ? 's' : ''}`}
              <div className="ml-auto flex flex-row items-center justify-start gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    void rejectAllPendingEdits();
                  }}
                >
                  Reject
                </Button>
                <Button
                  variant="primary"
                  size="xs"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    void acceptAllPendingEdits();
                  }}
                >
                  Accept all
                </Button>
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="w-full pb-1">
            {formattedEdits.map((edit) => (
              <button
                type="button"
                className="flex w-full cursor-pointer flex-col items-start justify-start gap-2 rounded px-1 py-0.5 text-foreground hover:bg-surface-1 hover:text-hover-derived"
                key={edit.path}
                onClick={() => openDiffReviewPage(edit.path)}
              >
                <span className="flex flex-row items-center justify-start gap-1 truncate text-xs">
                  <FileIcon
                    filePath={edit.fileName}
                    className="size-5 shrink-0"
                  />
                  <span className="text-xs leading-none">{edit.fileName}</span>
                  {edit.linesAdded > 0 && (
                    <span className="text-[10px] text-success-foreground leading-none hover:text-hover-derived">
                      +{edit.linesAdded}
                    </span>
                  )}
                  {edit.linesRemoved > 0 && (
                    <span className="text-[10px] text-error-foreground leading-none hover:text-hover-derived">
                      -{edit.linesRemoved}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
