import { useEffect, useMemo, useRef, useState } from 'react';
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

const AGENT_HISTORY_LIMIT = 30;

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
    if (msg.role === 'assistant') {
      for (let j = msg.parts.length - 1; j >= 0; j--) {
        const part = msg.parts[j]!;
        if (part.type === 'reasoning')
          return { text: 'Thinking…', isUserInput: false };
        if (part.type === 'text' && part.text?.trim()) {
          return {
            text: part.text.trim().split(/\s+/).slice(0, 10).join(' '),
            isUserInput: false,
          };
        }
      }
    }
    if (msg.role === 'user') {
      for (let j = msg.parts.length - 1; j >= 0; j--) {
        const part = msg.parts[j]!;
        if (part.type === 'text' && part.text?.trim()) {
          return {
            text: part.text.trim().split(/\s+/).slice(0, 10).join(' '),
            isUserInput: true,
          };
        }
      }
    }
  }

  if (inputState.trim()) return { text: inputState.trim(), isUserInput: true };
  return { text: '', isUserInput: false };
}

export function useAgentCommandItems(query: string) {
  const getAgentsHistoryList = useKartonProcedure(
    (p) => p.agents.getAgentsHistoryList,
  );
  const getAgentsHistoryListRef = useRef(getAgentsHistoryList);
  getAgentsHistoryListRef.current = getAgentsHistoryList;
  const pendingRemovals = useRef<ReadonlySet<string>>(new Set());
  const [historyList, setHistoryList] = useState<AgentHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
    let cancelled = false;
    setIsLoading(true);
    getAgentsHistoryListRef
      .current(0, AGENT_HISTORY_LIMIT, query.trim() || undefined)
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
  }, [query]);

  const items = useMemo<AgentCommandItem[]>(() => {
    const merged = mergeAgentEntries({
      activeAgents: agents,
      historyList,
      pendingRemovals: pendingRemovals.current,
    });

    return filterAndRankCommandCenterItems(
      merged.map(
        (agent): AgentCommandItem => ({
          id: `agent:${agent.id}`,
          kind: 'agent',
          mode: 'agents',
          title: agent.title || 'Untitled Agent',
          subtitle: agent.activityText || `${agent.messageCount} messages`,
          keywords: ['agent', agent.isLive ? 'active' : 'history'],
          agentId: agent.id,
          isLive: agent.isLive,
          isWorking: agent.isWorking,
          isWaitingForUser: agent.isWaitingForUser,
          unread: agent.unread,
          lastMessageAt: agent.lastMessageAt,
        }),
      ),
      query,
    );
  }, [agents, historyList, query]);

  return { items, isLoading };
}
