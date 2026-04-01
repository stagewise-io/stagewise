import {
  type ReactNode,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
} from 'react';
import { Virtuoso } from 'react-virtuoso';
import { MessageUser } from './message-user';
import { MessageAssistant } from './message-assistant';
import { MessageLoading } from './message-loading';
import { MessageRuntimeError } from './message-runtime-error';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useTrack } from '@ui/hooks/use-track';
import { cn } from '@ui/utils';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import { useAutoScroll } from '@ui/hooks/use-auto-scroll';
import { ChatSuggestion, suggestions } from '@ui/components/suggestions';
import { useMessageEditState } from '@ui/hooks/use-message-edit-state';
import { useScrollbarWidth } from '@ui/hooks/use-scrollbar-width';
import { AttachmentMetadataProvider } from '@ui/hooks/use-attachment-metadata';
import { MountedPathsProvider } from '@ui/hooks/use-mounted-paths';
import { MessageBrowserContextProvider } from '@ui/hooks/use-message-browser-context';
import type {
  Mount,
  BrowserTabSnapshot,
} from '@shared/karton-contracts/ui/agent/metadata';
import { isEmptyAssistantMessage, areAllPartsSettled } from './message-utils';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { calculateChatItemHeights } from '@ui/utils/calculate-chat-item-height';

// Stable empty array to avoid infinite re-renders with useSyncExternalStore
const EMPTY_HISTORY: AgentMessage[] = [];

// Extended type for optimistic messages (includes flag for UI distinction)
type OptimisticMessage = AgentMessage & {
  _optimistic?: boolean;
  _clientId: string; // Client-generated ID for matching
};

// Custom event types for optimistic messaging
declare global {
  interface WindowEventMap {
    'chat-message-sent': CustomEvent<{ message: AgentMessage }>;
    'chat-message-failed': CustomEvent<{ clientId: string }>;
    'chat-message-edited': CustomEvent<{
      replacedMessageId: string;
      newMessage: AgentMessage;
    }>;
    'chat-restore-checkpoint': CustomEvent<{
      assistantMessageId: string;
      undoToolCalls: boolean;
    }>;
  }
}

