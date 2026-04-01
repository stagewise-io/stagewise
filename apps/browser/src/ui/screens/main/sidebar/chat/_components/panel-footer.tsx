import posthog from 'posthog-js';
import { StatusCard } from './footer-status-card';
import type { SelectedElement } from '@shared/selected-elements';
import { useMessageEditState } from '@ui/hooks/use-message-edit-state';
import { useFileAttachments } from '@ui/hooks/use-file-attachments';
import { useDragDrop } from '@ui/hooks/use-drag-drop';
import { useElementSelectionWatcher } from '@ui/hooks/use-element-selection-watcher';
import { cn, generateId, collectUserMessageMetadata } from '@ui/utils';
import { HotkeyActions } from '@shared/hotkeys';
import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  type RefObject,
} from 'react';
import {
  useKartonState,
  useKartonProcedure,
  useKartonConnected,
  useKartonReconnectState,
} from '@ui/hooks/use-karton';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { useEventListener } from '@ui/hooks/use-event-listener';
import {
  ChatInput,
  ChatInputActions,
  type ChatInputHandle,
} from './chat-input';
import type { AttachmentType } from '@ui/screens/main/sidebar/chat/_components/rich-text/attachments';
import type { MentionContext } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions';
import type { FileMentionItem } from '@ui/screens/main/sidebar/chat/_components/rich-text/mentions/types';
import type { AttachmentMetadata } from '@shared/karton-contracts/ui/agent/metadata';
import { selectedElementToAttachmentAttributes } from '@ui/utils/attachment-conversions';
import { selectedElementToSwDomElement } from '@shared/selected-elements/swdomelement';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import { EMPTY_MOUNTS } from '@shared/karton-contracts/ui';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { availableModels } from '@shared/available-models';
import { useChatDraft } from '@ui/hooks/use-chat-draft';
import type { Content } from '@tiptap/core';
import {
  markdownToTipTapContent,
  enrichTipTapContent,
} from '@ui/utils/tiptap-content-utils';
import { getCurrentDraftAnswers } from './footer-status-card/user-question-section';

