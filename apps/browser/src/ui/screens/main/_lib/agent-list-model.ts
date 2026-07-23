import type {
  AgentHistoryEntry,
  AgentHistoryWorkspaceEntry,
} from '@shared/karton-contracts/ui/agent';
import type {
  AppState,
  MountEntry,
  WorkspaceGitWorktreeInfo,
  WorkspaceGitWorktreesResult,
} from '@shared/karton-contracts/ui';
import { getBaseName, normalizePath } from '@shared/path-utils';

export type AgentWorkspaceEntry = Pick<MountEntry, 'path' | 'git'> & {
  permissions?: AgentHistoryWorkspaceEntry['permissions'];
  prefix?: string;
};

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
  mountedWorkspaces: AgentWorkspaceEntry[];
};

/** Unified entry for the merged active + history list. */
export type MergedAgentEntry = ActiveAgentCardData & {
  /** True when this agent is currently loaded in-memory (active instance). */
  isLive: boolean;
};

export type AgentStateSeverity = 'error' | 'warning' | 'success' | 'info';

type AgentStateIndicators = Pick<
  ActiveAgentCardData,
  'hasError' | 'isWaitingForUser' | 'isWorking' | 'unread'
>;

export type WorkspaceAgentRow = {
  agent: MergedAgentEntry;
  workspace: AgentWorkspaceEntry;
};

export type WorkspaceWorktreeGroup = {
  key: string;
  label: string;
  path: string;
  branch: string | null;
  isRoot: boolean;
  /**
   * Worktree creation time in epoch ms (from git), or `null` until the
   * worktree list resolves. Drives newest-first ordering in the sidebar.
   */
  createdAt: number | null;
  severity: AgentStateSeverity | null;
  agents: WorkspaceAgentRow[];
};

export type WorkspaceRepoGroup = {
  key: string;
  label: string;
  path: string;
  git: AgentWorkspaceEntry['git'];
  isGit: boolean;
  severity: AgentStateSeverity | null;
  directAgents: WorkspaceAgentRow[];
  worktrees: WorkspaceWorktreeGroup[];
};

export type WorkspaceGroupOrder = {
  repoKeys: string[];
  worktreeKeysByRepo: Record<string, string[]>;
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
      ai.unread !== bi.unread ||
      ai.mountedWorkspaces.length !== bi.mountedWorkspaces.length
    )
      return false;

    for (let j = 0; j < ai.mountedWorkspaces.length; j++) {
      const aw = ai.mountedWorkspaces[j]!;
      const bw = bi.mountedWorkspaces[j]!;
      if (
        aw.path !== bw.path ||
        aw.prefix !== bw.prefix ||
        aw.git?.repositoryId !== bw.git?.repositoryId ||
        aw.git?.worktreeId !== bw.git?.worktreeId ||
        aw.git?.branch !== bw.git?.branch ||
        aw.git?.headSha !== bw.git?.headSha ||
        aw.git?.isWorktree !== bw.git?.isWorktree ||
        aw.git?.mainWorktreePath !== bw.git?.mainWorktreePath
      )
        return false;
    }
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
      mountedWorkspaces: e.mountedWorkspaces ?? [],
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
        // Live toolbox mounts win once present. While an agent is still
        // (re)mounting its toolbox entry briefly reports zero mounts, so fall
        // back to the persisted history mounts to avoid flicker. The history
        // list is filtered to existing paths (and refetched after worktree
        // deletions), so this fallback never resurrects a deleted workspace.
        mountedWorkspaces:
          a.mountedWorkspaces.length > 0
            ? a.mountedWorkspaces
            : (h?.mountedWorkspaces ?? []),
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

export function getActiveAgentStateIndicators(
  instance: AppState['agents']['instances'][string],
  toolboxEntry: AppState['toolbox'][string] | undefined,
): AgentStateIndicators {
  let hasPendingToolApproval = false;
  for (let i = instance.state.history.length - 1; i >= 0; i--) {
    const message = instance.state.history[i];
    if (message?.role !== 'assistant') continue;
    hasPendingToolApproval = message.parts.some(
      (part) => (part as { state?: string }).state === 'approval-requested',
    );
    break;
  }

  return {
    hasError:
      !!instance.state.error &&
      instance.state.error.kind !== 'plan-limit-exceeded',
    isWaitingForUser:
      !!toolboxEntry?.pendingUserQuestion || hasPendingToolApproval,
    isWorking: instance.state.isWorking,
    unread: !!instance.state.unread,
  };
}