// Helper to extract text content from a message for matching
function getMessageTextContent(message: AgentMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export const ChatHistory = () => {
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const scrollbarWidth = useScrollbarWidth();

  // Ref to store latest containerHeight for use in callback ref (avoids stale closure)
  const containerHeightRef = useRef(0);
  // Ref to store computed spacer height (direct DOM mutation only, no state)
  const spacerHeightRef = useRef(0);

  const paddingRight = useMemo(() => {
    return scrollbarWidth === 0 ? 18 : 5;
  }, [scrollbarWidth]);

  // Element refs for direct measurement in useLayoutEffect
  const lastUserElementRef = useRef<HTMLDivElement | null>(null);
  const lastAssistantElementRef = useRef<HTMLDivElement | null>(null);

  // Extracted measurement function - called from both callback ref and useLayoutEffect
  // Uses direct DOM mutation only (no state) to avoid extra re-renders and flickering
  const updateSpacerHeight = useCallback(() => {
    const userMessageHeight =
      lastUserElementRef.current?.getBoundingClientRect().height ?? 0;
    const currentContainerHeight = containerHeightRef.current;
    const minHeight = Math.max(
      0,
      currentContainerHeight - (userMessageHeight + 10),
    );
    // Store in ref for potential future use
    spacerHeightRef.current = minHeight;
    // Direct DOM mutation - applies immediately before paint
    if (lastAssistantElementRef.current)
      lastAssistantElementRef.current.style.minHeight = `${minHeight}px`;
  }, []);

  // Callback ref for last user message - stores element for measurement AND triggers height update
  const lastUserMessageRef = useCallback(
    (node: HTMLDivElement | null) => {
      lastUserElementRef.current = node;
      // Trigger height measurement when a new element is mounted
      if (node) updateSpacerHeight();
    },
    [updateSpacerHeight],
  );

  // Callback ref for last assistant message - stores element for measurement AND triggers height update
  const lastAssistantMessageRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Only clear minHeight and update ref when a NEW element takes over (not when ref is detached)
      // When node is null (ref detached), keep the old element reference so we can continue
      // applying the spacer to it. This prevents flicker when user message is last.
      if (node) {
        // Clear minHeight from the previous element when a new one takes over
        if (
          lastAssistantElementRef.current &&
          lastAssistantElementRef.current !== node
        ) {
          lastAssistantElementRef.current.style.minHeight = '';
        }
        lastAssistantElementRef.current = node;
        updateSpacerHeight();
      }
      // When node is null, intentionally keep lastAssistantElementRef.current unchanged
      // so updateSpacerHeight can still apply the spacer to the previous assistant message
    },
    [updateSpacerHeight],
  );

  // Auto-scroll hook
  const {
    scrollerRef: autoScrollRef,
    isAutoScrollEnabled,
    scrollToBottom,
    forceEnableAutoScroll,
  } = useAutoScroll({
    scrollEndThreshold: 100,
  });

  // Track scroller element for spacerHeight calculation
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const scrollerRef = useCallback(
    (element: HTMLElement | Window | null) => {
      // Chain to auto-scroll hook
      autoScrollRef(element);
      // Store element for local use (spacerHeight, etc.)
      if (element instanceof HTMLElement) {
        setScroller(element);
      } else {
        setScroller(null);
      }
    },
    [autoScrollRef],
  );

  const { activeEditMessageId } = useMessageEditState();
  const createTab = useKartonProcedure((s) => s.browser.createTab);
  const sendUserMessage = useKartonProcedure((s) => s.agents.sendUserMessage);
  const track = useTrack();
  const retryLastUserMessage = useKartonProcedure(
    (s) => s.agents.retryLastUserMessage,
  );
  const clearPendingOnboardingSuggestion = useKartonProcedure(
    (s) => s.userExperience.clearPendingOnboardingSuggestion,
  );
  const [openAgent] = useOpenAgent();
  const pendingSuggestion = useKartonState(
    (s) => s.userExperience.pendingOnboardingSuggestion,
  );
  const isWorking = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.state.isWorking : false,
  );
  const history = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.history ?? EMPTY_HISTORY)
      : EMPTY_HISTORY,
  );
  const error = useKartonState((s) =>
    openAgent ? s.agents.instances[openAgent]?.state.error : undefined,
  );
  const [removedSuggestionIds, setRemovedSuggestionIds] = useState<Set<string>>(
    new Set(),
  );

  // Auto-start agent when a suggestion was selected during onboarding.
  // Ref guard prevents StrictMode's double-invocation from sending twice.
  const pendingSuggestionConsumedRef = useRef(false);
  useEffect(() => {
    if (!pendingSuggestion || !openAgent) return;
    if (pendingSuggestionConsumedRef.current) return;
    pendingSuggestionConsumedRef.current = true;
    const { url, prompt } = pendingSuggestion;
    void (async () => {
      await createTab(url);
      await sendUserMessage(openAgent, {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: prompt }],
      });
      await clearPendingOnboardingSuggestion();
    })();
  }, [pendingSuggestion, openAgent]);

  // Track container height to set the spacer
  useEffect(() => {
    let rafId: number;
    let resizeObserver: ResizeObserver | null = null;
    const checkViewport = () => {
      if (!scroller) {
        rafId = requestAnimationFrame(checkViewport);
        return;
      }
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newHeight = entry.contentRect.height;
          const newWidth = entry.contentRect.width;
          containerHeightRef.current = newHeight;
          setContainerHeight(newHeight);
          setContainerWidth(newWidth);
          if (isAutoScrollEnabled()) updateSpacerHeight();
        }
      });
      resizeObserver.observe(scroller);
    };
    checkViewport();
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
    };
  }, [isAutoScrollEnabled, scrollToBottom, scroller]);

  // Shuffle suggestions once on mount using Fisher-Yates algorithm
  const [shuffledSuggestions] = useState(() => {
    const shuffled = [...suggestions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]!] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  });

  const visibleSuggestions = useMemo(() => {
    return shuffledSuggestions
      .filter((s) => !removedSuggestionIds.has(s.id))
      .slice(0, 3);
  }, [removedSuggestionIds, shuffledSuggestions]);

  const handleRemoveSuggestion = (id: string) => {
    setRemovedSuggestionIds((prev) => new Set([...Array.from(prev), id]));
  };

  // All messages after filtering and merging consecutive assistant messages.
  // Preserves object identity for messages that haven't changed so Virtuoso
  // can skip re-rendering them.
  const prevServerMessagesRef = useRef<AgentMessage[]>([]);
  const serverMessages = useMemo(() => {
    if (!history) {
      prevServerMessagesRef.current = [];
      return [];
    }

    const newMessages = history
      .filter(
        (message) => message.role === 'user' || message.role === 'assistant',
      )
      .reduce<AgentMessage[]>((curr, message) => {
        const lastMessage = curr[curr.length - 1];

        if (lastMessage?.role === 'assistant' && message.role === 'assistant') {
          const prevPartsLength = lastMessage.parts.length;
          lastMessage.parts = [...lastMessage.parts, ...message.parts];

          const incoming = message.metadata?.partsMetadata;
          if (incoming?.length) {
            const merged = [...(lastMessage.metadata?.partsMetadata ?? [])];
            for (let i = 0; i < incoming.length; i++)
              merged[prevPartsLength + i] = incoming[i]!;
            lastMessage.metadata = {
              ...lastMessage.metadata!,
              partsMetadata: merged,
            };
          }
        } else {
          curr.push({ ...message, parts: [...message.parts] });
        }

        return curr;
      }, []);

    // Reuse previous objects for messages that haven't changed.
    // During streaming only the last message mutates (new parts or last
    // part content updated).  Earlier messages keep their Immer identity
    // in the source history, so matching by ID is sufficient.
    const prev = prevServerMessagesRef.current;
    for (let i = 0; i < newMessages.length - 1; i++) {
      const prevMsg = prev[i];
      if (prevMsg && prevMsg.id === newMessages[i]!.id) {
        newMessages[i] = prevMsg;
      }
    }

    prevServerMessagesRef.current = newMessages;
    return newMessages;
  }, [history]);

  // For each user/assistant message, check if any subsequent messages contain
  // file-modifying tool outputs (detected via _diff or _hasFileWrites markers).
  // Uses a single reverse scan so the check is O(n) overall.
  const hasFileModsAfterMap = useMemo(() => {
    const result = new Map<string, boolean>();
    let suffixHasFileMods = false;
    for (let i = serverMessages.length - 1; i >= 0; i--) {
      const msg = serverMessages[i];
      if (!msg) continue;
      if (msg.role === 'user') result.set(msg.id, suffixHasFileMods);
      else if (msg.role === 'assistant') {
        result.set(msg.id, suffixHasFileMods);
        if (
          !suffixHasFileMods &&
          msg.parts.some((part) => {
            if (!part.type.startsWith('tool-')) return false;
            const toolPart = part as { state: string; output?: unknown };
            if (toolPart.state !== 'output-available') return false;
            const output = toolPart.output as
              | Record<string, unknown>
              | undefined;
            return (
              output != null &&
              ('_diff' in output || '_hasFileWrites' in output)
            );
          })
        ) {
          suffixHasFileMods = true;
        }
      }
    }
    return result;
  }, [serverMessages]);

  // Optimistic messages - shown immediately before server confirms
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);

  // Track message IDs that are being replaced (for edit mode)
  // All messages from this ID onwards should be hidden until server confirms
  const [replacedMessageId, setReplacedMessageId] = useState<string | null>(
    null,
  );

  // Clear optimistic state when switching agents
  useEffect(() => {
    setOptimisticMessages([]);
    setReplacedMessageId(null);
    pendingWorkingRef.current = false;
  }, [openAgent]);

  // Reconciliation: Remove optimistic messages that have been confirmed by server
  // We match by text content since server generates new IDs
  // useLayoutEffect ensures reconciliation runs BEFORE paint, preventing
  // a frame where both optimistic and server-confirmed messages are visible
  useLayoutEffect(() => {
    if (optimisticMessages.length === 0 && replacedMessageId === null) return;

    // Exclude the message being replaced — its text could match the
    // optimistic replacement and cause premature "confirmation".
    const serverUserMessages = serverMessages.filter(
      (m) => m.role === 'user' && m.id !== replacedMessageId,
    );

    // Check each optimistic message to see if it's been confirmed
    const confirmedClientIds: string[] = [];
    for (const opt of optimisticMessages) {
      const optText = getMessageTextContent(opt);
      // Find a server message with matching text content
      const isConfirmed = serverUserMessages.some(
        (server) => getMessageTextContent(server) === optText,
      );
      if (isConfirmed) confirmedClientIds.push(opt._clientId);
    }

    // Remove confirmed messages from optimistic state
    if (confirmedClientIds.length > 0)
      setOptimisticMessages((prev) =>
        prev.filter((m) => !confirmedClientIds.includes(m._clientId)),
      );

    // Clear replacedMessageId when the replaced message no longer exists in server state
    // This indicates the server has processed the edit
    if (replacedMessageId !== null) {
      const replacedStillExists = serverMessages.some(
        (m) => m.id === replacedMessageId,
      );
      if (!replacedStillExists) setReplacedMessageId(null);
    }
  }, [serverMessages, optimisticMessages, replacedMessageId]);

  // Merge server messages with optimistic messages for display
  // For edit mode: filter out the replaced message and all messages after it
  const filteredMessages = useMemo(() => {
    let displayMessages = serverMessages;

    // If a message is being replaced (edit mode), hide it and all subsequent messages
    if (replacedMessageId !== null) {
      const replaceIndex = displayMessages.findIndex(
        (m) => m.id === replacedMessageId,
      );
      // Keep only messages before the replaced one
      if (replaceIndex !== -1)
        displayMessages = displayMessages.slice(0, replaceIndex);
    }

    // Append optimistic messages
    if (optimisticMessages.length > 0)
      return [...displayMessages, ...optimisticMessages];

    return displayMessages;
  }, [serverMessages, optimisticMessages, replacedMessageId]);

  const prevResolvedMountsRef = useRef<Mount[]>([]);
  const resolvedMounts = useMemo<Mount[]>(() => {
    const mountsByPrefix = new Map<string, Mount>();
    for (const msg of filteredMessages) {
      const mounts = msg?.metadata?.environmentSnapshot?.workspace?.mounts;
      if (!mounts) continue;
      for (const mount of mounts) {
        if (!mountsByPrefix.has(mount.prefix)) {
          mountsByPrefix.set(mount.prefix, mount);
        }
      }
    }
    const next = Array.from(mountsByPrefix.values());
    const prev = prevResolvedMountsRef.current;
    // Preserve reference identity when mount data hasn't changed
    if (
      prev.length === next.length &&
      prev.every(
        (m, i) => m.prefix === next[i]!.prefix && m.path === next[i]!.path,
      )
    ) {
      return prev;
    }
    prevResolvedMountsRef.current = next;
    return next;
  }, [filteredMessages]);

  // Cache for height calculations - keyed by message ID + parts length + width
  // This prevents recalculating heights for stable messages during streaming
  const heightCacheRef = useRef<Map<string, number>>(new Map());

  // Calculate estimated heights for Virtuoso (with caching for performance)
  const estimatedHeights = useMemo(() => {
    if (filteredMessages.length === 0 || containerWidth === 0) return [];

    const DEFAULT_STREAMING_HEIGHT = 200;
    const cache = heightCacheRef.current;

    // Find the last user message index to calculate spacer height
    let lastUserMsgIdx = -1;
    for (let i = filteredMessages.length - 1; i >= 0; i--) {
      if (filteredMessages[i]?.role === 'user') {
        lastUserMsgIdx = i;
        break;
      }
    }

    // Estimate the last user message height for spacer calculation
    let estimatedLastUserMsgHeight = 50;
    if (lastUserMsgIdx >= 0) {
      const userMsg = filteredMessages[lastUserMsgIdx]!;
      const userCacheKey = `${userMsg.id}:${userMsg.parts.length}:${containerWidth}`;
      if (cache.has(userCacheKey))
        estimatedLastUserMsgHeight = cache.get(userCacheKey)!;
      else {
        const heights = calculateChatItemHeights([userMsg], containerWidth);
        estimatedLastUserMsgHeight = heights[0] ?? 50;
      }
    }

    // Calculate spacer height (same logic as updateSpacerHeight)
    // Spacer fills remaining viewport: containerHeight - userMessageHeight - 10
    const spacerHeight = Math.max(
      0,
      containerHeight - estimatedLastUserMsgHeight - 10,
    );

    return filteredMessages.map((msg, index) => {
      const isLastMsg = index === filteredMessages.length - 1;

      // For the last message while agent is working, use default + spacer
      if (isLastMsg && isWorking)
        return DEFAULT_STREAMING_HEIGHT + spacerHeight;

      // Create cache key from message ID + parts count + width
      const cacheKey = `${msg.id}:${msg.parts.length}:${containerWidth}`;

      // Get base height (cached or calculated)
      let height: number;
      if (cache.has(cacheKey)) height = cache.get(cacheKey)!;
      else {
        const heights = calculateChatItemHeights([msg], containerWidth);
        height = heights[0] ?? 100;
        cache.set(cacheKey, height);
      }
      // Add spacer height to the last message
      if (isLastMsg) height += spacerHeight;

      return height;
    });
  }, [filteredMessages, containerWidth, containerHeight, isWorking, error]);

  // Calculate average estimated height for defaultItemHeight

  // Track when user sends a message - we'll enable auto-scroll once the message is in DOM
  const pendingAutoScrollRef = useRef(false);
  const prevMessagesLengthRef = useRef(filteredMessages.length);

  // Bridge the gap between optimistic message removal and isWorking becoming true.
  // Set when an optimistic message is sent, cleared when isWorking flips to true.
  const pendingWorkingRef = useRef(false);

  // Listen for message-sent event with message data - add to optimistic state immediately
  useEffect(() => {
    const handleMessageSent = (e: CustomEvent<{ message: AgentMessage }>) => {
      const message = e.detail.message;
      // Add to optimistic messages immediately for instant rendering
      const optimisticMsg: OptimisticMessage = {
        ...message,
        _optimistic: true,
        _clientId: message.id, // Use original ID as client ID for matching
      };
      setOptimisticMessages((prev) => [...prev, optimisticMsg]);
      pendingAutoScrollRef.current = true;
      pendingWorkingRef.current = true;
    };

    const handleMessageFailed = (e: CustomEvent<{ clientId: string }>) => {
      // Remove failed optimistic message and clear replaced state
      setOptimisticMessages((prev) =>
        prev.filter((m) => m._clientId !== e.detail.clientId),
      );
      setReplacedMessageId(null);
      pendingWorkingRef.current = false;
    };

    const handleMessageEdited = (
      e: CustomEvent<{ replacedMessageId: string; newMessage: AgentMessage }>,
    ) => {
      const { replacedMessageId: replaceId, newMessage } = e.detail;
      // Mark the old message (and all after it) for hiding
      setReplacedMessageId(replaceId);
      // Add the new edited message as optimistic, reusing the replaced
      // message's ID so Virtuoso sees an in-place update (same key) instead
      // of a remove+add, which avoids a one-frame gap.
      const optimisticMsg: OptimisticMessage = {
        ...newMessage,
        id: replaceId,
        _optimistic: true,
        _clientId: newMessage.id,
      };
      setOptimisticMessages((prev) => [...prev, optimisticMsg]);
      pendingAutoScrollRef.current = true;
      pendingWorkingRef.current = true;
    };

    window.addEventListener('chat-message-sent', handleMessageSent);
    window.addEventListener('chat-message-failed', handleMessageFailed);
    window.addEventListener('chat-message-edited', handleMessageEdited);
    return () => {
      window.removeEventListener('chat-message-sent', handleMessageSent);
      window.removeEventListener('chat-message-failed', handleMessageFailed);
      window.removeEventListener('chat-message-edited', handleMessageEdited);
    };
  }, []);

  // Enable auto-scroll ONLY when new message is actually in the DOM
  useLayoutEffect(() => {
    const prevLength = prevMessagesLengthRef.current;
    const currentLength = filteredMessages.length;
    prevMessagesLengthRef.current = currentLength;

    // Trigger auto-scroll when:
    // 1. Messages increased (new message added) AND we were waiting to auto-scroll
    // 2. OR we're in edit mode (replacedMessageId set) AND pending scroll
    //    (edit mode may decrease length but we still want to scroll)
    const shouldTrigger =
      pendingAutoScrollRef.current &&
      (currentLength > prevLength || replacedMessageId !== null);

    if (shouldTrigger) {
      pendingAutoScrollRef.current = false;
      forceEnableAutoScroll();
      // Also scroll immediately - the MutationObserver may have already fired
      // while auto-scroll was disabled, so we need to scroll manually
      scrollToBottom();
    }
  }, [
    filteredMessages.length,
    replacedMessageId,
    forceEnableAutoScroll,
    scrollToBottom,
  ]);

  // Scroll to bottom when an error appears so it's always visible
  useEffect(() => {
    if (error) {
      forceEnableAutoScroll();
      scrollToBottom();
    }
  }, [error, forceEnableAutoScroll, scrollToBottom]);

  // Clear pending-working bridge once isWorking catches up
  if (isWorking) pendingWorkingRef.current = false;

  // Show "Working..." after user message or empty assistant message.
  // Also show immediately for optimistic user messages before isWorking flips.
  const showWorkingIndicator = useMemo(() => {
    const lastMessage = filteredMessages[filteredMessages.length - 1];
    if (!lastMessage) return false;
    const isOptimistic =
      (lastMessage as OptimisticMessage)._optimistic === true;
    const isPendingWorking = pendingWorkingRef.current;
    if (lastMessage.role === 'user' && (isOptimistic || isPendingWorking))
      return true;
    if (!isWorking) return false;
    if (lastMessage.role === 'user') return true;
    if (
      lastMessage.role === 'assistant' &&
      isEmptyAssistantMessage(lastMessage)
    )
      return true;
    return false;
  }, [isWorking, filteredMessages]);

  // Show between-steps indicator inside the last assistant message
  const showBetweenStepsIndicator = useMemo(() => {
    if (!isWorking) return false;
    const lastMessage = filteredMessages[filteredMessages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') return false;
    if (isEmptyAssistantMessage(lastMessage)) return false;
    return areAllPartsSettled(lastMessage);
  }, [isWorking, filteredMessages]);

  // Find the index of the last user message (for attaching measurement ref)
  const lastUserMsgIndex = useMemo(() => {
    for (let i = filteredMessages.length - 1; i >= 0; i--)
      if (filteredMessages[i]?.role === 'user') return i;

    return -1;
  }, [filteredMessages]);

  // --- Refs for itemContent stabilisation ---
  // These mirror frequently-changing derived values so that the
  // itemContent callback can read them at call time without including
  // them in its dependency array.  This keeps the callback identity
  // stable during streaming, which prevents Virtuoso from re-invoking
  // it for every visible item on each chunk.
  const filteredMessagesRef = useRef(filteredMessages);
  filteredMessagesRef.current = filteredMessages;
  const lastUserMsgIndexRef = useRef(lastUserMsgIndex);
  lastUserMsgIndexRef.current = lastUserMsgIndex;
  const hasFileModsAfterMapRef = useRef(hasFileModsAfterMap);
  hasFileModsAfterMapRef.current = hasFileModsAfterMap;
  const showWorkingIndicatorRef = useRef(showWorkingIndicator);
  showWorkingIndicatorRef.current = showWorkingIndicator;
  const showBetweenStepsIndicatorRef = useRef(showBetweenStepsIndicator);
  showBetweenStepsIndicatorRef.current = showBetweenStepsIndicator;
  const canRetryRef = useRef(false); // updated below after canRetry is defined
  const errorRef = useRef(error);
  errorRef.current = error;
  const isWorkingRef = useRef(isWorking);
  isWorkingRef.current = isWorking;

  // Cache browser context per message ID so the same value object is reused
  // across streaming chunks.  Environment snapshots are baked into message
  // metadata and never change for a given position, so the cache is safe.
  const browserContextCacheRef = useRef(
    new Map<
      string,
      {
        sessionId: string | null;
        tabs: Map<string, BrowserTabSnapshot> | null;
      }
    >(),
  );

  // Set spacer height synchronously before paint
  useLayoutEffect(() => {
    // Update ref so callback ref can access latest value
    containerHeightRef.current = containerHeight;
    updateSpacerHeight();
  }, [
    activeEditMessageId,
    containerHeight,
    filteredMessages.length,
    updateSpacerHeight,
  ]);

  // Calculate if retry is possible (error exists, not working, and last message is user)
  const canRetry = useMemo(() => {
    if (!error || isWorking) return false;
    const lastMessage = filteredMessages[filteredMessages.length - 1];
    return lastMessage?.role === 'user';
  }, [error, isWorking, filteredMessages]);
  canRetryRef.current = canRetry;

  // Render individual message item.
  // All frequently-changing values (filteredMessages, isWorking, error,
  // showWorkingIndicator, etc.) are read from refs at call time so the
  // callback identity stays stable during streaming.  Virtuoso only
  // re-invokes this for items whose `data[index]` reference changed.
  // --- Element cache for settled messages ---
  // Virtuoso calls itemContent for ALL visible items whenever data changes.
  // By caching the ReactNode for settled messages, we return the exact same
  // object reference.  React sees === and skips the entire subtree instantly
  // (no memo comparison, no reconciliation, zero overhead).
  const elementCacheRef = useRef(new Map<string, ReactNode>());
  const cacheGenRef = useRef(0);
  const cacheGen = useMemo(() => {
    // Invalidate cache when structural layout properties change.
    // During streaming none of these change, so the cache stays valid.
    elementCacheRef.current.clear();
    return ++cacheGenRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMessages.length, paddingRight, openAgent, isWorking]);
  // Keep the gen ref in sync (unused directly, but ensures the dep is used)
  cacheGenRef.current = cacheGen;

  const itemContent = useCallback(
    (index: number, message: AgentMessage) => {
      const msgs = filteredMessagesRef.current;
      const isLastMessage = index === msgs.length - 1;

      // Short-circuit: return cached React element for settled (non-last)
      // messages.  React sees the same object reference (===) and skips
      // the entire subtree — no memo comparison, no reconciliation.
      const elCache = elementCacheRef.current;
      if (!isLastMessage) {
        const cached = elCache.get(message.id);
        if (cached) return cached;
      }

      const isLastUserMessage = index === lastUserMsgIndexRef.current;
      const isLastAssistantMessage =
        isLastMessage && message.role === 'assistant';
      const curIsWorking = isWorkingRef.current ?? false;
      const curError = errorRef.current;
      const curShowWorking = showWorkingIndicatorRef.current;
      const curShowBetweenSteps = showBetweenStepsIndicatorRef.current;
      const curCanRetry = canRetryRef.current;
      const curHasFileMods = hasFileModsAfterMapRef.current;

      // Resolve browser context — reuse cached value when available so the
      // context provider value identity stays stable across streaming chunks.
      const ctxCache = browserContextCacheRef.current;
      let browserCtx = ctxCache.get(message.id);
      if (!browserCtx) {
        let messageBrowserSessionId: string | null = null;
        let messageTabs: Map<string, BrowserTabSnapshot> | null = null;
        for (let i = index; i >= 0; i--) {
          const snapshot = msgs[i]?.metadata?.environmentSnapshot;
          if (snapshot !== undefined) {
            if (
              messageBrowserSessionId === null &&
              snapshot.browserSessionId !== undefined
            )
              messageBrowserSessionId = snapshot.browserSessionId;
            if (messageTabs === null && snapshot.browser?.tabs) {
              messageTabs = new Map(
                snapshot.browser.tabs.map((t) => [t.id, t]),
              );
            }
            if (messageBrowserSessionId !== null && messageTabs !== null) break;
          }
        }
        browserCtx = {
          sessionId: messageBrowserSessionId,
          tabs: messageTabs,
        };
        ctxCache.set(message.id, browserCtx);
      }

      const messageComponent = (
        <MessageBrowserContextProvider value={browserCtx}>
          {message.role === 'user' ? (
            <MessageUser
              message={message as AgentMessage & { role: 'user' }}
              isLastMessage={isLastMessage}
              isWorking={curIsWorking}
              hasSubsequentFileModifications={
                curHasFileMods.get(message.id) ?? false
              }
            />
          ) : (
            <MessageAssistant
              message={message as AgentMessage & { role: 'assistant' }}
              isLastMessage={isLastMessage}
              isWorking={curIsWorking}
              showBetweenStepsIndicator={
                isLastMessage ? curShowBetweenSteps : false
              }
              hasSubsequentFileModifications={
                curHasFileMods.get(message.id) ?? false
              }
            />
          )}
        </MessageBrowserContextProvider>
      );

      // Attach ref to last assistant message wrapper for height measurement
      // minHeight is set directly via DOM mutation in the callback ref (no React state)
      if (isLastAssistantMessage)
        return (
          <div
            ref={lastAssistantMessageRef}
            className="flex flex-col pb-[calc(64px+var(--status-card-height,0px))] pl-4"
            style={{ paddingRight }}
          >
            <div className="mx-auto w-full max-w-3xl">
              {messageComponent}
              {curShowWorking && <MessageLoading />}
              {curError && isLastMessage && openAgent && (
                <MessageRuntimeError
                  agentInstanceId={openAgent}
                  error={curError}
                  canRetry={curCanRetry}
                  onRetry={() => void retryLastUserMessage(openAgent)}
                />
              )}
            </div>
          </div>
        );

      // Attach ref to last user message wrapper for height measurement
      // When user message is the ACTUAL last message, we need a spacer element AFTER it
      if (isLastUserMessage && isLastMessage) {
        return (
          <div
            className={cn('flex flex-col pl-4', index === 0 && 'pt-2.5')}
            style={{ paddingRight }}
          >
            <div className="mx-auto w-full max-w-3xl">
              <div ref={lastUserMessageRef}>{messageComponent}</div>
              {/* Spacer element receives minHeight to fill viewport below user message.
                  Error card and loading indicator live INSIDE the spacer (same pattern
                  as the assistant branch) so they don't overflow the measured area. */}
              <div
                ref={lastAssistantMessageRef}
                style={{ minHeight: spacerHeightRef.current }}
              >
                {curShowWorking && <MessageLoading />}
                {curError && isLastMessage && openAgent && (
                  <MessageRuntimeError
                    agentInstanceId={openAgent}
                    error={curError}
                    canRetry={curCanRetry}
                    onRetry={() => void retryLastUserMessage(openAgent)}
                  />
                )}
              </div>
            </div>
          </div>
        );
      }

      // Last user message but NOT the last message overall (assistant came after)
      if (isLastUserMessage) {
        const el = (
          <div
            className={cn('flex flex-col pl-4', index === 0 && 'pt-2.5')}
            style={{ paddingRight }}
          >
            <div className="mx-auto w-full max-w-3xl">
              <div ref={lastUserMessageRef}>{messageComponent}</div>
            </div>
          </div>
        );
        elCache.set(message.id, el);
        return el;
      }

      const el = (
        <div
          className={cn('pl-4', index === 0 && 'pt-2.5')}
          style={{ paddingRight }}
        >
          <div className="mx-auto w-full max-w-3xl">
            {messageComponent}
            {curError && isLastMessage && openAgent && (
              <MessageRuntimeError
                agentInstanceId={openAgent}
                error={curError}
                canRetry={curCanRetry}
                onRetry={() => void retryLastUserMessage(openAgent)}
              />
            )}
          </div>
        </div>
      );
      if (!isLastMessage) elCache.set(message.id, el);
      return el;
    },
    [
      paddingRight,
      lastUserMessageRef,
      lastAssistantMessageRef,
      openAgent,
      retryLastUserMessage,
    ],
  );

  // Empty state component for suggestions
  const EmptyPlaceholder = useCallback(() => {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-1 px-4 pb-[calc(8px+var(--status-card-height,0px))] text-sm">
        {visibleSuggestions.map((suggestion) => (
          <ChatSuggestion
            key={suggestion.id}
            {...suggestion}
            onClick={async () => {
              if (!openAgent) return;
              track('suggestion-clicked', {
                suggestion_id: suggestion.id,
                context: 'empty-chat',
              });
              await createTab(suggestion.origin.url);
              await sendUserMessage(openAgent, {
                id: crypto.randomUUID(),
                role: 'user',
                parts: [
                  {
                    type: 'text',
                    text: suggestion.prompt,
                  },
                ],
              });
            }}
            onRemove={() => handleRemoveSuggestion(suggestion.id)}
          />
        ))}
      </div>
    );
  }, [visibleSuggestions, createTab, sendUserMessage, track]);

  // If no messages, show empty state directly
  if (filteredMessages.length === 0) {
    return (
      <MountedPathsProvider value={resolvedMounts}>
        <AttachmentMetadataProvider messages={filteredMessages}>
          <section
            aria-label="Agent message display"
            className={cn(
              'pointer-events-auto mb-1 block h-max min-h-[inherit] text-foreground text-sm focus-within:outline-none focus:outline-none',
            )}
          >
            {EmptyPlaceholder()}
          </section>
        </AttachmentMetadataProvider>
      </MountedPathsProvider>
    );
  }

  return (
    <MountedPathsProvider value={resolvedMounts}>
      <AttachmentMetadataProvider messages={filteredMessages}>
        <Virtuoso
          initialTopMostItemIndex={Math.max(0, filteredMessages.length - 2)}
          style={{ scrollbarGutter: 'stable' }}
          key={openAgent ?? 'no-chat'}
          data={filteredMessages}
          className="scrollbar-hover-only virtuoso-contain -mr-[2px]"
          scrollerRef={scrollerRef}
          increaseViewportBy={{ top: 400, bottom: 400 }} // Render items above and below viewport
          heightEstimates={estimatedHeights}
          itemContent={itemContent}
          followOutput={false} // We use our own auto-scroll logic
          computeItemKey={(_, message) => message.id}
          totalCount={filteredMessages.length}
        />
      </AttachmentMetadataProvider>
    </MountedPathsProvider>
  );
};
