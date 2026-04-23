import posthog from 'posthog-js';
import { cn } from '@ui/utils';
import { IconDotsFill18, IconPlusFill18 } from 'nucleo-ui-fill-18';
import { IconGear2Outline24 } from 'nucleo-core-outline-24';
import { IconSidebarLeftHideOutline18 } from 'nucleo-ui-outline-18';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Button } from '@stagewise/stage-ui/components/button';
import { Select, type SelectItem } from '@stagewise/stage-ui/components/select';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { HotkeyActions } from '@shared/hotkeys';
import { HotkeyComboText } from '@ui/components/hotkey-combo-text';
import { SETTINGS_PAGE_URL } from '@shared/internal-urls';
import { useChatDraft } from '@ui/hooks/use-chat-draft';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import {
  AgentTypes,
  type AgentHistoryEntry,
} from '@shared/karton-contracts/ui/agent';
import { EMPTY_MOUNTS } from '@shared/karton-contracts/ui';
import { useEmptyAgentId } from '@ui/hooks/use-empty-agent';
import { AgentsSelector, type AgentGroup } from './_components/agents-selector';

// Static menu items — no component state captured, safe at module scope.
const menuItems: SelectItem[] = [
  {
    value: 'settings',
    label: (
      <span className="flex items-center gap-1.5">
        <IconGear2Outline24 className="size-3.5 text-muted-foreground" />
        <span>Settings</span>
      </span>
    ),
  },
];

// Static trigger renderer — takes triggerProps as argument, captures nothing.
const menuTrigger = (
  triggerProps: React.ComponentPropsWithoutRef<'button'>,
) => (
  <Tooltip>
    <TooltipTrigger>
      <Button
        {...triggerProps}
        variant="ghost"
        size="icon-xs"
        className="app-no-drag shrink-0"
      >
        <IconDotsFill18 className="size-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">
      <span>More options</span>
    </TooltipContent>
  </Tooltip>
);

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

