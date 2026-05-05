import { Combobox as ComboboxBase } from '@base-ui/react/combobox';
import {
  Combobox,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from '@stagewise/stage-ui/components/combobox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Button } from '@stagewise/stage-ui/components/button';
import { Switch } from '@stagewise/stage-ui/components/switch';
import {
  IconBoxArchiveOutline18,
  IconPenOutline18,
} from 'nucleo-ui-outline-18';
import { cn } from '@ui/utils';
import { DeleteConfirmPopover } from '../../../_components/delete-confirm-popover';
import {
  useSharedAgentContextMenu,
  SharedAgentContextMenuHost,
  buildAgentContextMenuHandler,
  type SharedAgentContextMenuState,
} from '../../../_components/shared-agent-context-menu';
import { useInlineTitleEdit } from './use-inline-title-edit';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import type React from 'react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import TimeAgo from 'react-timeago';
import buildFormatter from 'react-timeago/lib/formatters/buildFormatter';
import {
  AgentPreviewPanel,
  type CachedPreview,
} from '../../../_components/agent-preview-panel';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useComparingSelector } from '@ui/hooks/use-karton';
import { EMPTY_MOUNTS } from '@shared/karton-contracts/ui';
import { useEmptyAgentId } from '@ui/hooks/use-empty-agent';
import { usePendingRemovals } from '@ui/hooks/use-pending-agent-removals';
import { useTrack } from '@ui/hooks/use-track';
import { useChatDraft } from '@ui/hooks/use-chat-draft';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { HotkeyActions } from '@shared/hotkeys';
import posthog from 'posthog-js';

// ============================================================================
// Types
// ============================================================================

interface AgentEntry {
  id: string;
  title: string;
  lastMessageAt: Date;
  messageCount: number;
  isWorking?: boolean;
  unread?: boolean;
}

interface AgentGroup {
  label: string;
  agents: AgentEntry[];
}

// ============================================================================
// Compact time-ago formatter (module-level constant)
// ============================================================================

const minimalFormatter = buildFormatter({
  prefixAgo: '',
  prefixFromNow: '',
  suffixAgo: '',
  suffixFromNow: '',
  second: '1s',
  seconds: (value) => `${value}s`,
  minute: '1m',
  minutes: (value) => `${value}m`,
  hour: '1h',
  hours: (value) => `${value}h`,
  day: '1d',
  days: (value) => `${value}d`,
  week: '1w',
  weeks: (value) => `${value}w`,
  month: '1M',
  months: (value) => `${value}M`,
  year: '1y',
  years: (value) => `${value}y`,
  wordSeparator: '',
  numbers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
});

// ============================================================================
// Constants
// ============================================================================

/** The "Active agents" group label used by the parent to identify live agents. */
const ACTIVE_GROUP_LABEL = 'Active agents';

/** Shape returned by the activeAgentsList selector. */
type ActiveAgentSummary = {
  id: string;
  title: string;
  createdAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  parentAgentInstanceId: string | null;
  isWorking: boolean;
  unread: boolean;
};

/**
 * Custom comparator for the activeAgentsList selector.
 * Compares only the fields we derive — avoids re-renders when irrelevant agent
 * state changes (e.g. streaming tokens, model switches, queued messages).
 *
 * Date fields are compared by getTime() because Karton's `deep` comparator
 * treats Date objects as opaque (0 enumerable props → always "equal").
 */
function activeAgentListEqual(
  a: ActiveAgentSummary[],
  b: ActiveAgentSummary[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (
      ai.id !== bi.id ||
      ai.title !== bi.title ||
      ai.messageCount !== bi.messageCount ||
      ai.isWorking !== bi.isWorking ||
      ai.unread !== bi.unread ||
      ai.parentAgentInstanceId !== bi.parentAgentInstanceId ||
      ai.createdAt.getTime() !== bi.createdAt.getTime() ||
      ai.lastMessageAt.getTime() !== bi.lastMessageAt.getTime()
    )
      return false;
  }
  return true;
}

// ============================================================================
// AgentListItem — one row
// ============================================================================

interface AgentListItemProps {
  agent: AgentEntry;
  /** True when this row belongs to the "Active agents" group (live instance). */
  isLive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onCommitRename: (id: string, newTitle: string) => void;
  /** Archive a live agent — only wired for `isLive` rows. */
  onArchive: (id: string) => void;
  /** Shared context-menu controller — one host for the whole list. */
  contextMenuState: SharedAgentContextMenuState;
  onHighlight: (agentId: string) => void;
}

