import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import type { AgentHistoryEntry } from '@shared/karton-contracts/ui/agent';
import { EMPTY_MOUNTS } from '@shared/karton-contracts/ui';
import type { ToolApprovalMode } from '@shared/karton-contracts/ui/shared-types';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  OverlayScrollbar,
  type OverlayScrollbarRef,
} from '@stagewise/stage-ui/components/overlay-scrollbar';
import {
  IconPenPlusOutline18,
  IconMagnifierOutline18,
} from 'nucleo-ui-outline-18';
import { extractTipTapText, firstWords } from '@ui/utils/text-utils';
import { cn } from '@ui/utils';
import { useEmptyAgentId } from '@ui/hooks/use-empty-agent';
import { useTrack } from '@ui/hooks/use-track';
import { AgentCardSkeleton } from './_components/agent-card';
import { AgentCardWithPreview } from './_components/agent-card-with-preview';
import type { CachedPreview } from '../../_components/agent-preview-panel';
import { getToolActivityLabel } from './_utils/tool-label';
import {
  useSharedAgentContextMenu,
  SharedAgentContextMenuHost,
} from '../../_components/shared-agent-context-menu';
import { DeleteConfirmPopover } from '../../_components/delete-confirm-popover';
import { usePendingRemovals } from '@ui/hooks/use-pending-agent-removals';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';

// ============================================================================
// Types & helpers
// ============================================================================

type ActiveAgentCardData = {
  id: string;
  title: string;
  isWorking: boolean;
  isWaitingForUser: boolean;
  activityText: string;
  activityIsUserInput: boolean;
  hasError: boolean;
  lastMessageAt: number;
  createdAt: number;
  messageCount: number;
  unread: boolean;
};

/** Unified entry for the merged active + history list. */
type MergedAgentEntry = ActiveAgentCardData & {
  /** True when this agent is currently loaded in-memory (active instance). */
  isLive: boolean;
};

function activeAgentCardsEqual(
  a: ActiveAgentCardData[],
  b: ActiveAgentCardData[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (
      ai.id !== bi.id ||
      ai.title !== bi.title ||
      ai.isWorking !== bi.isWorking ||
      ai.isWaitingForUser !== bi.isWaitingForUser ||
      ai.activityText !== bi.activityText ||
      ai.activityIsUserInput !== bi.activityIsUserInput ||
      ai.hasError !== bi.hasError ||
      ai.lastMessageAt !== bi.lastMessageAt ||
      ai.createdAt !== bi.createdAt ||
      ai.messageCount !== bi.messageCount ||
      ai.unread !== bi.unread
    )
      return false;
  }
  return true;
}

/**
 * Derive a short preview from the last assistant text output.
 * Returns the first 10 words of the most recent text part.
 * Reasoning parts show "Thinking…" instead of their content.
 * Falls back to user input draft or last sent user message.
 */
function deriveActivityText(
  history: { role: string; parts: { type: string; text?: string }[] }[],
  inputState: string,
): { text: string; isUserInput: boolean } {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    if (msg.role !== 'assistant') continue;
    const parts = msg.parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j]!;
      if (part.type === 'reasoning')
        return { text: 'Thinking…', isUserInput: false };
      if (part.type === 'text') {
        const snippet = firstWords(part.text ?? '', 10);
        if (snippet) return { text: snippet, isUserInput: false };
        continue;
      }
      if (part.type.startsWith('tool-')) {
        return { text: getToolActivityLabel(part.type), isUserInput: false };
      }
    }
    break;
  }

  // Fall back to persisted input draft (already plain text, skip markdown stripping)
  if (inputState) {
    const draftText = extractTipTapText(inputState).trim();
    if (draftText) {
      const snippet = firstWords(draftText, 10, false);
      if (snippet) return { text: snippet, isUserInput: true };
    }
  }

  // Fall back to last user message preview
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    if (msg.role !== 'user') continue;
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j]!;
      if (part.type === 'text') {
        const snippet = firstWords(part.text ?? '', 10);
        if (snippet) return { text: snippet, isUserInput: true };
      }
    }
    break;
  }

  return { text: '', isUserInput: false };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_VISIBLE = 10;
const SHOW_MORE_INCREMENT = 20;
const INITIAL_HISTORY_FETCH = DEFAULT_VISIBLE + SHOW_MORE_INCREMENT; // 30

