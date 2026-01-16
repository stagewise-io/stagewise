import { StatusCard } from './footer-status-card';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { HotkeyActions } from '@shared/hotkeys';
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
    // Only disable input if agent is not connected or reconnecting
    // Input is now always enabled when connected (allows typing while agent works)
    if (!isConnected || reconnectState.isReconnecting) return false;
    return true;
  }, [isConnected, reconnectState.isReconnecting]);

  const canSendMessage = useMemo(() => {
    // Allow sending when input is enabled and has enough text
    // (backend will queue if agent is working)
    return enableInputField && chatState.chatInput.trim().length > 2;
  }, [enableInputField, chatState]);

  const hasOpenedInternalPage = useMemo(() => {
    return activeTab?.url?.startsWith('stagewise://internal/') ?? false;
  }, [activeTab?.url]);

  const handleSubmit = useCallback(() => {
    if (canSendMessage) {
      chatState.sendMessage();
      setElementSelectionActive(false);
      // Keep input focused after sending - refocus in next tick
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 0);
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
        // State 1: Sidebar is closed → open it and enable element selection
        window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
        setElementSelectionActive(true);
        await togglePanelKeyboardFocus('stagewise-ui');
      } else if (
        !elementSelectionActive &&
        !activeTab?.url?.startsWith('stagewise://internal/')
      ) {
        // State 2: Sidebar open, element selection OFF, *not* on the start page → activate element selection
        setElementSelectionActive(true);
      } else {
        // State 3: Sidebar open AND element selection ON → close sidebar
        window.dispatchEvent(new Event('sidebar-chat-panel-closed'));
        await togglePanelKeyboardFocus('tab-content');
      }
    }, [
      chatInputActive,
      elementSelectionActive,
      setElementSelectionActive,
      togglePanelKeyboardFocus,
      activeTab?.url,
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

  useEventListener('sidebar-chat-panel-closed', () => {
    setChatInputActive(false);
    setElementSelectionActive(false);
  });

  useEventListener('sidebar-chat-panel-opened', () => {
    setChatInputActive(true);
    // Enable element selection (allowed even while agent is working for queued messages)
    setElementSelectionActive(true);
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
          'relative flex flex-row items-stretch gap-1 rounded-md bg-background p-2 shadow-elevation-1 ring-1 ring-derived transition-colors before:absolute before:inset-0 before:rounded-lg dark:bg-surface-1',
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
          isAgentWorking={isWorking}
          hasTextInput={chatState.chatInput.trim().length > 0}
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
        <StatusCard />
      </div>
    </footer>
  );
}
