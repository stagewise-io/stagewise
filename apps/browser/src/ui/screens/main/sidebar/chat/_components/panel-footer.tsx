import { Button } from '@stagewise/stage-ui/components/button';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { HotkeyActions } from '@shared/hotkeys';
import { ChevronDownIcon } from 'lucide-react';
import { FileIcon } from './message-part-ui/tools/shared/file-icon';
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  useKartonState,
  useKartonProcedure,
  useKartonConnected,
  useKartonReconnectState,
  useComparingSelector,
} from '@/hooks/use-karton';
import { useHotKeyListener } from '@/hooks/use-hotkey-listener';
import { useEventListener } from '@/hooks/use-event-listener';
import { diffLines } from 'diff';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@stagewise/stage-ui/components/collapsible';
import {
  ChatInput,
  ChatInputActions,
  type ChatInputHandle,
} from './chat-input';

export function ChatPanelFooter() {
  const chatInputRef = useRef<ChatInputHandle>(null);
  const chatState = useChatState();
  const { isWorking, activeChatId, chats } = useKartonState(
    useComparingSelector((s) => ({
      activeChatId: s.agentChat?.activeChatId,
      isWorking: s.agentChat?.isWorking,
      chats: s.agentChat?.chats,
    })),
  );

  // Use 'main' as the message ID for the main chat input
  const MESSAGE_ID = 'main';

  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTab = useMemo(() => {
    return tabs[activeTabId];
  }, [tabs, activeTabId]);

  // Check if THIS input's element selection is active (not just global mode)
  const elementSelectionActive = useKartonState(
    (s) =>
      s.browser.contextSelectionMode &&
      s.browser.activeSelectionMessageId === MESSAGE_ID,
  );
  const setElementSelectionActiveProc = useKartonProcedure(
    (p) => p.browser.contextSelection.setActive,
  );
  const setElementSelectionActive = useCallback(
    (active: boolean) => {
      setElementSelectionActiveProc(active, MESSAGE_ID);
    },
    [setElementSelectionActiveProc],
  );
  const clearSelectedElementsProc = useKartonProcedure(
    (p) => p.browser.contextSelection.clearElements,
  );
  const clearSelectedElements = useCallback(() => {
    clearSelectedElementsProc(MESSAGE_ID);
  }, [clearSelectedElementsProc]);

  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );

  const stopAgent = useKartonProcedure((p) => p.agentChat.abortAgentCall);
  const canStop = isWorking;
  const isConnected = useKartonConnected();
  const reconnectState = useKartonReconnectState();

  const abortAgent = useCallback(() => {
    stopAgent();
  }, [stopAgent]);

  const activeChat = useMemo(() => {
    return activeChatId && chats ? chats[activeChatId] : null;
  }, [activeChatId, chats]);

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

  const handleSubmit = useCallback(() => {
    if (canSendMessage) {
      chatState.sendMessage();
      setElementSelectionActive(false);
      setChatInputActive(false);
      // Dispatch event to force scroll to bottom in chat history
      window.dispatchEvent(new Event('chat-message-sent'));
    }
  }, [chatState, canSendMessage, setElementSelectionActive]);

  const contextUsed = useMemo(() => {
    const used = activeChat?.usage.usedContextWindowSize ?? 0;
    const max = activeChat?.usage.maxContextWindowSize ?? 1;
    return Math.min(100, Math.round((used / max) * 100));
  }, [
    activeChat?.usage.usedContextWindowSize,
    activeChat?.usage.maxContextWindowSize,
  ]);

  const [chatInputActive, setChatInputActive] = useState<boolean>(false);
  // Track if input was focused before app lost focus (for restoring on app regain)
  const wasActiveBeforeAppBlurRef = useRef(false);

  useEffect(() => {
    if (chatInputActive) {
      // Wait for the next tick to ensure the input is mounted
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 0);
    } else {
      // Don't automatically deactivate element selection here
      // Element selection can be controlled by other components (inline edit mode)
      // It will be deactivated explicitly when needed (Escape key, send message, agent working, panel closed)
      chatInputRef.current?.blur();
    }
  }, [chatInputActive]);

  const onInputFocus = useCallback(() => {
    // Cancel any active message edits when main chat input is focused
    window.dispatchEvent(new Event('cancel-all-message-edits'));
    if (!chatInputActive) setChatInputActive(true);
    // Clear the app blur flag since we're now focused
    wasActiveBeforeAppBlurRef.current = false;
  }, [chatInputActive]);

  const onInputBlur = useCallback(
    (ev: React.FocusEvent<HTMLTextAreaElement, Element>) => {
      // We should only allow chat blur if the user clicked outside the chat box or the context selector element tree. Otherwise, we should keep the input active by refocusing it.
      const target = ev.relatedTarget as HTMLElement;
      if (target?.closest('#chat-file-attachment-menu-content')) {
        return;
      }
      if (
        !target ||
        (!target.closest('#chat-input-container-box') &&
          !target.closest('#element-selector-element-canvas'))
      ) {
        // If relatedTarget is null, the app might be losing focus (e.g., CMD+tab)
        // Track this so we can restore focus when the app regains focus
        if (!target && chatInputActive)
          wasActiveBeforeAppBlurRef.current = true;

        setChatInputActive(false);
      } else if (chatInputActive) chatInputRef.current?.focus();
    },
    [chatInputActive],
  );

  // Restore focus when the app regains focus (e.g., after CMD+tab back)
  useEventListener(
    'focus',
    () => {
      if (!wasActiveBeforeAppBlurRef.current) return;
      wasActiveBeforeAppBlurRef.current = false;
      setChatInputActive(true);
      chatInputRef.current?.focus();
    },
    {},
    window,
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
      if (e.code === 'Escape' && chatInputActive) {
        if (elementSelectionActive) setElementSelectionActive(false);
        else setChatInputActive(false);
      }
    },
    {},
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

  const handleToggleElementSelection = useCallback(() => {
    if (elementSelectionActive) {
      setElementSelectionActive(false);
    } else {
      setChatInputActive(true);
      setElementSelectionActive(true);
    }
  }, [elementSelectionActive, setElementSelectionActive]);

  const handleClearAll = useCallback(() => {
    chatState.clearFileAttachments();
    clearSelectedElements();
  }, [chatState, clearSelectedElements]);

  // Track drag-over state for visual feedback
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      // Process dropped files
      const files = Array.from(e.dataTransfer.files);
      files.forEach((file) => {
        chatState.addFileAttachment(file);
      });

      // Focus the input
      chatInputRef.current?.focus();
    },
    [chatState],
  );

  return (
    <footer className="z-20 flex flex-col items-stretch gap-1 px-2">
      <div
        className={cn(
          'relative flex flex-row items-stretch gap-1 rounded-md bg-background p-2 shadow-[0_0_6px_0_rgba(0,0,0,0.05),0_-6px_48px_-24px_rgba(0,0,0,0.08)] ring-1 ring-derived transition-colors before:absolute before:inset-0 before:rounded-lg dark:bg-surface-1',
          isDragOver && 'bg-hover-derived!',
        )}
        id="chat-input-container-box"
        data-chat-active={chatInputActive}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <ChatInput
          ref={chatInputRef}
          value={chatState.chatInput}
          onChange={chatState.setChatInput}
          onSubmit={handleSubmit}
          disabled={!enableInputField}
          fileAttachments={chatState.fileAttachments}
          onRemoveFileAttachment={chatState.removeFileAttachment}
          onAddFileAttachment={chatState.addFileAttachment}
          selectedElements={chatState.selectedElements}
          onRemoveSelectedElement={chatState.removeSelectedElement}
          onClearAll={handleClearAll}
          showModelSelect
          onModelChange={() => chatInputRef.current?.focus()}
          showContextUsageRing={
            !!activeChat && (isVerboseMode || contextUsed > 80)
          }
          contextUsedPercentage={contextUsed}
          contextUsedKb={
            activeChat ? activeChat.usage.usedContextWindowSize / 1000 : 0
          }
          contextMaxKb={
            activeChat ? activeChat.usage.maxContextWindowSize / 1000 : 0
          }
          onFocus={onInputFocus}
          onBlur={onInputBlur}
        />
        <ChatInputActions
          showStopButton={canStop}
          onStop={abortAgent}
          showElementSelectorButton
          elementSelectionActive={elementSelectionActive}
          onToggleElementSelection={handleToggleElementSelection}
          elementSelectorDisabled={hasOpenedInternalPage}
          showImageUploadButton
          onAddFileAttachment={chatState.addFileAttachment}
          canSendMessage={canSendMessage && chatInputActive}
          onSubmit={handleSubmit}
          isActive={chatInputActive}
        />
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
      if (delta !== 0)
        window.dispatchEvent(
          new CustomEvent('file-diff-card-height-changed', {
            detail: { delta, height },
          }),
        );

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
