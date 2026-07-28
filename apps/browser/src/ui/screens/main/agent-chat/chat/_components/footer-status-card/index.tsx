import {
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  useKartonState,
  useKartonProcedure,
  useComparingSelector,
} from '@ui/hooks/use-karton';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type { Mount } from '@shared/karton-contracts/ui/agent/metadata';
import { EMPTY_MOUNTS } from '@shared/karton-contracts/ui';
import { getWorkspaceMountsFromMessage } from '@shared/env-metadata';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import {
  type StatusCardSection,
  type FormattedFileDiff,
  StatusCardComponent,
  getHunkIds,
} from './shared';
import { FileDiffSection, formatFileDiff } from './file-diff-section';
import { MessageQueueSection } from './message-queue-section';
import { AttachmentMetadataProvider } from '@ui/hooks/use-attachment-metadata';
import { createRafResizeObserver } from '@ui/utils/resize-observer';
import { MountedPathsProvider } from '@ui/hooks/use-mounted-paths';
import { UserQuestionSection } from './user-question-section';
import {
  getAgentOwnedPlanPaths,
  PLANS_PREFIX,
} from '@stagewise/agent-core/plans';
import { getAgentOwnedLogPaths, LOGS_PREFIX } from '@stagewise/agent-core/logs';
import { buildPlanSections, type PlanEntry } from './plan-section';
import {
  buildLogChannelSections,
  type LogChannelDisplayEntry,
} from './log-channel-section';
import { getPlanUIPhases, type LivePlanData } from '@shared/plan-lifecycle';
import { useSendImplement } from '@ui/hooks/use-send-implement';
import { useContentCollapsed } from '@ui/screens/main/_components/content-collapsed-context';

// Stable empty arrays/sets to avoid infinite loop with useSyncExternalStore
const EMPTY_HISTORY: AgentMessage[] = [];
const EMPTY_QUEUE: (AgentMessage & { role: 'user' })[] = [];
const EMPTY_MOUNTS_SNAPSHOT: Mount[] = [];
const EMPTY_SET = new Set<string>();

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
  const _openSettings = useKartonProcedure((p) => p.appScreen.openSettings);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const goToUrl = useKartonProcedure((p) => p.browser.goto);
  const tabs = useKartonState((s) => s.contentTabs.tabs);

  // Expand the content panel if it's collapsed so plan tabs are visible
  const { collapsed: contentCollapsed, setCollapsed: setContentCollapsed } =
    useContentCollapsed();

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
          const mounts = getWorkspaceMountsFromMessage(msg);
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

  // --- Optimistic accept/reject ---
  const [optimisticHunkIds, setOptimisticHunkIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Filter out diffs whose hunks have all been optimistically acted upon
  const effectivePendingDiffs = useMemo(() => {
    if (optimisticHunkIds.size === 0) return formattedPendingDiffs;
    return formattedPendingDiffs.filter(
      (diff) => !getHunkIds(diff).every((id) => optimisticHunkIds.has(id)),
    );
  }, [formattedPendingDiffs, optimisticHunkIds]);

  // Reconcile: once the server state no longer contains any of our
  // optimistic IDs, clear them so we stop filtering.
  useLayoutEffect(() => {
    if (optimisticHunkIds.size === 0) return;
    const serverHunkIds = new Set(
      formattedPendingDiffs.flatMap((d) => getHunkIds(d)),
    );
    const allConfirmed = Array.from(optimisticHunkIds).every(
      (id) => !serverHunkIds.has(id),
    );
    if (allConfirmed) setOptimisticHunkIds(new Set());
  }, [formattedPendingDiffs, optimisticHunkIds]);

  // Clear optimistic state on agent switch
  useEffect(() => {
    setOptimisticHunkIds(new Set());
  }, [openAgentId]);

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
      if (contentCollapsed) setContentCollapsed(false);

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
    [
      createTab,
      switchTab,
      goToUrl,
      tabs,
      contentCollapsed,
      setContentCollapsed,
    ],
  );

  const handleImplement = useSendImplement();

  // Create status card items
  const items = useMemo(() => {
    const result: StatusCardSection[] = [];

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
      pendingDiffs: effectivePendingDiffs,
      diffSummary: formattedDiffSummary,
      resolvedMounts,
      activeMounts: workspaceMounts,
      activeMountPaths,
      onRejectAll: (hunkIds: string[]) => {
        setOptimisticHunkIds((prev) => {
          const next = new Set(prev);
          for (const id of hunkIds) next.add(id);
          return next;
        });
        rejectAllPendingEdits(hunkIds).catch(() => {
          setOptimisticHunkIds((prev) => {
            const next = new Set(prev);
            for (const id of hunkIds) next.delete(id);
            return next;
          });
        });
      },
      onAcceptAll: (hunkIds: string[]) => {
        setOptimisticHunkIds((prev) => {
          const next = new Set(prev);
          for (const id of hunkIds) next.add(id);
          return next;
        });
        acceptAllPendingEdits(hunkIds).catch(() => {
          setOptimisticHunkIds((prev) => {
            const next = new Set(prev);
            for (const id of hunkIds) next.delete(id);
            return next;
          });
        });
      },
      onOpenDiffReview: openDiffReviewPage,
    });
    if (fileDiffSection) result.push(fileDiffSection);

    return result;
  }, [
    ownedPlans,
    ownedLogChannels,
    openAgentId,
    clearLogChannel,
    handleOpenPlan,
    handleImplement,
    messageQueue,
    deleteQueuedMessage,
    flushQueue,
    effectivePendingDiffs,
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
    const { observer: resizeObserver, disconnect: disconnectResizeObserver } =
      createRafResizeObserver(() => {
        const height = hasContent ? card.offsetHeight : 0;
        if (previousHeightRef.current === height) return;

        document.documentElement.style.setProperty(
          '--status-card-height',
          `${height}px`,
        );

        previousHeightRef.current = height;
      });
    resizeObserver.observe(card);

    return () => {
      disconnectResizeObserver();
      document.documentElement.style.setProperty('--status-card-height', '0px');
    };
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <MountedPathsProvider value={resolvedMounts}>
      <AttachmentMetadataProvider messages={agentHistoryRef.current}>
        <StatusCardComponent
          items={items}
          ref={cardRef as React.RefObject<HTMLDivElement>}
        />
      </AttachmentMetadataProvider>
    </MountedPathsProvider>
  );
}
