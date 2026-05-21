import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import {
  AgentTypes,
  type AgentHistoryEntry,
} from '@shared/karton-contracts/ui/agent';
import {
  activeAgentCardsEqual,
  mergeAgentEntries,
  type ActiveAgentCardData,
} from '../../_lib/agent-list-model';
import type { AgentCommandItem } from '../command-center-model';
import { filterAndRankCommandCenterItems } from '../command-center-search';
import { getToolActivityLabel } from '../../sidebar/agents-list/_utils/tool-label';
import { extractTipTapText, firstWords } from '@ui/utils/text-utils';

const AGENT_HISTORY_LIMIT = 30;
const AGENT_HISTORY_QUERY_DEBOUNCE_MS = 150;

function stringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function agentHistoryEntriesEqual(
  a: AgentHistoryEntry[],
  b: AgentHistoryEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (
      ai.id !== bi.id ||
      ai.title !== bi.title ||
      ai.createdAt !== bi.createdAt ||
      ai.lastMessageAt !== bi.lastMessageAt ||
      ai.messageCount !== bi.messageCount ||
      ai.parentAgentInstanceId !== bi.parentAgentInstanceId
    )
      return false;
  }
  return true;
}

function deriveActivityText(
  history: { role: string; parts: { type: string; text?: string }[] }[],
  inputState: string,
): { text: string; isUserInput: boolean } {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    if (msg.role !== 'assistant') continue;

    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j]!;
      if (part.type === 'reasoning')
        return { text: 'Thinking…', isUserInput: false };
      if (part.type === 'text') {
        const snippet = firstWords(part.text ?? '', 10);
        if (snippet) return { text: snippet, isUserInput: false };
        continue;
      }
      if (part.type.startsWith('tool-')) {
        return {
          text:
            firstWords(part.text ?? '', 10) || getToolActivityLabel(part.type),
          isUserInput: false,
        };
      }
    }
    break;
  }

  if (inputState) {
    const draftText = extractTipTapText(inputState).trim();
    const snippet = firstWords(draftText, 10, false);
    if (snippet) return { text: snippet, isUserInput: true };
  }

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