export function getAgentStateSeverity(
  agent: AgentStateIndicators,
): AgentStateSeverity | null {
  if (agent.hasError) return 'error';
  if (agent.isWaitingForUser) return 'warning';
  if (agent.isWorking) return 'info';
  if (agent.unread) return 'success';
  return null;
}

export function maxSeverity(
  values: ReadonlyArray<AgentStateSeverity | null>,
): AgentStateSeverity | null {
  let best: AgentStateSeverity | null = null;
  const priority: Record<AgentStateSeverity, number> = {
    error: 4,
    warning: 3,
    success: 2,
    info: 1,
  };
  values.forEach((value) => {
    if (!value) return;
    if (!best || priority[value] > priority[best]) best = value;
  });
  return best;
}

export function getSeverityDotClass(
  severity: AgentStateSeverity | null,
): string | null {
  switch (severity) {
    case 'error':
      return 'bg-error-solid';
    case 'warning':
      return 'bg-warning-solid';
    case 'success':
      return 'bg-success-solid';
    case 'info':
      return 'bg-primary-solid';
    default:
      return null;
  }
}

export function getWorkspaceGroupKey(workspace: AgentWorkspaceEntry): string {
  return workspace.git
    ? `git:${workspace.git.repositoryId}`
    : `dir:${normalizePath(workspace.path)}`;
}

export function getWorktreeGroupKey(workspace: AgentWorkspaceEntry): string {
  if (!workspace.git) return `dir:${normalizePath(workspace.path)}`;
  if (!workspace.git.isWorktree) return 'root';
  return `worktree:${workspace.git.worktreeId}`;
}

export function formatWorktreeLabel(
  worktree:
    | Pick<
        WorkspaceGitWorktreeInfo,
        'path' | 'branch' | 'headSha' | 'isMainWorktree'
      >
    | {
        path: string;
        branch: string | null;
        headSha?: string | null;
        isMainWorktree?: boolean;
      },
): string {
  const pathName = worktree.isMainWorktree
    ? 'Root'
    : getBaseName(worktree.path) || worktree.path;
  const ref = worktree.branch ?? worktree.headSha?.slice(0, 7) ?? null;
  if (!ref || ref === pathName) return pathName;
  return `${pathName} (${ref})`;
}

function getRepoLabel(workspace: AgentWorkspaceEntry): string {
  if (!workspace.git) return getBaseName(workspace.path) || workspace.path;
  const pathName = workspace.git.mainWorktreePath ?? workspace.git.repoRoot;
  return getBaseName(pathName) || pathName;
}

function getRepoPath(workspace: AgentWorkspaceEntry): string {
  return (
    workspace.git?.mainWorktreePath ?? workspace.git?.repoRoot ?? workspace.path
  );
}

/**
 * Orders worktree groups for the sidebar: the root worktree is always pinned
 * to the top, then the rest sort strictly by age, newest first, using the
 * git-provided `createdAt` timestamp. Worktrees without a timestamp (not yet
 * resolved from the worktree list) sink to the bottom. Ties fall back to the
 * stable group key so the order stays deterministic across renders.
 */
