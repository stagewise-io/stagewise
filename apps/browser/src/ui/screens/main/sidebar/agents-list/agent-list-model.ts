import type { AgentHistoryEntry } from '@shared/karton-contracts/ui/agent';

export type ActiveAgentCardData = {
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
export type MergedAgentEntry = ActiveAgentCardData & {
  /** True when this agent is currently loaded in-memory (active instance). */
  isLive: boolean;
};

export function activeAgentCardsEqual(
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

export function mergeAgentEntries({
  activeAgents,
  historyList,
  pendingRemovals,
  now = Date.now(),
}: {
  activeAgents: ActiveAgentCardData[];
  historyList: AgentHistoryEntry[];
  pendingRemovals: ReadonlySet<string>;
  now?: number;
}): MergedAgentEntry[] {
  const activeById = new Map(activeAgents.map((a) => [a.id, a]));
  const historyById = new Map(historyList.map((e) => [e.id, e]));

  const historyEntries: MergedAgentEntry[] = historyList
    .filter((e) => !activeById.has(e.id) && !pendingRemovals.has(e.id))
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

  const activeEntries: MergedAgentEntry[] = activeAgents
    .filter((a) => !pendingRemovals.has(a.id))
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

  return sortAgentEntriesNewestFirst([...activeEntries, ...historyEntries]);
}

export function sortAgentEntriesNewestFirst(
  entries: MergedAgentEntry[],
): MergedAgentEntry[] {
  return entries.sort(
    (a, b) =>
      Math.max(b.lastMessageAt, b.createdAt) -
      Math.max(a.lastMessageAt, a.createdAt),
  );
}

export function getOrderedAgentIds(entries: MergedAgentEntry[]): string[] {
  return entries.map((agent) => agent.id);
}