function AgentListItemImpl({
  agent,
  isLive,
  isSelected,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onCommitRename,
  onArchive,
  contextMenuState,
  onHighlight,
}: AgentListItemProps) {
  const hasUnseen = !isSelected && !!agent.unread;
  const itemRef = useRef<HTMLDivElement>(null);

  const handleCommit = useCallback(
    (newTitle: string) => onCommitRename(agent.id, newTitle),
    [agent.id, onCommitRename],
  );

  const {
    isEditing: editActive,
    titleRef,
    displayTitle,
    startEditing,
    commitEdit,
    cancelEdit,
  } = useInlineTitleEdit({ title: agent.title, onCommit: handleCommit });

  // Keep local hook state in sync with the parent-driven `isEditing` flag.
  // Parent owns the "only one row editing at a time" invariant.
  //
  // All callbacks come from useInlineTitleEdit (which useCallback-wraps them).
  // `startEditing` is stable; `cancelEdit` re-creates when `title` changes,
  // which is correct — if the prop title updates mid-edit, we want cancel
  // to restore the fresh value, not a stale captured one.
  useEffect(() => {
    if (isEditing && !editActive) {
      startEditing();
    } else if (!isEditing && editActive) {
      // Parent canceled (e.g. dropdown closed, another row started editing).
      // Drop any pending changes silently.
      cancelEdit();
    }
  }, [isEditing, editActive, startEditing, cancelEdit]);

  // Observe the Combobox's `data-highlighted` attribute on this row. Base-ui
  // sets that when a row becomes the active keyboard-highlighted item; we
  // forward the event so the parent can position the agent preview side panel.
  useEffect(() => {
    const el = itemRef.current;
    if (!el) return;

    // Seed in case Base UI rendered this row already-highlighted on mount;
    // MutationObserver only fires on subsequent attribute changes.
    if (el.hasAttribute('data-highlighted')) onHighlight(agent.id);

    const observer = new MutationObserver(() => {
      if (el.hasAttribute('data-highlighted')) onHighlight(agent.id);
    });

    observer.observe(el, {
      attributes: true,
      attributeFilter: ['data-highlighted'],
    });

    return () => observer.disconnect();
  }, [agent.id, onHighlight]);

  return (
    <ComboboxItem
      ref={itemRef}
      key={agent.id}
      value={agent.id}
      size="xs"
      className="grid-cols-[0.75rem_1fr_auto]"
      onContextMenu={buildAgentContextMenuHandler(
        contextMenuState,
        agent.id,
        isLive,
        () => onStartEdit(agent.id),
      )}
    >
      <ComboboxItemIndicator />
      <span className="col-start-2 flex w-full items-center gap-2">
        {isEditing ? (
          <span
            ref={titleRef}
            role="textbox"
            contentEditable
            suppressContentEditableWarning
            className="min-w-0 flex-1 cursor-text truncate bg-transparent p-0 outline-none"
            // Capture-phase stop on focus: base-ui's ComboboxPopup has an
            // onFocus handler that redirects any focus landing inside the
            // list back to its Input. Stopping propagation here prevents
            // that handler from ever seeing the event.
            onFocusCapture={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDownCapture={(e) => {
              // Capture-phase stop: base-ui's ComboboxList handler would
              // otherwise steal Arrow/Enter/Escape.
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                // Commit directly instead of going through blur() — base-ui's
                // ComboboxPopup focus manager otherwise adds a perceptible
                // handshake delay before onBlur fires.
                commitEdit();
                onCancelEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
                onCancelEdit();
              }
            }}
            onKeyUpCapture={(e) => e.stopPropagation()}
            onBlur={() => {
              commitEdit();
              onCancelEdit();
            }}
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData('text/plain');
              document.execCommand('insertText', false, text);
            }}
          >
            {displayTitle}
          </span>
        ) : (
          <span
            className={cn(
              'truncate',
              agent.isWorking && 'shimmer-text-primary',
              hasUnseen && 'animate-text-pulse-warning',
            )}
          >
            {displayTitle}
          </span>
        )}
        {!isEditing && (
          <span className="shrink-0 text-subtle-foreground text-xs">
            <TimeAgo
              date={agent.lastMessageAt}
              formatter={minimalFormatter}
              live={false}
            />
          </span>
        )}
      </span>
      <div className="col-start-3 flex h-5 items-center gap-0.5">
        {!isEditing && (
          <button
            type="button"
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-colors hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
            aria-label="Rename agent"
            onPointerDown={(e) => {
              // preventDefault prevents the button from stealing focus from
              // the Combobox's virtual-focus Input. Without this, clicking the
              // pencil triggers a focus change that base-ui then "restores",
              // leaving us in a focus tug-of-war with the editable span.
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit(agent.id);
            }}
          >
            <IconPenOutline18 className="size-3" />
          </button>
        )}
        {!isEditing && isLive && (
          <button
            type="button"
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-colors hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
            aria-label="Archive agent"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onArchive(agent.id);
            }}
          >
            <IconBoxArchiveOutline18 className="size-3" />
          </button>
        )}
      </div>
    </ComboboxItem>
  );
}