export function useAgentCommandItems(
  query: string,
  {
    optimisticAgentTitles,
    optimisticPinnedAgentIds,
    pendingRemovalAgentIds,
    enabled = true,
  }: {
    optimisticAgentTitles?: Readonly<Record<string, string>>;
    optimisticPinnedAgentIds?: string[] | null;
    pendingRemovalAgentIds?: ReadonlySet<string>;
    enabled?: boolean;
  } = {},
) {
  const getAgentsHistoryList = useKartonProcedure(
    (p) => p.agents.getAgentsHistoryList,
  );
  const getAgentsHistoryListRef = useRef(getAgentsHistoryList);
  getAgentsHistoryListRef.current = getAgentsHistoryList;
  const pendingRemovals = useRef<ReadonlySet<string>>(new Set());
  const [historyList, setHistoryList] = useState<AgentHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [debouncedHistoryQuery, setDebouncedHistoryQuery] = useState(query);
  const wasEnabledRef = useRef(enabled);

  const pinnedAgentIds = useKartonState(
    useComparingSelector(
      (s) => s.preferences.sidebar.pinnedAgentIds,
      stringArraysEqual,
    ),
  );

  const agents = useKartonState(
    useComparingSelector(
      (s): ActiveAgentCardData[] =>
        Object.entries(s.agents.instances)
          .filter(([_, agent]) => agent.type === AgentTypes.CHAT)
          .map(([id, agent]) => {
            const history = agent.state.history;
            const lastMsg = history[history.length - 1]!;
            const hasPendingQuestion = !!s.toolbox[id]?.pendingUserQuestion;
            const hasPendingToolApproval = (() => {
              for (let i = history.length - 1; i >= 0; i--) {
                const msg = history[i]!;
                if (msg.role !== 'assistant') continue;
                return msg.parts.some(
                  (p: { type: string; state?: string }) =>
                    p.state === 'approval-requested',
                );
              }
              return false;
            })();
            const rawActivity = hasPendingQuestion
              ? { text: 'Waiting for response...', isUserInput: false }
              : deriveActivityText(
                  history as {
                    role: string;
                    parts: { type: string; text?: string }[];
                  }[],
                  agent.state.inputState,
                );
            const activity =
              agent.state.isWorking && rawActivity.isUserInput
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
              createdAt: history[0]?.metadata?.createdAt
                ? new Date(history[0].metadata.createdAt).getTime()
                : 0,
              messageCount: history.length,
            };
          }),
      activeAgentCardsEqual,
    ),
  );

  useEffect(() => {
    const wasEnabled = wasEnabledRef.current;
    wasEnabledRef.current = enabled;

    if (!enabled) return;
    if (!wasEnabled) setDebouncedHistoryQuery(query);

    const timeout = window.setTimeout(() => {
      setDebouncedHistoryQuery(query);
    }, AGENT_HISTORY_QUERY_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [enabled, query]);

  const refreshHistoryList = useCallback(async () => {
    if (!enabled) return;
    const entries = await getAgentsHistoryListRef.current(
      0,
      AGENT_HISTORY_LIMIT,
      query.trim() || undefined,
    );
    setHistoryList((prev) =>
      agentHistoryEntriesEqual(prev, entries) ? prev : entries,
    );
  }, [enabled, query]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    if (debouncedHistoryQuery !== query) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    getAgentsHistoryListRef
      .current(
        0,
        AGENT_HISTORY_LIMIT,
        debouncedHistoryQuery.trim() || undefined,
      )
      .then((entries) => {
        if (cancelled) return;
        setHistoryList((prev) =>
          agentHistoryEntriesEqual(prev, entries) ? prev : entries,
        );
      })
      .catch((err) => {
        console.error('Failed to fetch command-center agent history:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedHistoryQuery, enabled]);

  const mergedAgents = useMemo(
    () =>
      enabled
        ? mergeAgentEntries({
            activeAgents: agents,
            historyList,
            pendingRemovals: pendingRemovalAgentIds ?? pendingRemovals.current,
          })
        : [],
    [agents, enabled, historyList, pendingRemovalAgentIds],
  );

  const rawAgentTitles = useMemo(
    () =>
      Object.fromEntries(
        mergedAgents.map((agent) => [
          agent.id,
          agent.title || 'Untitled Agent',
        ]),
      ),
    [mergedAgents],
  );

  const items = useMemo<AgentCommandItem[]>(() => {
    const pinnedAgentIdSet = new Set(
      optimisticPinnedAgentIds ?? pinnedAgentIds,
    );

    return filterAndRankCommandCenterItems(
      mergedAgents.map(
        (agent): AgentCommandItem => ({
          id: `agent:${agent.id}`,
          kind: 'agent',
          mode: 'agents',
          title:
            optimisticAgentTitles?.[agent.id] ??
            agent.title ??
            'Untitled Agent',
          subtitle: agent.activityText || `${agent.messageCount} messages`,
          keywords: ['agent', agent.isLive ? 'active' : 'history'],
          agentId: agent.id,
          isLive: agent.isLive,
          isWorking: agent.isWorking,
          isWaitingForUser: agent.isWaitingForUser,
          hasError: agent.hasError,
          unread: agent.unread,
          isPinned: pinnedAgentIdSet.has(agent.id),
          lastMessageAt: agent.lastMessageAt,
        }),
      ),
      query,
    );
  }, [
    mergedAgents,
    optimisticAgentTitles,
    optimisticPinnedAgentIds,
    pendingRemovalAgentIds,
    pinnedAgentIds,
    query,
  ]);

  return { items, isLoading, rawAgentTitles, refreshHistoryList };
}
