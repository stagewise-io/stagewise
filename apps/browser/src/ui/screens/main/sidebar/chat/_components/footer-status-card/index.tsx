import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import {
  useKartonState,
  useKartonProcedure,
  useComparingSelector,
} from '@ui/hooks/use-karton';
import {
  AgentTypes,
  type AgentMessage,
} from '@shared/karton-contracts/ui/agent';
import type {
  Mount,
  ShellSessionSnapshot,
} from '@shared/karton-contracts/ui/agent/metadata';
import { EMPTY_MOUNTS } from '@shared/karton-contracts/ui';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { useFileIDEHref } from '@ui/hooks/use-file-ide-href';
import {
  type StatusCardSection,
  type FormattedFileDiff,
  StatusCardComponent,
} from './shared';
import { FileDiffSection, formatFileDiff } from './file-diff-section';
import { MessageQueueSection } from './message-queue-section';
import {
  WorkspaceMdStatusSection,
  type WorkspaceMdStatus,
} from './workspace-md-section';
import { UserQuestionSection } from './user-question-section';
import { getBaseName } from '@shared/path-utils';
import { getAgentOwnedPlanPaths, PLANS_PREFIX } from '@shared/plan-ownership';
import { getAgentOwnedLogPaths, LOGS_PREFIX } from '@shared/log-ownership';
import { buildPlanSections, type PlanEntry } from './plan-section';
import {
  buildLogChannelSections,
  type LogChannelDisplayEntry,
} from './log-channel-section';
import { getPlanUIPhases, type LivePlanData } from '@shared/plan-lifecycle';
import { useSendImplement } from '@ui/hooks/use-send-implement';
import { ShellSessionsSection } from './shell-sessions-section';

// Stable empty arrays/sets to avoid infinite loop with useSyncExternalStore
const EMPTY_HISTORY: AgentMessage[] = [];
const EMPTY_QUEUE: (AgentMessage & { role: 'user' })[] = [];
const EMPTY_MOUNTS_SNAPSHOT: Mount[] = [];
const EMPTY_SHELL_SESSIONS: ShellSessionSnapshot[] = [];
const EMPTY_SET = new Set<string>();

type WorkspaceMdAgentEntry = {
  agentId: string;
  workspacePath: string;
  isWorking: boolean;
  error?: { code?: number; message: string; stack?: string };
};

function compareAgentEntries(
  a: WorkspaceMdAgentEntry[],
  b: WorkspaceMdAgentEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i]?.agentId !== b[i]?.agentId ||
      a[i]?.workspacePath !== b[i]?.workspacePath ||
      a[i]?.isWorking !== b[i]?.isWorking ||
      a[i]?.error !== b[i]?.error
    )
      return false;
  }
  return true;
}

