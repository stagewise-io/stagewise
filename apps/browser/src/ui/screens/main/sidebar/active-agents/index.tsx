import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import { EMPTY_MOUNTS } from '@shared/karton-contracts/ui';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  OverlayScrollbar,
  type OverlayScrollbarRef,
} from '@stagewise/stage-ui/components/overlay-scrollbar';
import { IconPlusFill18 } from 'nucleo-ui-fill-18';
import { extractTipTapText, firstWords } from '@ui/utils/text-utils';
import { useEmptyAgentId } from '@ui/hooks/use-empty-agent';
import { AgentCardSkeleton } from './_components/agent-card';
import { AgentCardWithPreview } from './_components/agent-card-with-preview';
import type { CachedPreview } from '@ui/screens/main/sidebar/top/_components/agent-preview-panel';
import { getToolActivityLabel } from './_utils/tool-label';

type ActiveAgentCardData = {
  id: string;
  title: string;
  isWorking: boolean;
  isWaitingForUser: boolean;
  activityText: string;
  activityIsUserInput: boolean;
  hasError: boolean;
  lastMessageAt: number;
  messageCount: number;
  unread: boolean;
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

export function ActiveAgentsGrid() {
  const showActiveAgents = useKartonState(
    (s) => s.preferences.sidebar?.showActiveAgents ?? true,
  );
  const [openAgent, setOpenAgent, removeFromHistory] = useOpenAgent();
  const createAgent = useKartonProcedure((p) => p.agents.create);
  const resumeAgent = useKartonProcedure((p) => p.agents.resume);
  const archiveAgent = useKartonProcedure((p) => p.agents.archive);
  const deleteAgent = useKartonProcedure((p) => p.agents.delete);
  const setAgentTitle = useKartonProcedure((p) => p.agents.setTitle);

  const [, emptyAgentIdRef] = useEmptyAgentId();

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
  const currentMounts = useKartonState((s) =>
    openAgent
      ? (s.toolbox[openAgent]?.workspace?.mounts ?? EMPTY_MOUNTS)
      : EMPTY_MOUNTS,
  );
  const openAgentModelIdRef = useRef(openAgentModelId);
  openAgentModelIdRef.current = openAgentModelId;
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
              isWaitingForUser: hasPendingQuestion,
              activityText: activity.text,
              activityIsUserInput: activity.isUserInput,
              hasError:
                !!agent.state.error &&
                agent.state.error.kind !== 'plan-limit-exceeded',
              unread: !!agent.state.unread,
              lastMessageAt: lastMsg?.metadata?.createdAt
                ? new Date(lastMsg.metadata.createdAt).getTime()
                : 0,
              messageCount: history.length,
            };
          }),
      activeAgentCardsEqual,
    ),
  );

  // Hide skeleton as soon as agents list grows (same render cycle), rather
  // than waiting for the promise callback which lags 1-2 frames behind.
  const showCreateSkeleton =
    pendingCreate && agents.length <= agentCountAtCreateRef.current;

  // Optimistic removal: cards are hidden immediately while the backend processes.
  // Used for both "Delete" (permanent) and "Suspend" (archived).
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(
    () => new Set(),
  );
  const pendingRemovalsRef = useRef(pendingRemovals);
  pendingRemovalsRef.current = pendingRemovals;

  const handleCreateAgent = useCallback(() => {
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
    const paths = currentMountPathsRef.current;
    void createAgent(
      undefined,
      currentModelId,
      paths.length > 0 ? paths : undefined,
    ).then((id) => {
      setOpenAgent(id);
      setPendingCreate(false);
    });
  }, [agents.length, createAgent, emptyAgentIdRef, setOpenAgent]);

  // Stable ordering: agents keep their position in the list. New agents
  // (created or resumed) are appended at the end. Removed agents are pruned.
  // Uses a ref so the order persists across renders without causing re-renders.
  const orderRef = useRef<string[]>([]);
  const orderedAgents = useMemo(() => {
    const currentIds = new Set(agents.map((a) => a.id));

    // Prune removed agents
    const kept = orderRef.current.filter((id) => currentIds.has(id));
    const keptSet = new Set(kept);
    // Append new agents at the end
    for (const agent of agents) {
      if (!keptSet.has(agent.id)) kept.push(agent.id);
    }
    orderRef.current = kept;

    const byId = new Map(agents.map((a) => [a.id, a]));
    // Exclude agents that are being optimistically removed
    return kept
      .filter((id) => !pendingRemovals.has(id))
      .map((id) => byId.get(id)!);
  }, [agents, pendingRemovals]);

  // Clean up pending removals once the backend has confirmed removal.
  // The memo already filters them from the rendered list, so this is
  // purely housekeeping — no visual artifact from the effect timing.
  useEffect(() => {
    if (pendingRemovals.size === 0) return;
    const currentIds = new Set(agents.map((a) => a.id));
    const pendingArr = Array.from(pendingRemovals);
    if (pendingArr.some((id) => !currentIds.has(id))) {
      setPendingRemovals(
        new Set(pendingArr.filter((id) => currentIds.has(id))),
      );
    }
  }, [agents, pendingRemovals]);

  // When the open agent is optimistically removed, pop it from the history
  // stack so we fall back to the previously viewed agent.
  useEffect(() => {
    if (openAgent && pendingRemovals.has(openAgent)) {
      removeFromHistory(openAgent);
    }
  }, [openAgent, pendingRemovals, removeFromHistory]);

  const handleClick = useCallback(
    (id: string) => {
      // Optimistic: update the open agent immediately, don't wait for the RPC.
      // markAsRead is handled by SidebarTopSection's useEffect on openAgent.
      setOpenAgent(id);
      void resumeAgent(id);
    },
    [resumeAgent, setOpenAgent],
  );

  const handleArchive = useCallback(
    (id: string) => {
      setPendingRemovals((prev) => new Set(prev).add(id));
      void archiveAgent(id);
    },
    [archiveAgent],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setPendingRemovals((prev) => new Set(prev).add(id));
      void deleteAgent(id);
    },
    [deleteAgent],
  );

  const handleRename = useCallback(
    (id: string, newTitle: string) => {
      void setAgentTitle(id, newTitle);
    },
    [setAgentTitle],
  );

  const scrollRef = useRef<OverlayScrollbarRef>(null);

  /** Scroll a card into the safe (non-masked) area of the scroll container.
   * The container has CSS mask gradients (8px top/bottom) that fade content
   * to hint at overflow. We only scroll when the card overlaps those fade
   * zones — if it's already fully visible, we leave the position alone. */
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

  // Only show when enabled and 2+ visible CHAT agents (or 1 agent + pending create)
  const visibleCount = orderedAgents.length + (showCreateSkeleton ? 1 : 0);
  if (!showActiveAgents || visibleCount < 2) return null;

  return (
    <div className="flex shrink-0 flex-col overflow-x-visible border-border-subtle border-b px-1 pt-2 group-data-[collapsed=true]:hidden">
      <div className="flex items-center justify-between">
        <span className="px-0.5 font-medium text-muted-foreground text-sm">
          Active agents
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="-mr-1.5 shrink-0"
          onClick={handleCreateAgent}
        >
          <span>New agent</span>
          <IconPlusFill18 className="size-3" />
        </Button>
      </div>
      <OverlayScrollbar
        ref={scrollRef}
        className="max-h-[15vh] min-h-5"
        contentClassName="grid auto-rows-max @[400px]:grid-cols-2 grid-cols-1 gap-2 pt-2 pb-3.5"
        options={{ overflow: { x: 'visible' } }}
      >
        {orderedAgents.map((agent) => {
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
              onClick={handleClick}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onRename={handleRename}
              cache={previewCacheRef.current}
            />
          );
        })}
        {showCreateSkeleton && <AgentCardSkeleton />}
      </OverlayScrollbar>
    </div>
  );
}