// Custom comparator: the parent rebuilds `agent` objects on every render
// (the `toEntry` helper in SidebarTopSection returns fresh objects), so the
// default memo check sees a new reference for every sibling and re-renders
// the entire list on any state change. That stampede delays the exit from
// edit mode by hundreds of ms when there are many rows. Compare only the
// primitive fields the row actually uses. Callback props are treated as
// stable — they are all wrapped in useCallback at AgentsSelector scope
// and don't change during a rename.
const AgentListItem = memo(AgentListItemImpl, (prev, next) => {
  const pa = prev.agent;
  const na = next.agent;
  if (
    pa.id !== na.id ||
    pa.title !== na.title ||
    pa.messageCount !== na.messageCount ||
    !!pa.isWorking !== !!na.isWorking ||
    !!pa.unread !== !!na.unread ||
    pa.lastMessageAt.getTime() !== na.lastMessageAt.getTime()
  ) {
    return false;
  }
  return (
    prev.isSelected === next.isSelected &&
    prev.isEditing === next.isEditing &&
    prev.isLive === next.isLive
  );
});

// ============================================================================
// AgentsSelector
// ============================================================================

/**
 * Group history entries by human-readable time buckets. Buckets are emitted
 * in chronological order (newest → oldest); empty buckets are skipped.
 * Expects `entries` already sorted newest-first.
 */
function groupChatsByTime<T extends { lastMessageAt: Date }>(
  entries: T[],
): Record<string, T[]> {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const MS_PER_DAY = 86_400_000;
  const startOfYesterday = startOfToday - MS_PER_DAY;
  const startOfLast7 = startOfToday - 6 * MS_PER_DAY;
  const startOfLast30 = startOfToday - 29 * MS_PER_DAY;

  const buckets: Record<string, T[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    'Previous 30 days': [],
    Older: [],
  };

  for (const entry of entries) {
    const t = entry.lastMessageAt.getTime();
    if (t >= startOfToday) buckets.Today!.push(entry);
    else if (t >= startOfYesterday) buckets.Yesterday!.push(entry);
    else if (t >= startOfLast7) buckets['Previous 7 days']!.push(entry);
    else if (t >= startOfLast30) buckets['Previous 30 days']!.push(entry);
    else buckets.Older!.push(entry);
  }

  // Drop empty buckets while preserving insertion order.
  const result: Record<string, T[]> = {};
  for (const [label, items] of Object.entries(buckets)) {
    if (items.length > 0) result[label] = items;
  }
  return result;
}