export function SidebarTopSection({ isCollapsed }: { isCollapsed: boolean }) {
  const createAgent = useKartonProcedure((p) => p.agents.create);
  const resumeAgent = useKartonProcedure((p) => p.agents.resume);
  const deleteAgent = useKartonProcedure((p) => p.agents.delete);
  const setAgentTitle = useKartonProcedure((p) => p.agents.setTitle);
  const getAgentsHistoryList = useKartonProcedure(
    (p) => p.agents.getAgentsHistoryList,
  );
  const platform = useKartonState((s) => s.appInfo.platform);
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);
  const showActiveAgentsPref = useKartonState(
    (s) => s.preferences.sidebar?.showActiveAgents ?? true,
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

  const createTab = useKartonProcedure((p) => p.browser.createTab);
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
  const activeAgentsList = useKartonState(
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

  const activeAgentIds = useKartonState(
    useComparingSelector((s) => Object.keys(s.agents.instances)),
  );
  const activeAgentIdSet = useMemo(
    () => new Set(activeAgentIds),
    [activeAgentIds],
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

  const showChatListButton = agentsList.length > 0 || activeAgentIdSet.size > 1;
  // Hide the new-chat button when the ActiveAgentsGrid is visible
  // (preference on AND 2+ CHAT agents), since it has its own "New agent" button.
  const showNewChatButton =
    openAgent !== null &&
    (!showActiveAgentsPref || activeAgentsList.length < 2);

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

  const [emptyAgentId, emptyAgentIdRef] = useEmptyAgentId();

  // The button is only enabled when creating/switching would actually do
  // something: disabled when the open agent is already the empty agent
  // (clicking would be a no-op since createAgentAndFocus just refocuses it).
  const canCreateAgent = openAgent !== null && emptyAgentId !== openAgent;

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

  // Helper to create a new chat and focus the input.
  // openAgentModelId is read via ref — it's only needed at invocation time
  // and should NOT cause this callback to be recreated on model changes.
  const createAgentAndFocus = useCallback(async () => {
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
  }, [createAgent, getDraft, getAgentsHistoryList]);

  const handleCreateAgent = useCallback(() => {
    void createAgentAndFocus();
  }, [createAgentAndFocus]);

  // Hotkey: CTRL+N to create new agent chat (works regardless of which section
  // shows the "Add agent" button — top section or active agents grid).
  // Disabled when the open agent is already empty (nothing to create).
  useHotKeyListener(() => {
    if (openAgent !== null && emptyAgentIdRef.current !== openAgent)
      void createAgentAndFocus();
  }, HotkeyActions.NEW_CHAT);

  const resumeAgentRef = useRef(resumeAgent);
  resumeAgentRef.current = resumeAgent;

  const handleAgentSelect = useCallback(
    (value: string | null) => {
      if (!value) return;
      if (value !== openAgentRef.current) {
        resumeAgentRef.current(value).then(() => {
          setOpenAgent(value);
        });
      }
    },
    [setOpenAgent],
  );

  // Handle menu selection
  const handleMenuSelect = useCallback(
    (value: string | null) => {
      if (value === 'settings') createTab(SETTINGS_PAGE_URL, true);
    },
    [createTab],
  );

  return (
    <div
      className={cn(
        'app-drag flex h-7 flex-row items-center justify-start gap-2 border-border-subtle border-b pb-1 group-data-[collapsed=true]:hidden',
        platform === 'darwin' && !isFullScreen ? 'pl-18' : 'ml-0',
      )}
    >
      <div className="flex-1 shrink-0 group-data-[collapsed=true]:hidden" />
      {!isCollapsed && (
        <div className="@[240px]:flex hidden shrink-0 flex-row items-center">
          {showNewChatButton && (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  disabled={!canCreateAgent}
                  onClick={handleCreateAgent}
                >
                  <IconPlusFill18 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>
                  Create new agent (
                  <HotkeyComboText action={HotkeyActions.NEW_CHAT} />)
                </span>
              </TooltipContent>
            </Tooltip>
          )}
          {showChatListButton && (
            <AgentsSelector
              groups={agentGroups}
              value={openAgent}
              onValueChange={handleAgentSelect}
              onDelete={handleDeleteAgent}
              onRename={handleRenameAgent}
              onEndReached={loadMoreHistory}
            />
          )}
          <Select
            items={menuItems}
            value={null}
            onValueChange={handleMenuSelect}
            side="bottom"
            sideOffset={8}
            popupClassName="max-w-64"
            size="xs"
            showItemIndicator={false}
            customTrigger={menuTrigger}
          />
          <div className="mx-0.5 h-3.5 w-px shrink-0 bg-border-subtle" />
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-xs"
                className="app-no-drag shrink-0"
                onClick={() =>
                  window.dispatchEvent(new Event('sidebar-chat-panel-closed'))
                }
              >
                <IconSidebarLeftHideOutline18 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span>Hide sidebar</span>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

type TimeAgoLabel = string;

/**
 * Groups chat summaries by time labels (Today, Yesterday, etc.)
 * @param chatList The chat summaries to group (already sorted by updatedAt desc)
 * @returns Grouped chats by time label, each group containing an array of ChatSummary
 */
function groupChatsByTime(
  agentsList: AgentHistoryEntry[],
): Record<TimeAgoLabel, AgentHistoryEntry[]> {
  // Hoist Date allocations outside the per-item helper — avoids creating
  // 3 Date objects per agent entry in the list.
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStartMs = todayStart.getTime();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();

  // Uses calendar-day boundaries (midnight in user's timezone) instead of
  // absolute time differences for more intuitive "Yesterday" grouping
  function getTimeLabel(date: Date): string {
    const chatDate = new Date(date);

    // Calculate calendar days ago (based on midnight boundaries)
    const diffFromTodayStart = todayStartMs - chatDate.getTime();
    const calendarDaysAgo = Math.ceil(
      diffFromTodayStart / (1000 * 60 * 60 * 24),
    );

    // Daily grouping (0-7 days)
    if (calendarDaysAgo <= 0) return 'Today'; // chatDate >= todayStart
    if (calendarDaysAgo === 1) return 'Yesterday';
    if (calendarDaysAgo >= 2 && calendarDaysAgo <= 7)
      return `${calendarDaysAgo} days ago`;

    // Weekly grouping (8-29 days)
    if (calendarDaysAgo < 30) {
      const weeksAgo = Math.floor(calendarDaysAgo / 7);
      return weeksAgo === 1 ? 'last week' : `${weeksAgo} weeks ago`;
    }

    // Monthly grouping (30 days to 1 year)
    const chatYear = chatDate.getFullYear();
    const chatMonth = chatDate.getMonth();

    const monthsDiff = (nowYear - chatYear) * 12 + (nowMonth - chatMonth);

    if (monthsDiff < 12)
      return monthsDiff === 1 ? 'Last month' : `${monthsDiff} months ago`;

    // Yearly grouping (1+ years)
    const yearsDiff = nowYear - chatYear;
    return yearsDiff === 1 ? '1 year ago' : `${yearsDiff} years ago`;
  }

  // Group chats by time label (chatList is already sorted by updatedAt desc)
  const grouped: Record<string, AgentHistoryEntry[]> = {};

  for (const agent of agentsList) {
    const label = getTimeLabel(agent.lastMessageAt);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(agent);
  }

  return grouped;
}