export function StatusCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const previousHeightRef = useRef(0);
  const [openAgentId] = useOpenAgent();
  const pendingDiffs = useKartonState((s) =>
    openAgentId ? s.toolbox[openAgentId]?.pendingFileDiffs : undefined,
  );
  const diffSummary = useKartonState((s) =>
    openAgentId ? s.toolbox[openAgentId]?.editSummary : undefined,
  );

  const rejectAllPendingEdits = useKartonProcedure(
    (p) => p.toolbox.rejectHunks,
  );
  const acceptAllPendingEdits = useKartonProcedure(
    (p) => p.toolbox.acceptHunks,
  );
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const goToUrl = useKartonProcedure((p) => p.browser.goto);
  const tabs = useKartonState((s) => s.browser.tabs);

  const messageQueue = useKartonState((s) =>
    openAgentId
      ? (s.agents.instances[openAgentId]?.state.queuedMessages ?? EMPTY_QUEUE)
      : EMPTY_QUEUE,
  );

  const workspaceMounts = useKartonState((s) =>
    openAgentId
      ? (s.toolbox[openAgentId]?.workspace?.mounts ?? EMPTY_MOUNTS)
      : EMPTY_MOUNTS,
  );

  const globalPlans = useKartonState((s) => s.plans);
  const globalLogChannels = useKartonState((s) => s.logChannels);
  const clearLogChannel = useKartonProcedure((p) => p.toolbox.clearLogChannel);

  // agentHistory is used for plan ownership/phases but NOT for rendering.
  // Subscribe silently via ref so streaming chunks (which mutate the last
  // message in-place and produce a new Immer reference) don't trigger
  // re-renders.  `historyLen` is a primitive that only changes when
  // messages are added/removed — use it as the useMemo trigger.
  const agentHistoryRef = useRef<AgentMessage[]>(EMPTY_HISTORY);
  useKartonState((s) => {
    agentHistoryRef.current = openAgentId
      ? (s.agents.instances[openAgentId]?.state.history ?? EMPTY_HISTORY)
      : EMPTY_HISTORY;
    return null;
  });
  const historyLen = useKartonState((s) =>
    openAgentId
      ? (s.agents.instances[openAgentId]?.state.history?.length ?? 0)
      : 0,
  );

  const isAgentWorking = useKartonState((s) =>
    openAgentId
      ? (s.agents.instances[openAgentId]?.state.isWorking ?? false)
      : false,
  );

  // All mounts ever seen in env snapshots (survives workspace disconnects).
  // Extraction is done inside the selector so we don't subscribe to the
  // full history array (which gets a new Immer reference on every streaming
  // chunk).  `useComparingSelector` ensures we only re-render when the
  // actual set of mount prefixes changes.
  const resolvedMounts = useKartonState(
    useComparingSelector(
      (s): Mount[] => {
        const history = openAgentId
          ? s.agents.instances[openAgentId]?.state.history
          : undefined;
        if (!history || history.length === 0) return EMPTY_MOUNTS_SNAPSHOT;
        const mountsByPrefix = new Map<string, Mount>();
        for (const msg of history) {
          const mounts = msg?.metadata?.environmentSnapshot?.workspace?.mounts;
          if (!mounts) continue;
          for (const mount of mounts) {
            if (!mountsByPrefix.has(mount.prefix)) {
              mountsByPrefix.set(mount.prefix, mount);
            }
          }
        }
        return mountsByPrefix.size > 0
          ? Array.from(mountsByPrefix.values())
          : EMPTY_MOUNTS_SNAPSHOT;
      },
      (a, b) => {
        if (a === b) return true;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (a[i]?.prefix !== b[i]?.prefix) return false;
        }
        return true;
      },
    ),
  );

  // Set of currently connected mount paths
  const activeMountPaths = useMemo(() => {
    if (workspaceMounts.length === 0) return EMPTY_SET;
    return new Set(workspaceMounts.map((m) => m.path));
  }, [workspaceMounts]);

  const generateWorkspaceMd = useKartonProcedure(
    (p) => p.toolbox.generateWorkspaceMd,
  );
  const stopAgent = useKartonProcedure((p) => p.agents.stop);

  const shellSessions = useKartonState(
    useComparingSelector(
      (s): ShellSessionSnapshot[] =>
        openAgentId
          ? (s.toolbox[openAgentId]?.shells?.sessions ?? EMPTY_SHELL_SESSIONS)
          : EMPTY_SHELL_SESSIONS,
      (a, b) => {
        if (a === b) return true;
        if (a.length !== b.length) return false;
        return a.every(
          (s, i) =>
            s.id === b[i]?.id &&
            s.exited === b[i]?.exited &&
            s.lineCount === b[i]?.lineCount &&
            s.tailContent === b[i]?.tailContent &&
            s.lastLine === b[i]?.lastLine,
        );
      },
    ),
  );

  const killShellSession = useKartonProcedure(
    (p) => p.toolbox.killShellSession,
  );

  // All workspace-md agent instances with their workspace paths
  const workspaceMdAgents = useKartonState(
    useComparingSelector((s): WorkspaceMdAgentEntry[] => {
      const entries: WorkspaceMdAgentEntry[] = [];
      for (const agentId in s.agents.instances) {
        const inst = s.agents.instances[agentId];
        if (!inst || inst.type !== AgentTypes.WORKSPACE_MD) continue;
        const path = s.toolbox[agentId]?.workspace?.mounts?.[0]?.path;
        if (!path) continue;
        entries.push({
          agentId,
          workspacePath: path,
          isWorking: inst.state.isWorking,
          error: inst.state.error,
        });
      }
      return entries;
    }, compareAgentEntries),
  );

  // Histories for workspace-md agents (selected as frozen subtree refs)
  const workspaceMdHistoriesByAgentId = useKartonState(
    useComparingSelector((s) => {
      const map: Record<string, AgentMessage[]> = {};
      for (const agentId in s.agents.instances) {
        const inst = s.agents.instances[agentId];
        if (!inst || inst.type !== AgentTypes.WORKSPACE_MD) continue;
        map[agentId] = inst.state.history;
      }
      return map;
    }),
  );

  // Per-workspace-path local state for lifecycle tracking
  const [completedPaths, setCompletedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [errorsByPath, setErrorsByPath] = useState<Map<string, string>>(
    () => new Map(),
  );
  const prevAgentStatesRef = useRef<Map<string, boolean>>(new Map());
  const stoppedByUserRef = useRef<Set<string>>(new Set());

  // Detect running→stopped transitions per agent and update local state
  useEffect(() => {
    const prev = prevAgentStatesRef.current;
    const next = new Map<string, boolean>();

    for (const agent of workspaceMdAgents) {
      next.set(agent.agentId, agent.isWorking);
      const wasWorking = prev.get(agent.agentId) ?? false;

      if (wasWorking && !agent.isWorking) {
        const userStopped = stoppedByUserRef.current.has(agent.agentId);
        stoppedByUserRef.current.delete(agent.agentId);

        if (agent.error) {
          setErrorsByPath((m) => {
            const copy = new Map(m);
            copy.set(agent.workspacePath, agent.error!.message);
            return copy;
          });
        } else if (!userStopped) {
          const mount = workspaceMounts.find(
            (m) => m.path === agent.workspacePath,
          );
          if (mount?.workspaceMdContent !== null) {
            setCompletedPaths((s) => {
              const copy = new Set(s);
              copy.add(agent.workspacePath);
              return copy;
            });
          }
        }
      }
    }

    prevAgentStatesRef.current = next;
  }, [workspaceMdAgents, workspaceMounts]);

  const { getFileIDEHref, needsIdePicker } = useFileIDEHref();

  const handleShowFile = useCallback(
    (workspacePath?: string) => {
      const filePath = workspacePath
        ? `${workspacePath}/.stagewise/WORKSPACE.md`
        : '.stagewise/WORKSPACE.md';
      if (needsIdePicker) {
        // Fall back to settings when no IDE has been configured yet
        void createTab(
          'stagewise://internal/agent-settings/skills-context',
          true,
        );
        return;
      }
      const href = getFileIDEHref(filePath);
      if (href && href !== '#') window.open(href, '_blank');
    },
    [needsIdePicker, getFileIDEHref, createTab],
  );

  // Procedure to remove a queued message
  const deleteQueuedMessage = useKartonProcedure(
    (p) => p.agents.deleteQueuedMessage,
  );

  // Procedure to send a queued message immediately (aborts current work)
  const flushQueue = useKartonProcedure((p) => p.agents.flushQueue);

  const pendingUserQuestion = useKartonState((s) =>
    openAgentId ? (s.toolbox[openAgentId]?.pendingUserQuestion ?? null) : null,
  );

  const submitUserQuestionStep = useKartonProcedure(
    (p) => p.toolbox.submitUserQuestionStep,
  );
  const cancelUserQuestion = useKartonProcedure(
    (p) => p.toolbox.cancelUserQuestion,
  );
  const goBackUserQuestion = useKartonProcedure(
    (p) => p.toolbox.goBackUserQuestion,
  );

  const openShellTerminalPage = useCallback((_sessionId: string) => {
    // No-op for now — terminal UI not yet available in this release.
  }, []);

  const openDiffReviewPage = useCallback(
    (fileId: string) => {
      if (!openAgentId) return;
      const baseUrl = `stagewise://internal/diff-review/${openAgentId}`;
      const fragment = fileId ? `#${encodeURIComponent(fileId)}` : '';
      const fullUrl = `${baseUrl}${fragment}`;

      // Reuse existing diff-review tab for this agent if one is already open
      const existingTab = Object.values(tabs).find((tab) =>
        tab.url.startsWith(baseUrl),
      );

      if (existingTab) {
        void switchTab(existingTab.id);
        // Navigate to updated URL (with new fragment) so the page
        // reloads and scrolls to the clicked file
        void goToUrl(fullUrl, existingTab.id);
      } else void createTab(fullUrl, true);
    },
    [openAgentId, createTab, switchTab, goToUrl, tabs],
  );

  const formattedPendingDiffs = useMemo(() => {
    const edits: FormattedFileDiff[] = [];
    for (const edit of pendingDiffs ?? []) edits.push(formatFileDiff(edit));

    return edits;
  }, [pendingDiffs]);

  const formattedDiffSummary = useMemo(() => {
    const edits: FormattedFileDiff[] = [];
    for (const edit of diffSummary ?? []) edits.push(formatFileDiff(edit));

    return edits;
  }, [diffSummary]);

  // Build workspace-md sections — one per mount
  const workspaceMdSections = useMemo(() => {
    const sections: StatusCardSection[] = [];

    // Build lookup: workspacePath → agent entry
    const agentByPath = new Map<string, WorkspaceMdAgentEntry>();
    for (const agent of workspaceMdAgents) {
      const existing = agentByPath.get(agent.workspacePath);
      if (!existing || agent.isWorking) {
        agentByPath.set(agent.workspacePath, agent);
      }
    }

    for (const mount of workspaceMounts) {
      const agent = agentByPath.get(mount.path);
      const folderName = getBaseName(mount.path) || mount.path;

      let status: WorkspaceMdStatus;
      let errorMessage: string | null = null;
      let history: AgentMessage[] = EMPTY_HISTORY;

      if (agent?.isWorking) {
        status = 'running';
        history = workspaceMdHistoriesByAgentId[agent.agentId] ?? EMPTY_HISTORY;
      } else if (completedPaths.has(mount.path)) {
        status = 'completed';
      } else if (errorsByPath.has(mount.path)) {
        status = 'error';
        errorMessage = errorsByPath.get(mount.path) ?? null;
      } else {
        continue;
      }

      const mountPath = mount.path;
      const mountPrefix = mount.prefix;
      const agentId = agent?.agentId;

      const section = WorkspaceMdStatusSection({
        status,
        sectionKey: `workspace-md-${mountPath}`,
        workspaceName: folderName,
        history,
        errorMessage,
        onDismiss: () => {
          setCompletedPaths((s) => {
            if (!s.has(mountPath)) return s;
            const copy = new Set(s);
            copy.delete(mountPath);
            return copy;
          });
          setErrorsByPath((m) => {
            if (!m.has(mountPath)) return m;
            const copy = new Map(m);
            copy.delete(mountPath);
            return copy;
          });
        },
        onShowFile: () => handleShowFile(mountPath),
        onGenerate: () => {
          if (!openAgentId) return;
          setErrorsByPath((m) => {
            if (!m.has(mountPath)) return m;
            const copy = new Map(m);
            copy.delete(mountPath);
            return copy;
          });
          void generateWorkspaceMd(openAgentId, mountPrefix);
        },
        onStop: agentId
          ? () => {
              stoppedByUserRef.current.add(agentId);
              void stopAgent(agentId);
            }
          : undefined,
      });
      if (section) sections.push(section);
    }

    return sections;
  }, [
    workspaceMounts,
    workspaceMdAgents,
    workspaceMdHistoriesByAgentId,
    completedPaths,
    errorsByPath,
    handleShowFile,
    openAgentId,
    generateWorkspaceMd,
    stopAgent,
  ]);

  // Active plans owned by this agent (excluding dismissed and just-created)
  const ownedPlans = useMemo(() => {
    const ownedPaths = getAgentOwnedPlanPaths(agentHistoryRef.current);
    if (ownedPaths.size === 0) return [];

    // Build live data map for phase computation
    const livePlanDataByPath = new Map<string, LivePlanData>();
    for (const plan of globalPlans) {
      const toolPath = `${PLANS_PREFIX}/${plan.filename}`;
      if (!ownedPaths.has(toolPath)) continue;
      livePlanDataByPath.set(toolPath, {
        totalTasks: plan.totalTasks,
        completedTasks: plan.completedTasks,
      });
    }

    // Derive phases for all owned plans in a single history pass
    const phases = getPlanUIPhases(
      agentHistoryRef.current,
      ownedPaths,
      isAgentWorking,
      livePlanDataByPath,
    );

    const plans: PlanEntry[] = [];
    for (const plan of globalPlans) {
      const toolPath = `${PLANS_PREFIX}/${plan.filename}`;
      if (!ownedPaths.has(toolPath)) continue;

      const phase = phases.get(toolPath) ?? 'awaiting-action';

      // Hide plans that are still in the just-created phase
      // (create-plan.tsx owns the UI for those)
      if (phase === 'just-created') continue;

      // Auto-hide completed plans — the chat history card
      // (create-plan.tsx) already shows the final state.
      if (phase === 'completed') continue;

      plans.push({ ...plan, phase });
    }

    return plans;
  }, [historyLen, globalPlans, isAgentWorking]);

  // Log channels owned by this agent
  const ownedLogChannels = useMemo(() => {
    const ownedPaths = getAgentOwnedLogPaths(agentHistoryRef.current);
    if (ownedPaths.size === 0) return [];

    const channels: LogChannelDisplayEntry[] = [];
    for (const ch of globalLogChannels) {
      const toolPath = `${LOGS_PREFIX}/${ch.filename}`;
      if (!ownedPaths.has(toolPath)) continue;
      channels.push(ch);
    }
    return channels;
  }, [historyLen, globalLogChannels]);

  const handleOpenPlan = useCallback(
    (filename: string) => {
      const baseUrl = `stagewise://internal/plan/${encodeURIComponent(filename)}`;

      // Reuse existing plan tab for this plan if one is already open
      const existingTab = Object.values(tabs).find((tab) =>
        tab.url.startsWith(baseUrl),
      );

      if (existingTab) {
        void switchTab(existingTab.id);
        void goToUrl(baseUrl, existingTab.id);
      } else void createTab(baseUrl, true);
    },
    [createTab, switchTab, goToUrl, tabs],
  );

  const handleImplement = useSendImplement();

  // Create status card items
  const items = useMemo(() => {
    const result: StatusCardSection[] = [];

    for (const section of workspaceMdSections) result.push(section);

    const shellSection = ShellSessionsSection({
      sessions: shellSessions,
      onKill: (sessionId) => {
        if (!openAgentId) return;
        void killShellSession(openAgentId, sessionId);
      },
      onOpenTerminal: openShellTerminalPage,
    });
    if (shellSection) result.push(shellSection);

    const userQuestionSection = UserQuestionSection({
      pendingQuestion: pendingUserQuestion,
      onSubmitStep: async (questionId, answers) => {
        if (!openAgentId) return;
        await submitUserQuestionStep(openAgentId, questionId, answers);
      },
      onCancel: async (questionId) => {
        if (!openAgentId) return;
        await cancelUserQuestion(openAgentId, questionId, 'user_cancelled');
      },
      onGoBack: async (questionId) => {
        if (!openAgentId) return;
        await goBackUserQuestion(openAgentId, questionId);
      },
    });

    if (userQuestionSection) result.push(userQuestionSection);
    const messageQueueSection = MessageQueueSection({
      queuedMessages: messageQueue ?? [],
      onRemoveMessage: async (messageId) => {
        if (!openAgentId) return;
        await deleteQueuedMessage(openAgentId, messageId);
      },
      onFlush: async () => {
        if (!openAgentId) return;
        await flushQueue(openAgentId);
      },
    });
    if (messageQueueSection) result.push(messageQueueSection);

    const planSections = buildPlanSections({
      plans: ownedPlans,
      onOpenPlan: handleOpenPlan,
      onImplement: handleImplement,
    });
    for (const section of planSections) result.push(section);

    const logSections = buildLogChannelSections({
      channels: ownedLogChannels,
      onClear: (filename) => {
        void clearLogChannel(filename);
      },
    });
    for (const section of logSections) result.push(section);

    const fileDiffSection = FileDiffSection({
      pendingDiffs: formattedPendingDiffs,
      diffSummary: formattedDiffSummary,
      resolvedMounts,
      activeMountPaths,
      onRejectAll: (hunkIds: string[]) => void rejectAllPendingEdits(hunkIds),
      onAcceptAll: (hunkIds: string[]) => void acceptAllPendingEdits(hunkIds),
      onOpenDiffReview: openDiffReviewPage,
    });
    if (fileDiffSection) result.push(fileDiffSection);

    return result;
  }, [
    workspaceMdSections,
    ownedPlans,
    ownedLogChannels,
    openAgentId,
    clearLogChannel,
    handleOpenPlan,
    handleImplement,
    messageQueue,
    deleteQueuedMessage,
    flushQueue,
    formattedPendingDiffs,
    formattedDiffSummary,
    resolvedMounts,
    activeMountPaths,
    rejectAllPendingEdits,
    acceptAllPendingEdits,
    openDiffReviewPage,
    pendingUserQuestion,
    submitUserQuestionStep,
    cancelUserQuestion,
    goBackUserQuestion,
    shellSessions,
    killShellSession,
    openShellTerminalPage,
  ]);

  // Sync card height with CSS variable for ChatHistory padding
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    // Set initial height immediately (no event dispatch - just CSS update)
    const hasContent = items.length > 0;
    const initialHeight = hasContent ? card.offsetHeight : 0;
    document.documentElement.style.setProperty(
      '--status-card-height',
      `${initialHeight}px`,
    );
    previousHeightRef.current = initialHeight;

    // Only dispatch events on actual resize changes (not initial mount)
    const resizeObserver = new ResizeObserver(() => {
      const height = hasContent ? card.offsetHeight : 0;

      document.documentElement.style.setProperty(
        '--status-card-height',
        `${height}px`,
      );

      previousHeightRef.current = height;
    });
    resizeObserver.observe(card);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.setProperty('--status-card-height', '0px');
    };
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <StatusCardComponent
      items={items}
      ref={cardRef as React.RefObject<HTMLDivElement>}
    />
  );
}