// ============================================================================
// Time grouping
// ============================================================================

type GroupLabel =
  | 'Today'
  | 'Yesterday'
  | 'Last 7 days'
  | 'Last 30 days'
  | 'Older';

function getGroupLabel(timestamp: number): GroupLabel {
  // A zero timestamp means no messages yet — treat as "Today".
  if (!timestamp) return 'Today';
  // Bucket by calendar days (local date), not elapsed 24-hour windows.
  const now = new Date();
  const ts = new Date(timestamp);
  const nowMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const tsMidnight = new Date(
    ts.getFullYear(),
    ts.getMonth(),
    ts.getDate(),
  ).getTime();
  const diffDays = Math.round((nowMidnight - tsMidnight) / 86_400_000);
  if (diffDays < 0) return 'Today'; // clock skew
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'Last 7 days';
  if (diffDays < 30) return 'Last 30 days';
  return 'Older';
}

type GroupedItem =
  | { type: 'agent'; agent: MergedAgentEntry }
  | { type: 'header'; label: GroupLabel };

function insertGroupHeaders(agents: MergedAgentEntry[]): GroupedItem[] {
  const result: GroupedItem[] = [];
  let currentGroup: GroupLabel | null = null;
  for (const agent of agents) {
    const group = getGroupLabel(agent.lastMessageAt);
    if (group !== currentGroup) {
      currentGroup = group;
      result.push({ type: 'header', label: group });
    }
    result.push({ type: 'agent', agent });
  }
  return result;
}

// ============================================================================
// AgentsList
// ============================================================================