// Stable empty arrays to avoid new-reference re-renders
const EMPTY_HISTORY: AgentMessage[] = [];
const EMPTY_QUEUE: (AgentMessage & { role: 'user' })[] = [];
export function ChatPanelFooter() {
  const chatInputRef = useRef<ChatInputHandle>(null);
  const { registerDraftGetter } = useChatDraft();

  // Register the draft getter so other components can access the current input
  useEffect(() => {
    const unregister = registerDraftGetter(() => {
      return chatInputRef.current?.getJsonContent() ?? '';
    });
    return unregister;
  }, [registerDraftGetter]);

  const [openAgent] = useOpenAgent();

  const isWorking = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.state.isWorking || false : false,
  );
  const isWorkingRef = useRef(isWorking);
  isWorkingRef.current = isWorking;

  // History is only used inside abortAgent (via ref) — subscribe with a
  // stable empty-array fallback so the selector doesn't trigger re-renders
  // from new [] allocations, while Immer structural sharing keeps the
  // actual history reference stable between unrelated state changes.
  const history = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.history ?? EMPTY_HISTORY)
      : EMPTY_HISTORY,
  );
  const historyRef = useRef(history);
  historyRef.current = history;

  // Read server-side input state only to initialize / re-initialize on agent
  // switch.  We do NOT use this value for rendering — localInputState drives
  // the editor.  Subscribing here is intentional so the ref stays fresh for
  // the openAgent-change effect below.
  const chatInputState = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.state.inputState : null,
  );
  const chatInputStateRef = useRef(chatInputState);
  chatInputStateRef.current = chatInputState;

  const setChatInputState = useKartonProcedure(
    (p) => p.agents.updateInputState,
  );

  const [localInputState, setLocalInputState] = useState<Content | null>(() =>
    chatInputState && chatInputState.length > 0
      ? JSON.parse(chatInputState)
      : null,
  );

  // Re-sync local input state when the active agent changes
  const prevOpenAgentRef = useRef(openAgent);
  useEffect(() => {
    if (openAgent === prevOpenAgentRef.current) return;
    prevOpenAgentRef.current = openAgent;
    const serverState = chatInputStateRef.current;
    setLocalInputState(
      serverState && serverState.length > 0 ? JSON.parse(serverState) : null,
    );
  }, [openAgent]);

  const [canSendMessage, setCanSendMessage] = useState(false);

  const updateChatInputState = useCallback(
    (newInputState: Content) => {
      setLocalInputState(newInputState);
      setCanSendMessage(
        (chatInputRef.current?.getTextContent()?.trim().length ?? 0) > 2,
      );
      if (openAgent) {
        void setChatInputState(openAgent, JSON.stringify(newInputState));
      }
    },
    [openAgent, setChatInputState],
  );

  // File attachments via shared hook
  const {
    attachments: fileAttachments,
    addFileAttachment,
    removeAttachment: removeFileAttachment,
    clearAttachments: clearFileAttachments,
    setAttachments: setFileAttachments,
  } = useFileAttachments({
    chatInputRef: chatInputRef as RefObject<ChatInputHandle>,
    agentId: openAgent,
  });

  const { activeEditMessageId, setMainDropHandler } = useMessageEditState();

  // Focus input and recalculate send-button state when agent changes.
  // ChatInput has key={openAgent} so it fully re-mounts on switch —
  // the initial render with restored content doesn't fire onChange,
  // leaving canSendMessage stale.  Recalculate after the new mount.
  useEffect(() => {
    if (openAgent)
      requestAnimationFrame(() => {
        chatInputRef.current?.focus();
        const textLength =
          chatInputRef.current?.getTextContent()?.trim().length ?? 0;
        setCanSendMessage(textLength > 2);
      });
  }, [openAgent]);

  const activeTabUrl = useKartonState((s) => {
    const tabId = s.browser.activeTabId;
    return tabId ? (s.browser.tabs[tabId]?.url ?? null) : null;
  });

  // Element selection state from Karton
  const selectionModeActive = useKartonState(
    (s) => s.browser.contextSelectionMode,
  );

  const elementSelectionActive = useMemo(() => {
    if (activeEditMessageId) return false;
    return selectionModeActive;
  }, [selectionModeActive, activeEditMessageId]);

  // Karton procedures
  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );
  const sendUserMessage = useKartonProcedure((p) => p.agents.sendUserMessage);
  const stopAgent = useKartonProcedure((p) => p.agents.stop);
  const revertToUserMessage = useKartonProcedure(
    (p) => p.agents.revertToUserMessage,
  );
  const setContextSelectionActive = useKartonProcedure(
    (p) => p.browser.contextSelection.setActive,
  );
  const clearSelectedElementsProc = useKartonProcedure(
    (p) => p.browser.contextSelection.clearElements,
  );
  const removeSelectedElementProc = useKartonProcedure(
    (p) => p.browser.contextSelection.removeElement,
  );
  const storeAttachment = useKartonProcedure((p) => p.agents.storeAttachment);
  const captureAndStoreElementScreenshot = useKartonProcedure(
    (p) => p.browser.contextSelection.captureAndStoreElementScreenshot,
  );

  const searchMentionFiles = useKartonProcedure(
    (p) => p.toolbox.searchMentionFiles,
  );
  const mentionTabs = useKartonState((s) => s.browser.tabs);
  const mentionActiveTabId = useKartonState((s) => s.browser.activeTabId);
  const mentionMounts = useKartonState((s) =>
    openAgent
      ? (s.toolbox[openAgent]?.workspace?.mounts ?? EMPTY_MOUNTS)
      : EMPTY_MOUNTS,
  );
  const slashCommands = useKartonState((s) => s.skills);
  // Stable ref so the mention command handler (configured once by TipTap)
  // always sees the latest setFileAttachments without re-creating the context.
  const setFileAttachmentsRef = useRef(setFileAttachments);
  setFileAttachmentsRef.current = setFileAttachments;

  const onFileMentionSelected = useCallback((item: FileMentionItem) => {
    const attachment: AttachmentMetadata = {
      // mountedPath is the agent-facing path (e.g. "w1/src/button.tsx")
      path: item.meta.mountedPath,
      // No originalFileName for workspace paths — basename is derived from path
    };
    setFileAttachmentsRef.current((prev) => {
      // Deduplicate by path
      if (prev.some((a) => a.path === attachment.path)) return prev;
      return [...prev, attachment];
    });
  }, []);

  const mentionContext = useMemo<MentionContext>(
    () => ({
      agentInstanceId: openAgent,
      searchFiles: searchMentionFiles,
      tabs: mentionTabs,
      activeTabId: mentionActiveTabId,
      mounts: mentionMounts,
      onFileMentionSelected,
    }),
    [
      openAgent,
      searchMentionFiles,
      mentionTabs,
      mentionActiveTabId,
      mentionMounts,
      onFileMentionSelected,
    ],
  );

  const isConnected = useKartonConnected();
  const reconnectState = useKartonReconnectState();

  const clearAll = useCallback(() => {
    clearFileAttachments();
    clearSelectedElementsProc();
  }, [clearFileAttachments, clearSelectedElementsProc]);

  // Element selector helper functions
  const startContextSelector = useCallback(() => {
    setContextSelectionActive(true);
  }, [setContextSelectionActive]);

  const stopContextSelector = useCallback(() => {
    setContextSelectionActive(false);
  }, [setContextSelectionActive]);

  // Pending early-abort revert: deferred until isWorking becomes false
  // so the stream is fully done and won't re-add the assistant message.
  const [pendingRevert, setPendingRevert] = useState<{
    messageId: string;
    message: AgentMessage;
  } | null>(null);

  useEffect(() => {
    if (!isWorking && pendingRevert) {
      const { messageId, message } = pendingRevert;
      setPendingRevert(null);

      // Revert chat history (remove user msg + partial response)
      if (openAgent) revertToUserMessage(openAgent, messageId, false);

      // Restore input content: parse markdown then inject full attachment
      // data from metadata so nodes are identical to fresh composition
      const textPart = message.parts.find((p) => p.type === 'text');
      const text = textPart?.type === 'text' ? textPart.text : '';
      if (text) {
        const parsed = markdownToTipTapContent(text);
        const tiptapContent = enrichTipTapContent(parsed, {
          attachments: message.metadata?.attachments,
        });
        updateChatInputState(tiptapContent);
        requestAnimationFrame(() => {
          chatInputRef.current?.focus();
        });
      }

      // Restore attachments state (used by handleSubmit for the message)
      if (message.metadata?.attachments?.length) {
        setFileAttachments(message.metadata.attachments);
      }
    }
  }, [
    isWorking,
    pendingRevert,
    revertToUserMessage,
    openAgent,
    updateChatInputState,
    setFileAttachments,
  ]);

  // Restore checkpoint: find the next user message after the target assistant
  // message, revert history to that point, and populate the chat input.
  const executeCheckpointRestore = useCallback(
    (detail: { assistantMessageId: string; undoToolCalls: boolean }) => {
      const { assistantMessageId, undoToolCalls } = detail;
      const currentHistory = historyRef.current ?? [];

      // Find the assistant message's index
      const assistantIndex = currentHistory.findIndex(
        (m) => m.id === assistantMessageId,
      );
      if (assistantIndex === -1) return;

      // Find the next user message after the assistant message
      let nextUserMessage: AgentMessage | undefined;
      for (let i = assistantIndex + 1; i < currentHistory.length; i++) {
        if (currentHistory[i]?.role === 'user') {
          nextUserMessage = currentHistory[i];
          break;
        }
      }
      if (!nextUserMessage) return;

      // Revert history — removes nextUserMessage and everything after it
      if (openAgent)
        revertToUserMessage(openAgent, nextUserMessage.id, undoToolCalls);

      // Reset current draft state before restoring
      setFileAttachments([]);

      // Restore the user message's content into the chat input
      const textPart = nextUserMessage.parts.find((p) => p.type === 'text');
      const text = textPart?.type === 'text' ? textPart.text : '';
      const parsed = markdownToTipTapContent(text);
      const tiptapContent = enrichTipTapContent(parsed, {
        attachments: nextUserMessage.metadata?.attachments,
      });
      updateChatInputState(tiptapContent);
      requestAnimationFrame(() => {
        chatInputRef.current?.focus();
      });

      // Restore file attachments if present
      if (nextUserMessage.metadata?.attachments?.length) {
        setFileAttachments(nextUserMessage.metadata.attachments);
      }
    },
    [openAgent, revertToUserMessage, updateChatInputState, setFileAttachments],
  );

  // Pending checkpoint restore: deferred until isWorking becomes false
  // so the stream is fully done and won't race with the revert.
  const [pendingCheckpointRestore, setPendingCheckpointRestore] = useState<{
    assistantMessageId: string;
    undoToolCalls: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isWorking && pendingCheckpointRestore) {
      setPendingCheckpointRestore(null);
      executeCheckpointRestore(pendingCheckpointRestore);
    }
  }, [isWorking, pendingCheckpointRestore, executeCheckpointRestore]);

  // Handle "Restore checkpoint" from assistant message menu
  useEffect(() => {
    const handler = (e: WindowEventMap['chat-restore-checkpoint']) => {
      const detail = e.detail;
      if (isWorkingRef.current && openAgent) {
        // Agent is streaming — stop first, defer restore until idle
        setPendingCheckpointRestore(detail);
        void stopAgent(openAgent);
      } else {
        // Agent idle — restore immediately
        executeCheckpointRestore(detail);
      }
    };

    window.addEventListener('chat-restore-checkpoint', handler);
    return () => window.removeEventListener('chat-restore-checkpoint', handler);
  }, [openAgent, stopAgent, executeCheckpointRestore]);

  const isEarlyAbortEligible = useCallback(() => {
    const currentHistory = historyRef.current ?? [];
    let lastUserMsgIndex = -1;
    for (let i = currentHistory.length - 1; i >= 0; i--) {
      if (currentHistory[i]?.role === 'user') {
        lastUserMsgIndex = i;
        break;
      }
    }
    if (lastUserMsgIndex === -1) return false;
    const assistantParts = currentHistory
      .slice(lastUserMsgIndex + 1)
      .flatMap((m) => m?.parts ?? []);
    const hasToolCall = assistantParts.some(
      (p) => p.type.startsWith('tool-') || p.type === 'dynamic-tool',
    );
    const textLength = assistantParts
      .filter((p) => p.type === 'text')
      .reduce((sum, p) => sum + (p.type === 'text' ? p.text.length : 0), 0);
    return !hasToolCall && textLength < 200;
  }, []);

  const abortAgent = useCallback(async () => {
    if (isEarlyAbortEligible()) {
      const currentHistory = historyRef.current ?? [];
      for (let i = currentHistory.length - 1; i >= 0; i--) {
        if (currentHistory[i]?.role === 'user') {
          const userMessage = currentHistory[i]!;
          setPendingRevert({
            messageId: userMessage.id,
            message: userMessage,
          });
          break;
        }
      }
    }

    // Stop the agent (revert will fire once isWorking becomes false)
    if (openAgent) await stopAgent(openAgent);
  }, [stopAgent, openAgent, isEarlyAbortEligible]);

  // Stable abort callback for ChatInputActions — avoids memo-busting when
  // abortAgent's reference changes (e.g. openAgent switches).
  const abortAgentRef = useRef(abortAgent);
  abortAgentRef.current = abortAgent;
  const stableAbortAgent = useCallback(() => abortAgentRef.current(), []);

  const handleEscape = useCallback(() => {
    if (elementSelectionActive) stopContextSelector();
    else if (
      isWorkingRef.current &&
      isEarlyAbortEligible() &&
      (chatInputRef.current?.getTextContent()?.trim().length ?? 0) === 0
    )
      void abortAgentRef.current();
    else setChatInputActive(false);
  }, [elementSelectionActive, stopContextSelector, isEarlyAbortEligible]);

  const isVerboseMode = useKartonState(
    (s) => s.appInfo.releaseChannel === 'dev',
  );

  const enableInputField = useMemo(() => {
    // Only disable input if agent is not connected or reconnecting
    // Input is now always enabled when connected (allows typing while agent works)
    if (!isConnected || reconnectState.isReconnecting) return false;
    return true;
  }, [isConnected, reconnectState.isReconnecting]);

  // canSendMessage is driven by setCanSendMessage in updateChatInputState
  // and gated by enableInputField. No dep on localInputState to stay stable.
  const effectiveCanSendMessage = canSendMessage && enableInputField;

  const hasOpenedInternalPage =
    activeTabUrl?.startsWith('stagewise://internal/') ?? false;

  // Refs for values read at call time inside handleSubmit.
  // This keeps handleSubmit's dependency array stable (no localInputState,
  // fileAttachments, canSendMessage) which in turn
  // keeps the onSubmit prop passed to ChatInputActions referentially stable
  // across keystrokes and streaming updates.
  const localInputStateRef = useRef(localInputState);
  localInputStateRef.current = localInputState;

  const fileAttachmentsRef = useRef(fileAttachments);
  fileAttachmentsRef.current = fileAttachments;

  const canSendMessageRef = useRef(effectiveCanSendMessage);
  canSendMessageRef.current = effectiveCanSendMessage;

  const pendingQuestionId = useKartonState((s) =>
    openAgent ? (s.toolbox[openAgent]?.pendingUserQuestion?.id ?? null) : null,
  );
  const hasPendingQuestion = pendingQuestionId !== null;
  const pendingQuestionIdRef = useRef(pendingQuestionId);
  pendingQuestionIdRef.current = pendingQuestionId;
  const interruptQuestionWithMessage = useKartonProcedure(
    (p) => p.agents.interruptQuestionWithMessage,
  );

  const handleSubmit = useCallback(async () => {
    if (!canSendMessageRef.current) return;

    // Read frequently-changing values from refs at call time
    const currentLocalInputState = localInputStateRef.current;
    const currentFileAttachments = fileAttachmentsRef.current;

    // Snapshot pending question ID — used for the atomic interrupt call below.
    const currentPendingQuestionId = pendingQuestionIdRef.current;

    // Collect metadata for mentions.
    const metadata = collectUserMessageMetadata(currentLocalInputState);

    // File mentions are converted to FileAttachment entries at selection time
    // (via onFileMentionSelected). Strip them from the mentions array so the
    // backend doesn't see duplicate context.
    const filteredMentions = metadata.mentions?.filter(
      (m) => m.providerType !== 'file',
    );

    const markdownText = chatInputRef.current!.getTextContent();

    // Include all file attachments (validation is handled by prompt builder)
    // Note: We no longer store tipTapContent - the text part contains markdown
    // with attachment links (e.g., [](path:att/abc123)) generated by editor.getText()
    const message: AgentMessage & { role: 'user' } = {
      id: generateId(),
      parts: [{ type: 'text' as const, text: markdownText }],
      role: 'user',
      metadata: {
        ...metadata,
        attachments: currentFileAttachments,
        mentions:
          filteredMentions && filteredMentions.length > 0
            ? filteredMentions
            : undefined,
      },
    };

    // Save for restore on error
    const previousContent = currentLocalInputState;

    clearAll();
    stopContextSelector();

    // Clear input IMMEDIATELY (before network call)
    chatInputRef.current?.clear();
    const emptyDoc: Content = {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };
    setLocalInputState(emptyDoc);
    setCanSendMessage(false);
    if (openAgent) void setChatInputState(openAgent, JSON.stringify(emptyDoc));

    // Dispatch event with message data for optimistic rendering
    // Only dispatch when agent is NOT working - if working, the backend
    // will queue the message instead of adding to history immediately
    if (!isWorkingRef.current)
      window.dispatchEvent(
        new CustomEvent('chat-message-sent', { detail: { message } }),
      );

    try {
      if (openAgent) {
        if (currentPendingQuestionId) {
          // Atomic: queue message + resolve question in a single backend call.
          // Include the current form draft so partial answers are preserved.
          await interruptQuestionWithMessage(
            openAgent,
            currentPendingQuestionId,
            message,
            getCurrentDraftAnswers(),
          );
        } else {
          await sendUserMessage(openAgent, message);
        }
      }

      // Keep input focused after sending - refocus in next tick
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 0);
    } catch (error) {
      // Restore input on failure
      setLocalInputState(previousContent);
      // Remove the optimistic message on failure
      window.dispatchEvent(
        new CustomEvent('chat-message-failed', {
          detail: { clientId: message.id },
        }),
      );
      console.error('Failed to send message:', error);
      posthog.captureException(
        error instanceof Error ? error : new Error(String(error)),
        { source: 'renderer', operation: 'sendChatMessage' },
      );
    }
  }, [
    sendUserMessage,
    openAgent,
    setChatInputState,
    clearAll,
    stopContextSelector,
    interruptQuestionWithMessage,
  ]);

  const usedTokens = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.state.usedTokens : 0,
  );
  const activeModelId = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.state.activeModelId : null,
  );
  const customModels = useKartonState((s) => s.preferences.customModels);
  const maxTokens = useMemo(() => {
    if (!activeModelId) return 200000;
    const builtIn = availableModels.find((m) => m.modelId === activeModelId);
    if (builtIn) return builtIn.modelContextRaw;
    const custom = customModels.find((m) => m.modelId === activeModelId);
    if (custom) return custom.contextWindowSize;
    return 200000;
  }, [activeModelId, customModels]);

  const contextUsed = useMemo(() => {
    const used = usedTokens ?? 0;
    const max = maxTokens ?? 1;
    return Math.min(100, Math.round((used / max) * 100));
  }, [usedTokens, maxTokens]);

  const queuedMessages = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.queuedMessages ?? EMPTY_QUEUE)
      : EMPTY_QUEUE,
  );
  const flushQueue = useKartonProcedure((p) => p.agents.flushQueue);
  const handleFlushQueue = useCallback(() => {
    if (openAgent) void flushQueue(openAgent);
  }, [flushQueue, openAgent]);

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
    (ev: FocusEvent) => {
      const target = ev.relatedTarget as HTMLElement;
      // We should only allow chat blur if the user clicked outside the chat box or the context selector element tree. Otherwise, we should keep the input active by refocusing it.
      if (target?.closest('#chat-file-attachment-menu-content')) {
        return;
      }
      // Let focus move naturally into status card inputs (e.g. user question form)
      if (target?.closest('[data-status-card]')) {
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
      } else if (chatInputActive) {
        chatInputRef.current?.focus();
      }
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

  // Clear focus restoration flag when omnibox takes focus (prevents chat from reclaiming focus)
  useEventListener('omnibox-focus-requested', () => {
    wasActiveBeforeAppBlurRef.current = false;
    setChatInputActive(false);
    // Also stop context selection to prevent its ESC handler from consuming the first ESC
    stopContextSelector();
  });

  // Clear focus restoration flag when search bar takes focus (prevents chat from reclaiming focus)
  useEventListener('search-bar-focus-requested', () => {
    wasActiveBeforeAppBlurRef.current = false;
    setChatInputActive(false);
    // Also stop context selection to prevent its ESC handler from consuming the first ESC
    stopContextSelector();
  });

  useHotKeyListener(
    useCallback(async () => {
      if (!chatInputActive) {
        // State 1: Sidebar is closed → open it and enable element selection
        window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
        startContextSelector();
        await togglePanelKeyboardFocus('stagewise-ui');
      } else if (
        !elementSelectionActive &&
        !activeTabUrl?.startsWith('stagewise://internal/')
      ) {
        // State 2: Sidebar open, element selection OFF, *not* on the start page → activate element selection
        startContextSelector();
        // Ensure keyboard focus is on stagewise-ui so ESC key works
        await togglePanelKeyboardFocus('stagewise-ui');
      } else {
        // State 3: Sidebar open AND element selection ON → close sidebar
        window.dispatchEvent(new Event('sidebar-chat-panel-closed'));
        await togglePanelKeyboardFocus('tab-content');
      }
    }, [
      chatInputActive,
      elementSelectionActive,
      startContextSelector,
      togglePanelKeyboardFocus,
      activeTabUrl,
    ]),
    HotkeyActions.TOGGLE_CONTEXT_SELECTOR,
  );

  useEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.code === 'Escape' && chatInputActive) {
        if (elementSelectionActive) stopContextSelector();
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
    stopContextSelector();
  });

  useEventListener('sidebar-chat-panel-opened', () => {
    setChatInputActive(true);
  });

  const handleToggleElementSelection = useCallback(async () => {
    if (elementSelectionActive) stopContextSelector();
    else {
      setChatInputActive(true);
      startContextSelector();
      // Ensure keyboard focus is on stagewise-ui so ESC key works
      await togglePanelKeyboardFocus('stagewise-ui');
    }
  }, [
    elementSelectionActive,
    startContextSelector,
    stopContextSelector,
    togglePanelKeyboardFocus,
  ]);

  /**
   * Add a file attachment and insert a mention into the editor
   */
  const handleAddFileAttachment = useCallback(
    (file: File) => {
      addFileAttachment(file);
    },
    [addFileAttachment],
  );

  /**
   * Handle files pasted into the editor
   */
  const handlePasteFiles = useCallback(
    (files: File[]) => {
      files.forEach((file) => {
        addFileAttachment(file);
      });
      chatInputRef.current?.focus();
    },
    [addFileAttachment],
  );

  /**
   * Handle attachment removal when badge is deleted from editor
   */
  const handleAttachmentRemoved = useCallback(
    (id: string, type: AttachmentType, attrs?: Record<string, unknown>) => {
      if (type === 'attachment') {
        removeFileAttachment(id); // id is the path
      } else if (type === 'element') {
        removeSelectedElementProc(id);
        // Also remove the file attachment that was stored for this element
        const blobPath = attrs?.blobPath as string | undefined;
        if (blobPath) removeFileAttachment(blobPath);
      }
    },
    [removeFileAttachment, removeSelectedElementProc],
  );

  // Drag and drop via shared hook
  const { isDragOver, handlers: dragHandlers } = useDragDrop({
    onFileDrop: addFileAttachment,
    onDropComplete: () => chatInputRef.current?.focus(),
  });

  // Register main drop handler for forwarded events
  useEffect(() => {
    // Register the useDragDrop handler so forwarded events get the same processing
    setMainDropHandler(dragHandlers.onDrop);
  }, [setMainDropHandler, dragHandlers.onDrop]);

  // Handle textclip-expand: replace the attachment node with inline text and
  // remove the file attachment.
  useEffect(() => {
    const handler = (e: Event) => {
      const { attachmentId, content } = (e as CustomEvent).detail as {
        attachmentId: string;
        content: string;
      };
      chatInputRef.current?.replaceAttachmentWithText(attachmentId, content);
      removeFileAttachment(attachmentId);
    };
    window.addEventListener('textclip-expand', handler);
    return () => window.removeEventListener('textclip-expand', handler);
  }, [chatInputRef, removeFileAttachment]);

  // Watch for selected elements via shared hook.
  // When a new element is selected we:
  // 1. Insert an elementAttachment node in the editor (for UI display)
  // 2. Serialize to `.swdomelement` JSON and store as a file attachment so the
  //    backend can read it from `att/` just like any other attachment file.
  useElementSelectionWatcher({
    isActive: elementSelectionActive,
    onNewElement: useCallback(
      (element: SelectedElement) => {
        const attrs = selectedElementToAttachmentAttributes(element);
        // Defer insertion to avoid flushSync inside a React lifecycle
        // (the watcher callback fires during a state update).
        queueMicrotask(() => {
          chatInputRef.current?.insertAttachment(attrs);
        });

        // Fire-and-forget: serialize the element to a .swdomelement file and
        // store it in the blob directory. We store directly via the
        // storeAttachment procedure and update the attachments state
        // manually — we must NOT use addFileAttachment here because it would
        // insert a second (regular) attachment node into the editor.
        const tabId = element.tabId;
        const url = tabId
          ? ((
              document.querySelector<HTMLElement>(
                `[data-tab-id="${tabId}"]`,
              ) as any
            )?.dataset?.url ?? undefined)
          : undefined;
        const swdom = selectedElementToSwDomElement(element, {
          tabId,
          url,
        });
        const tagName = (
          element.nodeType ||
          element.tagName ||
          'element'
        ).toLowerCase();
        const domId = element.attributes?.id
          ? `_${element.attributes.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20)}`
          : '';
        const fileName = `${tagName}${domId}.swdomelement`;
        const screenshotFileName = `${tagName}${domId}.screenshot.webp`;

        if (openAgent) {
          // Capture screenshot in parallel with building the swdom JSON.
          // The screenshot is stored as a separate WebP blob; its blob key
          // is written into the .swdomelement JSON so the backend can
          // locate the image when constructing multimodal prompts.
          const screenshotPromise =
            element.boundingClientRect && tabId
              ? captureAndStoreElementScreenshot(
                  openAgent,
                  tabId,
                  {
                    top: element.boundingClientRect.top,
                    left: element.boundingClientRect.left,
                    width: element.boundingClientRect.width,
                    height: element.boundingClientRect.height,
                  },
                  element.isMainFrame ?? true,
                  element.frameId,
                  screenshotFileName,
                ).catch((err: unknown) => {
                  console.warn(
                    '[panel-footer] Screenshot capture failed (non-fatal):',
                    err,
                  );
                  return null;
                })
              : Promise.resolve(null);

          screenshotPromise
            .then((screenshotBlobKey) => {
              // Set screenshot blob key on the swdom before serializing
              if (screenshotBlobKey) {
                swdom.screenshot = screenshotBlobKey;
                // Update the TipTap node so the badge can show the thumbnail
                chatInputRef.current?.updateAttachmentAttrs(attrs.id, {
                  screenshotBlobKey,
                });
              }
              const json = JSON.stringify(swdom);
              const base64 = btoa(
                new TextEncoder()
                  .encode(json)
                  .reduce((s, b) => s + String.fromCharCode(b), ''),
              );
              return storeAttachment(openAgent, fileName, base64);
            })
            .then((blobKey: string) => {
              const blobPath = `att/${blobKey}`;
              setFileAttachments((prev) => [
                ...prev,
                { path: blobPath, originalFileName: fileName },
              ]);
              // Update the TipTap node with the blob path so renderText
              // can emit the correct `[](path:att/<blobKey>)` link.
              chatInputRef.current?.updateAttachmentAttrs(attrs.id, {
                blobPath,
              });
            })
            .catch((err: unknown) => {
              console.error(
                '[panel-footer] Failed to store .swdomelement blob:',
                err,
              );
            });
        }
      },
      [
        chatInputRef,
        openAgent,
        storeAttachment,
        captureAndStoreElementScreenshot,
        setFileAttachments,
      ],
    ),
  });

  const allowUserInput = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.allowUserInput : false,
  );
  if (!allowUserInput) return null;

  return (
    <footer className="z-20 flex shrink-0 flex-col items-stretch gap-1 px-1 pb-1">
      <div
        className={cn(
          'relative flex flex-row items-stretch gap-1 rounded-md bg-background p-2 shadow-elevation-1 ring-1 ring-derived-strong transition-colors dark:bg-surface-1',
          isDragOver && 'bg-hover-derived!',
        )}
        id="chat-input-container-box"
        data-chat-active={chatInputActive}
        onKeyDown={(e) => {
          // Shift-Tab from chat input → jump to last question in status card form
          if (
            e.key === 'Tab' &&
            e.shiftKey &&
            !(e.target as HTMLElement).closest('[data-status-card]')
          ) {
            const card = e.currentTarget.querySelector('[data-status-card]');
            const questions = card?.querySelectorAll('[data-question]');
            const last = questions?.[questions.length - 1];
            if (last) {
              e.preventDefault();
              const focusable =
                last.querySelector<HTMLElement>('button[data-checked]') ??
                last.querySelector<HTMLElement>(
                  'input:not([tabindex="-1"]), button, [role="radio"], [role="checkbox"]',
                );
              focusable?.focus();
            }
          }
        }}
        onDragEnter={dragHandlers.onDragEnter}
        onDragLeave={dragHandlers.onDragLeave}
        onDragOver={dragHandlers.onDragOver}
        onDrop={dragHandlers.onDropBubble} // Reset drag state, let event bubble to ChatPanel
      >
        <ChatInput
          key={openAgent}
          ref={chatInputRef as RefObject<ChatInputHandle>}
          value={localInputState}
          onChange={updateChatInputState}
          onSubmit={handleSubmit}
          disabled={!enableInputField}
          placeholder={
            hasPendingQuestion ? 'Write a message instead' : undefined
          }
          attachmentCount={fileAttachments.length}
          showModelSelect
          onModelChange={() => chatInputRef.current?.focus()}
          showContextUsageRing={
            !!usedTokens && (isVerboseMode || contextUsed > 80)
          }
          contextUsedPercentage={contextUsed}
          contextUsedKb={usedTokens ? usedTokens / 1000 : 0}
          contextMaxKb={maxTokens ? maxTokens / 1000 : 0}
          hasQueuedMessages={(queuedMessages?.length ?? 0) > 0}
          onFlushQueue={handleFlushQueue}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          onEscape={handleEscape}
          onPasteFiles={handlePasteFiles}
          onAttachmentRemoved={handleAttachmentRemoved}
          mentionContext={mentionContext}
          slashCommands={slashCommands}
        />
        <ChatInputActions
          isAgentWorking={isWorking}
          hasPendingQuestion={hasPendingQuestion}
          onStop={stableAbortAgent}
          showElementSelectorButton
          elementSelectionActive={elementSelectionActive}
          onToggleElementSelection={handleToggleElementSelection}
          elementSelectorDisabled={hasOpenedInternalPage}
          showImageUploadButton
          onAddFileAttachment={handleAddFileAttachment}
          canSendMessage={effectiveCanSendMessage}
          onSubmit={handleSubmit}
        />
        <StatusCard />
      </div>
    </footer>
  );
}