export function AgentsSelector() {
  const createAgent = useKartonProcedure((p) => p.agents.create);
  const resumeAgent = useKartonProcedure((p) => p.agents.resume);
  const archiveAgent = useKartonProcedure((p) => p.agents.archive);
  const deleteAgent = useKartonProcedure((p) => p.agents.delete);
  const setAgentTitle = useKartonProcedure((p) => p.agents.setTitle);
  const getAgentsHistoryList = useKartonProcedure(
    (p) => p.agents.getAgentsHistoryList,
  );
  const [openAgent, setOpenAgent, removeFromHistory] = useOpenAgent();

  // Narrow selector: only re-renders when the open agent's model changes.
  // Used by createAgentAndFocus (via ref) to seed the new chat with the same model.
  const openAgentModelId = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.activeModelId ?? null)
      : null,
  );

  const currentMounts = useKartonState((s) =>
    openAgent
      ? (s.toolbox[openAgent]?.workspace?.mounts ?? EMPTY_MOUNTS)
      : EMPTY_MOUNTS,
  );

  // Whether the currently open agent has any history messages.
  // Used (via ref) to decide whether to forward the draft input to a new agent.
  const openAgentHasHistory = useKartonState((s) =>
    openAgent
      ? (s.agents.instances[openAgent]?.state.history.length ?? 0) > 0
      : false,
  );

  const markAsRead = useKartonProcedure((p) => p.agents.markAsRead);

  // Tick every 5 minutes to refresh time-ago labels and groupings.
  // The labels (Today, Yesterday, 2 days ago…) don't change meaningfully every minute,
  // so a 5-minute interval avoids a ~25-40ms chatSelectItems recomputation every 60s.
  const [timeTick, setTimeTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTimeTick((t) => t + 1), 300_000);
    return () => clearInterval(interval);
  }, []);

  // Derive the active-agents list directly in the selector so we subscribe to
  // narrow changes only.  The custom comparator (activeAgentListEqual) checks
  // each field with getTime() for Date values — preventing re-renders from
  // irrelevant agent state mutations (streaming, model switch, queued messages).
  //
  // Cost: selector runs O(n) filter+map+sort on every Karton state change, but
  // n = active CHAT agents (typically 1-5) so this is < 0.1 ms.  The comparator
  // short-circuits on the first mismatch, so the common "no change" path is a
  // fast element-by-element scan that avoids triggering React re-renders.
  const activeAgentsListRaw = useKartonState(
    useComparingSelector(
      (s): ActiveAgentSummary[] =>
        Object.entries(s.agents.instances)
          .filter(([_, agent]) => agent.type === AgentTypes.CHAT)
          .map(([id, agent]) => ({
            id,
            title: agent.state.title,
            createdAt:
              agent.state.history[0]?.metadata?.createdAt ?? new Date(0),
            lastMessageAt:
              agent.state.history[agent.state.history.length - 1]?.metadata
                ?.createdAt ?? new Date(0),
            messageCount: agent.state.history.length,
            parentAgentInstanceId: agent.parentAgentInstanceId,
            isWorking: agent.state.isWorking,
            unread: !!agent.state.unread,
          }))
          .sort(
            (a, b) =>
              new Date(b.lastMessageAt).getTime() -
              new Date(a.lastMessageAt).getTime(),
          ),
      activeAgentListEqual,
    ),
  );
  const [agentsList, setAgentsList] = useState<
    Awaited<ReturnType<typeof getAgentsHistoryList>>
  >([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const isLoadingMoreRef = useRef(false);
  // Track the raw number of items fetched from the backend (before active-agent filtering)
  // so that the offset for subsequent pages is correct.
  const rawFetchedCountRef = useRef(0);

  const PAGE_SIZE = 200;

  const activeAgentIdsRaw = useKartonState(
    useComparingSelector((s) => Object.keys(s.agents.instances)),
  );
  // Filter out ids that are being optimistically removed (Archive/Delete).
  // Including them in auto-select would ping-pong openAgent back onto an
  // id the grid is trying to evict, looping infinitely until the backend
  // catches up.
  const { pending: pendingRemovals } = usePendingRemovals();
  const activeAgentIds = useMemo(
    () =>
      pendingRemovals.size === 0
        ? activeAgentIdsRaw
        : activeAgentIdsRaw.filter((id) => !pendingRemovals.has(id)),
    [activeAgentIdsRaw, pendingRemovals],
  );
  const activeAgentIdSet = useMemo(
    () => new Set(activeAgentIds),
    [activeAgentIds],
  );
  const activeAgentsList = useMemo(
    () =>
      pendingRemovals.size === 0
        ? activeAgentsListRaw
        : activeAgentsListRaw.filter((a) => !pendingRemovals.has(a.id)),
    [activeAgentsListRaw, pendingRemovals],
  );

  useEffect(() => {
    // Wait until we have at least one active agent before fetching history
    if (activeAgentIdSet.size === 0) {
      return;
    }
    // Reset pagination state on fresh fetch
    setHasMoreHistory(true);
    isLoadingMoreRef.current = false;
    rawFetchedCountRef.current = 0;
    getAgentsHistoryList(0, PAGE_SIZE).then((a) => {
      rawFetchedCountRef.current = a.length;
      const filtered = a.filter((agent) => !activeAgentIdSet.has(agent.id));
      setAgentsList(filtered);
      if (a.length < PAGE_SIZE) setHasMoreHistory(false);
    });
  }, [activeAgentIds]);

  // If the open agent was removed, pop it from the history stack. The
  // fallback parameter ensures that when the stack is empty, we jump
  // straight to the first active agent in one render instead of going
  // through null → pick.
  // On initial load (openAgent === null), pick the first active agent.
  useEffect(() => {
    if (openAgent && !activeAgentIdSet.has(openAgent)) {
      removeFromHistory(openAgent, activeAgentIds[0] ?? null);
    } else if (!openAgent && activeAgentIds.length > 0) {
      setOpenAgent(activeAgentIds[0]!);
    }
  }, [
    openAgent,
    activeAgentIdSet,
    activeAgentIds,
    removeFromHistory,
    setOpenAgent,
  ]);

  // Mark the open agent as read when the user switches to it.
  useEffect(() => {
    if (openAgent) void markAsRead(openAgent);
  }, [openAgent, markAsRead]);

  // Reactive clear: if the agent finishes while the user is already looking
  // at it, immediately mark it as read so the pulse never appears.
  const openAgentUnread = useKartonState((s) =>
    openAgent ? !!s.agents.instances[openAgent]?.state.unread : false,
  );
  useEffect(() => {
    if (openAgent && openAgentUnread) void markAsRead(openAgent);
  }, [openAgent, openAgentUnread, markAsRead]);

  // Sort history separately — O(n log n) only recomputes when data actually changes,
  // NOT on every timeTick (which only affects grouping labels).
  const sortedHistory = useMemo(() => {
    const filtered = agentsList.filter(
      (agent) => !activeAgentIdSet.has(agent.id),
    );
    return filtered.sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime(),
    );
  }, [agentsList, activeAgentIdSet]);

  // Group history by time labels, merge with active agents, and transform into
  // AgentGroup[] in a single memo.  Sorting is kept separate above so a timeTick
  // change (which only affects label boundaries) doesn't re-sort.
  const agentGroups = useMemo((): AgentGroup[] => {
    const historyGroups = groupChatsByTime(sortedHistory);

    const toEntry = (a: {
      id: string;
      title: string;
      lastMessageAt: Date;
      messageCount: number;
      isWorking?: boolean;
      unread?: boolean;
    }) => ({
      id: a.id,
      title: a.title,
      lastMessageAt: a.lastMessageAt,
      messageCount: a.messageCount,
      isWorking: a.isWorking,
      unread: a.unread,
    });

    return [
      { label: 'Active agents', agents: activeAgentsList.map(toEntry) },
      ...Object.entries(historyGroups).map(([label, agents]) => ({
        label,
        agents: agents.map(toEntry),
      })),
    ];
  }, [sortedHistory, activeAgentsList, timeTick]);

  const [, emptyAgentIdRef] = useEmptyAgentId();

  // Get draft getter from context (provided by panel-footer)
  const { getDraft } = useChatDraft();

  // Use refs for values only needed inside callbacks (not during render).
  // deleteAgent/agentsList are used in onClick handlers (only called on user
  // interaction), so refs avoid re-creating callbacks on every state change.
  const deleteAgentRef = useRef(deleteAgent);
  deleteAgentRef.current = deleteAgent;
  const setAgentTitleRef = useRef(setAgentTitle);
  setAgentTitleRef.current = setAgentTitle;
  const openAgentRef = useRef(openAgent);
  openAgentRef.current = openAgent;
  const activeAgentIdSetRef = useRef(activeAgentIdSet);
  activeAgentIdSetRef.current = activeAgentIdSet;
  const openAgentModelIdRef = useRef(openAgentModelId);
  openAgentModelIdRef.current = openAgentModelId;
  const currentMountPathsRef = useRef(currentMounts.map((m) => m.path));
  currentMountPathsRef.current = currentMounts.map((m) => m.path);
  const openAgentHasHistoryRef = useRef(openAgentHasHistory);
  openAgentHasHistoryRef.current = openAgentHasHistory;

  // Load more history entries when the user scrolls to the bottom of the list.
  // Uses refs for all dependencies so the callback identity is fully stable and
  // doesn't defeat AgentsSelector's memo on onEndReached.
  const hasMoreHistoryRef = useRef(hasMoreHistory);
  hasMoreHistoryRef.current = hasMoreHistory;
  const getAgentsHistoryListRef = useRef(getAgentsHistoryList);
  getAgentsHistoryListRef.current = getAgentsHistoryList;

  const loadMoreHistory = useCallback(() => {
    if (!hasMoreHistoryRef.current || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    getAgentsHistoryListRef
      .current(rawFetchedCountRef.current, PAGE_SIZE)
      .then((res) => {
        rawFetchedCountRef.current += res.length;
        if (res.length < PAGE_SIZE) setHasMoreHistory(false);
        if (res.length > 0) setAgentsList((prev) => [...prev, ...res]);
      })
      .catch(() => {
        // Swallow — pagination will retry on next scroll.
      })
      .finally(() => {
        isLoadingMoreRef.current = false;
      });
  }, []);

  const handleDeleteAgent = useCallback((id: string) => {
    void deleteAgentRef.current(id).catch((e) => {
      console.error(e);
      posthog.captureException(e instanceof Error ? e : new Error(String(e)), {
        source: 'renderer',
        operation: 'deleteAgent',
      });
    });
    // Functional updater: always sees latest state, safe under rapid successive deletes.
    setAgentsList((prev) => prev.filter((agent) => agent.id !== id));
  }, []);

  const handleRenameAgent = useCallback((id: string, newTitle: string) => {
    // Optimistic: update the local list immediately.
    setAgentsList((prev) =>
      prev.map((agent) =>
        agent.id === id ? { ...agent, title: newTitle } : agent,
      ),
    );
    void setAgentTitleRef.current(id, newTitle).catch((e) => {
      console.error(e);
      posthog.captureException(e instanceof Error ? e : new Error(String(e)), {
        source: 'renderer',
        operation: 'setAgentTitle',
      });
      // Recover: refetch the first page to pull fresh server state.
      // Using a single-source-of-truth refetch (rather than a closure-captured
      // prev-title rollback) also corrects any partial-success drift.
      void getAgentsHistoryListRef
        .current(0, PAGE_SIZE)
        .then((fresh) => {
          setAgentsList(fresh);
          // Reset pagination state to match the refetched first page.
          // Without this, a user who had already scrolled past page 0
          // would keep the stale higher offset and subsequent
          // loadMoreHistory() calls would skip items 200…stale-offset.
          rawFetchedCountRef.current = fresh.length;
          setHasMoreHistory(fresh.length >= PAGE_SIZE);
          isLoadingMoreRef.current = false;
        })
        .catch(() => {
          // Best-effort recovery; swallow secondary failure.
        });
    });
  }, []);

  const track = useTrack();

  // Helper to create a new chat and focus the input.
  // openAgentModelId is read via ref — it's only needed at invocation time
  // and should NOT cause this callback to be recreated on model changes.
  const createAgentAndFocus = useCallback(
    async (source: 'sidebar-top' | 'hotkey') => {
      void track('chat-new-agent-clicked', { source });

      // Reuse an existing empty agent instead of creating a new one.
      const existingEmpty = emptyAgentIdRef.current;
      if (existingEmpty) {
        setOpenAgent(existingEmpty);
        window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
        return;
      }

      // Only forward the draft input if the current agent has history;
      // an agent with no history means the user never sent a message, so
      // the new agent should start clean.
      const currentInputState = openAgentHasHistoryRef.current
        ? getDraft()
        : undefined;
      const currentModelId = openAgentModelIdRef.current ?? undefined;
      const paths = currentMountPathsRef.current;
      const newAgent = await createAgent(
        currentInputState || undefined,
        currentModelId,
        paths.length > 0 ? paths : undefined,
      );
      setOpenAgent(newAgent);
      void getAgentsHistoryList(0, PAGE_SIZE).then(setAgentsList);
      window.dispatchEvent(new Event('sidebar-chat-panel-opened'));
    },
    [createAgent, getDraft, getAgentsHistoryList, track],
  );

  // Hotkey: CTRL+N to create new agent chat (works regardless of which section
  // shows the "Add agent" button — top section or active agents grid).
  // Disabled when the open agent is already empty (nothing to create).
  useHotKeyListener(() => {
    if (openAgent !== null && emptyAgentIdRef.current !== openAgent) {
      void createAgentAndFocus('hotkey');
    }
  }, HotkeyActions.NEW_CHAT);

  const resumeAgentRef = useRef(resumeAgent);
  resumeAgentRef.current = resumeAgent;
  const archiveAgentRef = useRef(archiveAgent);
  archiveAgentRef.current = archiveAgent;

  // Context-menu / inline button "Archive": suspend an active agent.
  // Optimistically prune it from the local history list so it disappears
  // immediately.

  const handleArchiveAgent = useCallback((id: string) => {
    void archiveAgentRef.current(id).catch((e) => {
      console.error(e);
      posthog.captureException(e instanceof Error ? e : new Error(String(e)), {
        source: 'renderer',
        operation: 'archiveAgent',
      });
    });
    setAgentsList((prev) => prev.filter((agent) => agent.id !== id));
  }, []);

  const handleAgentSelect = useCallback(
    (value: string | null) => {
      if (!value) return;
      if (value === openAgentRef.current) return;
      if (activeAgentIdSetRef.current.has(value)) {
        // Agent is already active — navigate immediately; resume is a no-op
        // for active agents but an async IPC round-trip that would otherwise
        // defer setOpenAgent and leave the unread indicator visible until the
        // RPC settles.
        setOpenAgent(value);
      } else {
        // History/archived agent — must wait for resume before navigating.
        // Calling setOpenAgent immediately would trigger the auto-eviction
        // effect (openAgent not in activeAgentIdSet → removeFromHistory)
        // before the agent is live, overriding the selection.
        void resumeAgentRef.current(value).then(() => {
          setOpenAgent(value);
        });
      }
    },
    [setOpenAgent],
  );

  const [inputValue, setInputValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Single shared context-menu host for all rows. Avoids instantiating
  // base-ui ContextMenu.Root (with its context providers + refs) per row
  // — critical when the history can be several hundred entries.
  const [ctxMenuState, ctxMenuTarget, setCtxMenuTarget] =
    useSharedAgentContextMenu();
  const handleCtxMenuClose = useCallback(
    () => setCtxMenuTarget(null),
    [setCtxMenuTarget],
  );

  // Delete-confirm popover triggered from the shared context menu. Lives
  // at the selector level (not inside a row) so it survives both the
  // menu closing and the combobox closing — the menu's dismissal would
  // otherwise propagate to the combobox and reset the row-local
  // `pendingDeleteId` before the popover ever mounts.
  const [ctxDeleteId, setCtxDeleteId] = useState<string | null>(null);
  const handleCtxDeleteRequest = useCallback((id: string) => {
    setCtxDeleteId(id);
  }, []);
  const handleCtxDeleteCancel = useCallback(() => {
    setCtxDeleteId(null);
  }, []);
  const handleCtxDeleteConfirm = useCallback(() => {
    const id = ctxDeleteId;
    setCtxDeleteId(null);
    if (id) handleDeleteAgent(id);
  }, [ctxDeleteId, handleDeleteAgent]);

  // Filter groups by search input — skip entirely when closed
  const filteredGroups = useMemo(() => {
    if (!isOpen) return agentGroups;
    const q = inputValue.trim().toLowerCase();
    if (!q) return agentGroups;
    return agentGroups
      .map((g) => ({
        ...g,
        agents: g.agents.filter((a) => a.title.toLowerCase().includes(q)),
      }))
      .filter((g) => g.agents.length > 0);
  }, [agentGroups, inputValue, isOpen]);

  const hasResults = filteredGroups.some((g) => g.agents.length > 0);

  // Infinite scroll: observe sentinel near bottom of list. `loadMoreHistory`
  // is stable (reads all deps from refs) so we don't need an extra indirection.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreHistory();
      },
      { root: listRef.current, rootMargin: '0px 0px 200px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasResults, isOpen, loadMoreHistory]);

  // Side-panel hover state (vertical-center align with the highlighted row).
  const containerRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [sidePanelOffset, setSidePanelOffset] = useState(0);

  // The side-panel should only render while its target agent is actually
  // present in the visible list — e.g. if the user filters it out, deletes
  // it, or the infinite-scroll window moves past it, we hide the panel
  // instead of showing a stale preview next to unrelated rows.
  const isHoveredAgentVisible = useMemo(() => {
    if (!hoveredAgentId) return false;
    return filteredGroups.some((g) =>
      g.agents.some((a) => a.id === hoveredAgentId),
    );
  }, [filteredGroups, hoveredAgentId]);

  // Preview cache: owned by the selector so it survives panel unmount
  // between hovers. Cleared when the dropdown closes to avoid serving
  // stale touched-files / workspace data across unrelated sessions.
  const previewCacheRef = useRef<Map<string, CachedPreview>>(new Map());

  // Delayed-clear so the cursor can traverse the gap between the popup
  // and the floating side panel without the panel closing.
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const cancelPendingClear = useCallback(() => {
    if (clearTimerRef.current !== undefined) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = undefined;
    }
  }, []);
  const scheduleClear = useCallback(() => {
    cancelPendingClear();
    clearTimerRef.current = setTimeout(() => {
      setHoveredAgentId(null);
      clearTimerRef.current = undefined;
    }, 150);
  }, [cancelPendingClear]);
  useEffect(() => cancelPendingClear, [cancelPendingClear]);

  useLayoutEffect(() => {
    const panel = sidePanelRef.current;
    const container = containerRef.current;
    const list = listRef.current;
    if (!hoveredAgentId || !panel || !container) return;

    // Measure the currently highlighted row live on every call so we never
    // rely on a stale captured center. The row can move relative to the
    // container when the list is resorted, filtered, or scrolled without
    // the highlight changing.
    const reposition = () => {
      const highlighted =
        container.querySelector<HTMLElement>('[data-highlighted]');
      if (!highlighted) return;
      const containerRect = container.getBoundingClientRect();
      const itemRect = highlighted.getBoundingClientRect();
      const itemCenterY =
        itemRect.top + itemRect.height / 2 - containerRect.top;

      const panelHeight = panel.offsetHeight;
      const containerHeight = container.offsetHeight;
      // If the panel is taller than the container, `containerHeight -
      // panelHeight` is negative; floor `maxOffset` at 0 so the panel
      // stays top-aligned instead of being pushed above the container.
      const maxOffset = Math.max(0, containerHeight - panelHeight);
      const desired = itemCenterY - panelHeight / 2;
      setSidePanelOffset(Math.max(0, Math.min(desired, maxOffset)));
    };

    reposition();

    // Re-measure on async height changes (skeleton → content swap, search
    // filter shrinking the popup list, etc.).
    const ro = new ResizeObserver(reposition);
    ro.observe(panel);
    ro.observe(container);

    // Re-measure when the list DOM changes under the highlighted row
    // without a size change (row inserted above, list resorted, etc.).
    const mo = new MutationObserver(reposition);
    if (list) {
      mo.observe(list, { childList: true, subtree: true });
    }

    // Re-measure on scroll so the row stays anchored as the list scrolls
    // under the (stationary) cursor. Passive so it never blocks scroll.
    list?.addEventListener('scroll', reposition, { passive: true });

    return () => {
      ro.disconnect();
      mo.disconnect();
      list?.removeEventListener('scroll', reposition);
    };
  }, [hoveredAgentId]);

  const handleItemHover = useCallback(
    (agentId: string) => {
      cancelPendingClear();
      setHoveredAgentId(agentId);
    },
    [cancelPendingClear],
  );

  const handleValueChange = useCallback(
    (v: string | null) => {
      if (!v) return;
      // Don't trigger navigation for the row currently being edited.
      if (v === editingId) return;
      handleAgentSelect(v);
    },
    [handleAgentSelect, editingId],
  );

  const handleStartEdit = useCallback((id: string) => {
    setEditingId(id);
  }, []);
  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open) {
        setInputValue('');
        setEditingId(null);
        cancelPendingClear();
        setHoveredAgentId(null);
        previewCacheRef.current.clear();
      }
    },
    [cancelPendingClear],
  );

  const showActiveAgents = useKartonState(
    (s) => s.preferences.sidebar?.showActiveAgents ?? true,
  );
  const preferencesUpdate = useKartonProcedure((p) => p.preferences.update);
  const handleToggleActiveAgents = useCallback(
    (checked: boolean) => {
      void preferencesUpdate([
        {
          op: 'replace' as const,
          path: ['sidebar', 'showActiveAgents'],
          value: checked,
        },
      ]);
    },
    [preferencesUpdate],
  );

  return (
    <>
      <Combobox
        value={openAgent}
        onValueChange={handleValueChange}
        onInputValueChange={setInputValue}
        onOpenChange={handleOpenChange}
      >
        {/* Custom trigger: unstyled, using base-ui Trigger directly with render */}
        <ComboboxBase.Trigger
          render={(props: React.HTMLAttributes<HTMLButtonElement>) => (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  {...props}
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                >
                  <IconBoxArchiveOutline18 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>Show recent chats</span>
              </TooltipContent>
            </Tooltip>
          )}
        />

        {isOpen && (
          <ComboboxBase.Portal>
            <ComboboxBase.Backdrop className="fixed inset-0 z-50" />
            <ComboboxBase.Positioner
              side="bottom"
              sideOffset={8}
              align="start"
              className="z-50"
            >
              <div
                ref={containerRef}
                className="relative flex flex-row items-start gap-1"
                onMouseLeave={scheduleClear}
                onMouseEnter={cancelPendingClear}
              >
                <ComboboxBase.Popup
                  className={cn(
                    'flex min-w-56 max-w-72 origin-(--transform-origin) flex-col items-stretch gap-0.5 text-xs',
                    'rounded-lg border border-border-subtle bg-background p-1 shadow-lg',
                    'transition-[transform,scale,opacity] duration-150 ease-out',
                    'data-ending-style:scale-90 data-ending-style:opacity-0',
                    'data-starting-style:scale-90 data-starting-style:opacity-0',
                  )}
                >
                  <div className="mb-1">
                    <ComboboxInput size="xs" placeholder="Search for agent…" />
                  </div>

                  <div
                    ref={listRef}
                    className="scrollbar-hover-only max-h-48 overflow-y-auto"
                  >
                    <ComboboxList>
                      {filteredGroups.map(({ label, agents }) => {
                        const groupIsLive = label === ACTIVE_GROUP_LABEL;
                        return (
                          <ComboboxGroup key={label}>
                            <ComboboxGroupLabel>{label}</ComboboxGroupLabel>
                            {agents.map((agent) => (
                              <AgentListItem
                                key={agent.id}
                                agent={agent}
                                isLive={groupIsLive}
                                isSelected={agent.id === openAgent}
                                isEditing={editingId === agent.id}
                                onStartEdit={handleStartEdit}
                                onCancelEdit={handleCancelEdit}
                                onCommitRename={handleRenameAgent}
                                onArchive={handleArchiveAgent}
                                contextMenuState={ctxMenuState}
                                onHighlight={handleItemHover}
                              />
                            ))}
                          </ComboboxGroup>
                        );
                      })}
                    </ComboboxList>
                    {hasMoreHistory && (
                      <div
                        ref={sentinelRef}
                        aria-hidden="true"
                        className="h-px shrink-0"
                      />
                    )}
                  </div>

                  {!hasResults && <ComboboxEmpty />}

                  <div className="flex items-center justify-between border-border-subtle border-t pt-2 pr-1.5 pb-1 pl-2.5">
                    <label
                      htmlFor="show-active-agents"
                      className="cursor-pointer text-muted-foreground text-xs"
                    >
                      Show active in sidebar
                    </label>
                    <Switch
                      size="xs"
                      id="show-active-agents"
                      checked={showActiveAgents}
                      onCheckedChange={handleToggleActiveAgents}
                    />
                  </div>
                </ComboboxBase.Popup>

                {/* Animated side panel for agent preview. Appears next to the
                    highlighted row and follows its vertical position. The
                    outer wrapper is invisible — visible card styling lives
                    inside `AgentPreviewPanel` so it can render `null` when
                    there is nothing to show (e.g. empty/new agents), without
                    leaving an empty bordered box here. */}
                {hoveredAgentId && isHoveredAgentVisible && (
                  <div
                    ref={sidePanelRef}
                    onMouseEnter={cancelPendingClear}
                    onMouseLeave={scheduleClear}
                    className="absolute left-full ml-1 transition-[top] duration-100 ease-out"
                    style={{ top: sidePanelOffset }}
                  >
                    <AgentPreviewPanel
                      // Force a fresh component instance on every agentId
                      // change so state initializers re-run and no stale
                      // preview from the previous agent can flash. The
                      // parent-owned cache still serves instant re-hovers.
                      key={hoveredAgentId}
                      agentId={hoveredAgentId}
                      isActive={activeAgentIdSet.has(hoveredAgentId)}
                      cache={previewCacheRef.current}
                    />
                  </div>
                )}
              </div>
            </ComboboxBase.Positioner>
          </ComboboxBase.Portal>
        )}
      </Combobox>
      <SharedAgentContextMenuHost
        target={ctxMenuTarget}
        onClose={handleCtxMenuClose}
        onArchive={handleArchiveAgent}
        onDeleteRequest={handleCtxDeleteRequest}
      />
      <DeleteConfirmPopover
        open={ctxDeleteId !== null}
        isolated
        onOpenChange={(open) => {
          if (!open) handleCtxDeleteCancel();
        }}
        onConfirm={handleCtxDeleteConfirm}
      />
    </>
  );
}