export function AgentsList() {
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const [openAgent, setOpenAgent] = useOpenAgent();
  const createAgent = useKartonProcedure((p) => p.agents.create);
  const resumeAgent = useKartonProcedure((p) => p.agents.resume);
  const deleteAgent = useKartonProcedure((p) => p.agents.delete);
  const setAgentTitle = useKartonProcedure((p) => p.agents.setTitle);
  const markAsRead = useKartonProcedure((p) => p.agents.markAsRead);
  const getAgentsHistoryList = useKartonProcedure(
    (p) => p.agents.getAgentsHistoryList,
  );

  const [, emptyAgentIdRef] = useEmptyAgentId();

  // Track app start time so agents created during this session always show.
  const appStartTimeRef = useRef(Date.now());

  // Per-surface preview cache. Survives the ActiveAgents mount lifetime so
  // re-hovering the same card is instant. Not shared with the selector's
  // cache on purpose — the selector clears on dropdown close and we don't
  // want that side-effect to hit cards.
  const previewCacheRef = useRef<Map<string, CachedPreview>>(new Map());

  const openAgentModelId = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.activeModelId ?? null)
      : null,
  );
  const openAgentToolApprovalMode = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.toolApprovalMode ?? null)
      : null,
  );
  const currentMounts = useKartonState((s) =>
    openAgent
      ? (s.toolbox[openAgent]?.workspace?.mounts ?? EMPTY_MOUNTS)
      : EMPTY_MOUNTS,
  );
  const openAgentModelIdRef = useRef(openAgentModelId);
  openAgentModelIdRef.current = openAgentModelId;
  const openAgentToolApprovalModeRef = useRef<ToolApprovalMode | null>(
    openAgentToolApprovalMode,
  );
  openAgentToolApprovalModeRef.current = openAgentToolApprovalMode;
  const currentMountPathsRef = useRef(currentMounts.map((m) => m.path));
  currentMountPathsRef.current = currentMounts.map((m) => m.path);

  // Optimistic creation: show a skeleton card immediately while the backend
  // creates the agent. Cleared once the new agent appears in the real list.
  const [pendingCreate, setPendingCreate] = useState(false);
  const agentCountAtCreateRef = useRef(0);

  const agents = useKartonState(
    useComparingSelector(
      (s): ActiveAgentCardData[] =>
        Object.entries(s.agents.instances)
          .filter(([_, agent]) => agent.type === AgentTypes.CHAT)
          .map(([id, agent]) => {
            const history = agent.state.history;
            const lastMsg = history[history.length - 1]!;
            const hasPendingQuestion = !!s.toolbox[id]?.pendingUserQuestion;
            // Detect any open tool-approval requests in the last assistant message.
            const hasPendingToolApproval = (() => {
              const h = agent.state.history;
              for (let i = h.length - 1; i >= 0; i--) {
                const msg = h[i]!;
                if (msg.role !== 'assistant') continue;
                return msg.parts.some(
                  (p: { type: string; state?: string }) =>
                    p.state === 'approval-requested',
                );
              }
              return false;
            })();
            const isWorking = agent.state.isWorking;
            const rawActivity = hasPendingQuestion
              ? { text: 'Waiting for response...', isUserInput: false }
              : deriveActivityText(
                  history as {
                    role: string;
                    parts: { type: string; text?: string }[];
                  }[],
                  agent.state.inputState,
                );
            // When the agent is actively working but we only have a
            // user-input fallback, show "Working…" instead.
            const activity =
              isWorking && rawActivity.isUserInput
                ? { text: 'Working…', isUserInput: false }
                : rawActivity;
            return {
              id,
              title: agent.state.title,
              isWorking: agent.state.isWorking,
              isWaitingForUser: hasPendingQuestion || hasPendingToolApproval,
              activityText: activity.text,
              activityIsUserInput: activity.isUserInput,
              hasError:
                !!agent.state.error &&
                agent.state.error.kind !== 'plan-limit-exceeded',
              unread: !!agent.state.unread,
              lastMessageAt: lastMsg?.metadata?.createdAt
                ? new Date(lastMsg.metadata.createdAt).getTime()
                : 0,
              createdAt: agent.state.history[0]?.metadata?.createdAt
                ? new Date(agent.state.history[0].metadata.createdAt).getTime()
                : 0,
              messageCount: history.length,
            };
          }),
      activeAgentCardsEqual,
    ),
  );

  // Optimistic removal: cards are hidden immediately while the backend processes.
  // Used for "Delete" (permanent). Shared via context so SidebarTopSection's
  // auto-select effect doesn't ping-pong openAgent back onto a being-removed id.
  const {
    pending: pendingRemovals,
    add: addPendingRemoval,
    remove: removePendingRemoval,
  } = usePendingRemovals();
  const pendingRemovalsRef = useRef(pendingRemovals);
  pendingRemovalsRef.current = pendingRemovals;

  // Hide skeleton as soon as agents list grows (same render cycle), rather
  // than waiting for the promise callback which lags 1-2 frames behind.
  const showCreateSkeleton =
    pendingCreate && agents.length <= agentCountAtCreateRef.current;

  const track = useTrack();

  const handleCreateAgent = useCallback(() => {
    void track('chat-new-agent-clicked', { source: 'sidebar-active-agents' });

    // Reuse an existing empty agent instead of creating a new one.
    // Uses refs so this callback isn't recreated when pendingRemovals changes.
    const existingEmpty = emptyAgentIdRef.current;
    if (existingEmpty && !pendingRemovalsRef.current.has(existingEmpty)) {
      setOpenAgent(existingEmpty);
      window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
      return;
    }

    agentCountAtCreateRef.current = agents.length;
    setPendingCreate(true);
    window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
    const currentModelId = openAgentModelIdRef.current ?? undefined;
    const currentToolApprovalMode =
      openAgentToolApprovalModeRef.current ?? undefined;
    const paths = currentMountPathsRef.current;
    void createAgent(
      undefined,
      currentModelId,
      currentToolApprovalMode,
      paths.length > 0 ? paths : undefined,
    ).then((id) => {
      setOpenAgent(id);
      setPendingCreate(false);
    });
  }, [agents.length, createAgent, emptyAgentIdRef, setOpenAgent, track]);

  const handleClick = useCallback(
    (id: string) => {
      // Optimistic: update the open agent immediately, don't wait for the RPC.
      setOpenAgent(id);
      void resumeAgent(id);
    },
    [resumeAgent, setOpenAgent],
  );

  const handleDelete = useCallback(
    (id: string) => {
      addPendingRemoval(id);
      // After the backend confirms deletion, refetch so the history list
      // drops the entry. Keep the id in pendingRemovals until the refetch
      // completes — clearing it before the updated history arrives causes
      // a flicker where the stale cached entry briefly reappears.
      deleteAgent(id)
        .then(() => {
          getAgentsHistoryList(0, fetchLimitRef.current)
            .then((entries) => {
              setHistoryList(entries);
              removePendingRemoval(id);
            })
            .catch((err) => {
              console.error(
                'Failed to refetch agent history after deletion:',
                err,
              );
              removePendingRemoval(id);
            });
        })
        .catch((err) => {
          console.error('Failed to delete agent:', err);
          removePendingRemoval(id);
        });
    },
    [
      addPendingRemoval,
      deleteAgent,
      removePendingRemoval,
      getAgentsHistoryList,
    ],
  );

  const handleRename = useCallback(
    (id: string, newTitle: string) => {
      void setAgentTitle(id, newTitle);
    },
    [setAgentTitle],
  );

  // =========================================================================
  // History agents — fetched from persisted DB, merged with active agents.
  // =========================================================================

  const [historyList, setHistoryList] = useState<AgentHistoryEntry[]>([]);

  const activeAgentIds = useKartonState(
    useComparingSelector((s) => Object.keys(s.agents.instances)),
  );

  // Tracks how many history entries have been fetched from the server.
  // Bumped by `handleShowMore` when the visible count exceeds it.
  const fetchLimitRef = useRef(INITIAL_HISTORY_FETCH);

  // Fetch history once on startup (after first agent is active).
  const historyFetchedRef = useRef(false);
  useEffect(() => {
    if (historyFetchedRef.current) return;
    if (activeAgentIds.length === 0) return;
    historyFetchedRef.current = true;
    getAgentsHistoryList(0, fetchLimitRef.current)
      .then((entries) => {
        setHistoryList(entries);
      })
      .catch((err) => {
        console.error('Failed to fetch agent history:', err);
        historyFetchedRef.current = false;
      });
  }, [activeAgentIds, getAgentsHistoryList]);

  // Clean up pending removals once the backend has confirmed removal.
  const prevPendingSizeRef = useRef(0);
  useEffect(() => {
    if (pendingRemovals.size === 0) {
      // Refetch history after deletions complete so the list stays in sync.
      if (prevPendingSizeRef.current > 0) {
        getAgentsHistoryList(0, fetchLimitRef.current)
          .then((entries) => {
            setHistoryList(entries);
          })
          .catch((err) => {
            console.error(
              'Failed to refetch agent history after cleanup:',
              err,
            );
          });
      }
      prevPendingSizeRef.current = 0;
      return;
    }
    prevPendingSizeRef.current = pendingRemovals.size;
    // Check against both active and history IDs — history-only agents
    // would otherwise be treated as confirmed too early since they're
    // never in the active `agents` array.
    const currentIds = new Set([
      ...agents.map((a) => a.id),
      ...historyList.map((e) => e.id),
    ]);
    pendingRemovals.forEach((id) => {
      if (!currentIds.has(id)) removePendingRemoval(id);
    });
  }, [
    agents,
    historyList,
    pendingRemovals,
    removePendingRemoval,
    getAgentsHistoryList,
  ]);

  // =========================================================================
  // Merged list: active + history, sorted newest-first by lastMessageAt.
  // =========================================================================

  const allAgents = useMemo((): MergedAgentEntry[] => {
    const activeById = new Map(agents.map((a) => [a.id, a]));
    const pendingSet = pendingRemovals;

    // Index history entries by id for fallback lookups.
    const historyById = new Map(historyList.map((e) => [e.id, e]));

    // History entries: exclude those that are already active or pending removal.
    const historyEntries: MergedAgentEntry[] = historyList
      .filter((e) => !activeById.has(e.id) && !pendingSet.has(e.id))
      .map((e) => ({
        id: e.id,
        title: e.title,
        isWorking: false,
        isWaitingForUser: false,
        activityText: '',
        activityIsUserInput: false,
        hasError: false,
        unread: false,
        lastMessageAt: new Date(e.lastMessageAt).getTime(),
        createdAt: new Date(e.createdAt).getTime(),
        messageCount: e.messageCount,
        isLive: false,
      }));

    // Active entries: exclude those pending removal.
    // When an agent was just resumed, its active state may still be loading
    // — fall back to the persisted history entry for title and timestamps
    // so the card doesn't flicker or jump position.
    // For brand-new agents (no history entry, no messages), use Date.now()
    // so they sort to the top instead of being hidden at the bottom.
    const now = Date.now();
    const activeEntries: MergedAgentEntry[] = agents
      .filter((a) => !pendingSet.has(a.id))
      .map((a) => {
        const h = historyById.get(a.id);
        const createdAt =
          a.createdAt > 0
            ? a.createdAt
            : h
              ? new Date(h.createdAt).getTime()
              : now;
        return {
          ...a,
          title: a.title || h?.title || a.title,
          isLive: true,
          lastMessageAt:
            a.lastMessageAt > 0
              ? a.lastMessageAt
              : h
                ? new Date(h.lastMessageAt).getTime()
                : 0,
          createdAt,
        };
      });

    // Sort by the higher of lastMessageAt and createdAt so new agents
    // (no messages yet, createdAt = now) appear at the top.
    const merged = [...activeEntries, ...historyEntries].sort(
      (a, b) =>
        Math.max(b.lastMessageAt, b.createdAt) -
        Math.max(a.lastMessageAt, a.createdAt),
    );

    return merged;
  }, [agents, historyList, pendingRemovals]);

  // =========================================================================
  // Search
  // =========================================================================

  const [searchQuery, setSearchQuery] = useState('');

  const filteredAgents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allAgents;
    return allAgents.filter((a) => a.title.toLowerCase().includes(q));
  }, [allAgents, searchQuery]);

  // =========================================================================
  // "Show more" pagination
  // =========================================================================

  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE);

  // Agents created during this session always show (floor = their count).
  const agentsCreatedThisSession = useMemo(
    () =>
      allAgents.filter((a) => a.createdAt >= appStartTimeRef.current).length,
    [allAgents],
  );

  const effectiveVisible = useMemo(
    () => Math.max(visibleCount, agentsCreatedThisSession, DEFAULT_VISIBLE),
    [visibleCount, agentsCreatedThisSession],
  );

  const visibleAgents = useMemo(
    () => filteredAgents.slice(0, effectiveVisible),
    [filteredAgents, effectiveVisible],
  );

  const groupedItems = useMemo(
    () => insertGroupHeaders(visibleAgents),
    [visibleAgents],
  );

  const hasMoreToShow = effectiveVisible < filteredAgents.length;

  const handleShowMore = useCallback(() => {
    setVisibleCount((c) => {
      const next = c + SHOW_MORE_INCREMENT;
      // Fetch the next page from the server when the visible count
      // reaches or exceeds what's been loaded so far. Using >=
      // ensures the first click past the initial fetch actually
      // triggers a server request. No end-guard is needed —
      // hasMoreToShow naturally hides the button when all visible
      // items fit within the fetched set.
      if (next >= fetchLimitRef.current) {
        fetchLimitRef.current += SHOW_MORE_INCREMENT;
        getAgentsHistoryList(0, fetchLimitRef.current)
          .then((entries) => {
            setHistoryList(entries);
          })
          .catch((err) => {
            console.error('Failed to fetch more agent history:', err);
            fetchLimitRef.current -= SHOW_MORE_INCREMENT;
          });
      }
      return next;
    });
  }, [getAgentsHistoryList]);

  // =========================================================================
  // Scroll & mask
  // =========================================================================

  const scrollRef = useRef<OverlayScrollbarRef>(null);
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const scrollViewportRef = useRef<HTMLElement | null>(null);
  scrollViewportRef.current = scrollViewport;
  const { maskStyle } = useScrollFadeMask(scrollViewportRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

  /** Scroll a card into the safe (non-masked) area of the scroll container. */
  const scrollCardIntoView = useCallback((agentId: string) => {
    const container = scrollRef.current?.getViewport();
    if (!container) return;
    const card = container.querySelector<HTMLElement>(
      `[data-agent-id="${agentId}"]`,
    );
    if (!card) return;

    const fadeZone = 8;
    const cRect = container.getBoundingClientRect();
    const eRect = card.getBoundingClientRect();

    if (
      eRect.top < cRect.top + fadeZone ||
      eRect.bottom > cRect.bottom - fadeZone
    ) {
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, []);

  // Scroll to the active card when the user switches agents.
  useEffect(() => {
    if (openAgent) scrollCardIntoView(openAgent);
  }, [openAgent, scrollCardIntoView]);

  // Clear the unread dot when the user opens an agent.
  useEffect(() => {
    if (openAgent) {
      void markAsRead(openAgent);
    }
  }, [openAgent, markAsRead]);

  // When an agent finishes (isWorking → false), scroll to its card.
  const prevWorkingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const prevWorking = prevWorkingRef.current;
    const nowWorking = new Set<string>();

    for (const agent of agents) {
      if (agent?.isWorking) nowWorking.add(agent.id);
      if (!agent?.isWorking && prevWorking.has(agent.id)) {
        scrollCardIntoView(agent.id);
      }
    }

    prevWorkingRef.current = nowWorking;
  }, [agents, scrollCardIntoView]);

  // =========================================================================
  // Context menu & delete
  // =========================================================================

  const [ctxMenuState, ctxMenuTarget, setCtxMenuTarget] =
    useSharedAgentContextMenu();
  const handleCtxMenuClose = useCallback(
    () => setCtxMenuTarget(null),
    [setCtxMenuTarget],
  );

  const [ctxDelete, setCtxDelete] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const handleCtxDeleteRequest = useCallback(
    (id: string, x: number, y: number) => {
      setCtxDelete({ id, x, y });
    },
    [],
  );
  const handleCtxDeleteConfirm = useCallback(() => {
    const id = ctxDelete?.id;
    setCtxDelete(null);
    if (id) handleDelete(id);
  }, [ctxDelete, handleDelete]);

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="flex h-full flex-col group-data-[collapsed=true]:hidden">
      {/* Header: New Agent button + Search */}
      <div className="shrink-0 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="group/new-agent w-full justify-start pl-1.5 text-start font-medium hover:bg-foreground/8"
          onClick={handleCreateAgent}
        >
          <IconPenPlusOutline18 className="size-4" />
          New Agent
          <span
            className="ml-auto font-mono text-muted-foreground/50 text-sm opacity-0 transition-[color,opacity] group-hover/new-agent:text-foreground group-hover/new-agent:opacity-100"
            translate="no"
          >
            {isMacOs ? '⌘ N' : 'Ctrl N'}
          </span>
        </Button>
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1.5">
          <IconMagnifierOutline18 className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            aria-label="Search agents"
            placeholder="Search agents…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full bg-transparent text-foreground text-sm placeholder:text-muted-foreground',
              'outline-none',
            )}
          />
        </div>
      </div>

      {/* Scrollable agent cards with time-group headers */}
      <OverlayScrollbar
        ref={scrollRef}
        className="-mr-1 min-h-5"
        contentClassName="flex flex-col gap-px pl-0.5 pt-3 pb-3.5 pr-1.5"
        options={{
          overflow: { x: 'visible' },
          scrollbars: { theme: 'os-theme-stagewise-subtle' },
        }}
        style={maskStyle}
        onViewportRef={setScrollViewport}
      >
        {groupedItems.map((item) => {
          if (item.type === 'header') {
            return (
              <div
                key={`h-${item.label}`}
                className="shrink-0 px-1.5 pt-3 pb-1 font-semibold text-subtle-foreground text-xs"
              >
                {item.label}
              </div>
            );
          }

          const agent = item.agent;
          const isOpen = agent.id === openAgent;
          const hasUnseen = !isOpen && agent.unread;

          return (
            <AgentCardWithPreview
              key={agent.id}
              id={agent.id}
              title={agent.title}
              isActive={isOpen}
              isWorking={agent.isWorking}
              isWaitingForUser={agent.isWaitingForUser}
              hasError={agent.hasError}
              hasUnseen={hasUnseen}
              activityText={agent.activityText}
              activityIsUserInput={agent.activityIsUserInput}
              lastMessageAt={agent.lastMessageAt}
              contextMenuState={ctxMenuState}
              onClick={handleClick}
              onRename={handleRename}
              cache={previewCacheRef.current}
            />
          );
        })}
        {showCreateSkeleton && <AgentCardSkeleton />}

        {/* "Show more" button */}
        {hasMoreToShow && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start pl-1.5 text-sm text-subtle-foreground hover:bg-foreground/8"
            onClick={handleShowMore}
          >
            Show more...
          </Button>
        )}
      </OverlayScrollbar>

      <SharedAgentContextMenuHost
        target={ctxMenuTarget}
        onClose={handleCtxMenuClose}
        onDeleteRequest={handleCtxDeleteRequest}
      />
      <DeleteConfirmPopover
        open={ctxDelete !== null}
        isolated
        anchorPoint={ctxDelete ? { x: ctxDelete.x, y: ctxDelete.y } : undefined}
        onOpenChange={(open) => {
          if (!open) setCtxDelete(null);
        }}
        onConfirm={handleCtxDeleteConfirm}
      />
    </div>
  );
}