function compareWorktreesByAge(
  a: WorkspaceWorktreeGroup,
  b: WorkspaceWorktreeGroup,
): number {
  if (a.isRoot !== b.isRoot) return Number(b.isRoot) - Number(a.isRoot);
  const aCreated = a.createdAt ?? -1;
  const bCreated = b.createdAt ?? -1;
  if (aCreated !== bCreated) return bCreated - aCreated;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function orderByStableKeys<T extends { key: string }>(
  values: T[],
  orderedKeys: string[] | undefined,
  newItemSort?: (a: T, b: T) => number,
): T[] {
  if (!orderedKeys || orderedKeys.length === 0) {
    if (newItemSort) return [...values].sort(newItemSort);
    return values;
  }
  const byKey = new Map(values.map((value) => [value.key, value]));
  const used = new Set<string>();
  const ordered: T[] = [];
  for (const key of orderedKeys) {
    const value = byKey.get(key);
    if (!value) continue;
    ordered.push(value);
    used.add(key);
  }
  const newItems: T[] = [];
  for (const value of values) {
    if (!used.has(value.key)) newItems.push(value);
  }
  if (newItemSort) newItems.sort(newItemSort);
  ordered.push(...newItems);
  return ordered;
}

export function buildWorkspaceAgentGroups({
  entries,
  worktreeLists,
  groupOrder,
}: {
  entries: MergedAgentEntry[];
  pinnedIds: ReadonlySet<string>;
  worktreeLists: ReadonlyMap<string, WorkspaceGitWorktreesResult | null>;
  groupOrder: WorkspaceGroupOrder;
}): WorkspaceRepoGroup[] {
  const repoGroups = new Map<string, WorkspaceRepoGroup>();

  for (const agent of entries) {
    for (const workspace of agent.mountedWorkspaces) {
      const repoKey = getWorkspaceGroupKey(workspace);
      let repo = repoGroups.get(repoKey);
      if (!repo) {
        repo = {
          key: repoKey,
          label: getRepoLabel(workspace),
          path: getRepoPath(workspace),
          git: workspace.git,
          isGit: workspace.git !== null,
          severity: null,
          directAgents: [],
          worktrees: [],
        };
        repoGroups.set(repoKey, repo);
      }

      const row = { agent, workspace };
      if (!workspace.git) {
        repo.directAgents.push(row);
        continue;
      }

      const worktreeKey = getWorktreeGroupKey(workspace);
      let worktree = repo.worktrees.find((group) => group.key === worktreeKey);
      if (!worktree) {
        worktree = {
          key: worktreeKey,
          label: formatWorktreeLabel({
            path: workspace.path,
            branch: workspace.git.branch,
            headSha: workspace.git.headSha,
            isMainWorktree: !workspace.git.isWorktree,
          }),
          path: workspace.path,
          branch: workspace.git.branch,
          isRoot: !workspace.git.isWorktree,
          createdAt: null,
          severity: null,
          agents: [],
        };
        repo.worktrees.push(worktree);
      }
      worktree.agents.push(row);
    }
  }

  Array.from(repoGroups.values()).forEach((repo) => {
    const worktreeList = repo.git
      ? worktreeLists.get(repo.git.repositoryId)
      : undefined;
    if (worktreeList) {
      worktreeList.worktrees.forEach((item) => {
        const key = item.isMainWorktree
          ? 'root'
          : `worktree:${item.worktreeId}`;
        const existing = repo.worktrees.find((group) => group.key === key);
        if (existing) {
          existing.branch = item.branch;
          existing.label = formatWorktreeLabel(item);
          existing.isRoot = item.isMainWorktree;
          existing.createdAt = item.createdAt;
          return;
        }
        repo.worktrees.push({
          key,
          label: formatWorktreeLabel(item),
          path: item.path,
          branch: item.branch,
          isRoot: item.isMainWorktree,
          createdAt: item.createdAt,
          severity: null,
          agents: [],
        });
      });
    }

    repo.worktrees = orderByStableKeys<WorkspaceWorktreeGroup>(
      repo.worktrees,
      groupOrder.worktreeKeysByRepo[repo.key],
      compareWorktreesByAge,
    );

    repo.worktrees.forEach((worktree) => {
      worktree.severity = maxSeverity(
        worktree.agents.map((row) => getAgentStateSeverity(row.agent)),
      );
    });

    repo.severity = maxSeverity(
      repo.directAgents
        .map((row) => getAgentStateSeverity(row.agent))
        .concat(repo.worktrees.map((worktree) => worktree.severity)),
    );
  });

  return orderByStableKeys(
    Array.from(repoGroups.values()),
    groupOrder.repoKeys,
  );
}
