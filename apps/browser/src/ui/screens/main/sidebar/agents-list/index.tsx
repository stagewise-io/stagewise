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
import { IconPenPlusOutline18 } from 'nucleo-ui-outline-18';
import { extractTipTapText, firstWords } from '@ui/utils/text-utils';
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
import { AgentsSelector } from './_components/agents-selector';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';

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

export function AgentsList() {
  const showActiveAgents = useKartonState(
    (s) => s.preferences.sidebar?.showActiveAgents ?? true,
  );
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const [openAgent, setOpenAgent] = useOpenAgent();
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
              messageCount: history.length,
            };
          }),
      activeAgentCardsEqual,
    ),
  );

  // Optimistic removal: cards are hidden immediately while the backend processes.
  // Used for both "Delete" (permanent) and "Suspend" (archived).
  // Shared via context so SidebarTopSection's auto-select effect doesn't
  // ping-pong openAgent back onto a being-removed id.
  const {
    pending: pendingRemovals,
    add: addPendingRemoval,
    remove: removePendingRemoval,
  } = usePendingRemovals();
  const pendingRemovalsRef = useRef(pendingRemovals);
  pendingRemovalsRef.current = pendingRemovals;

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
    pendingRemovals.forEach((id) => {
      if (!currentIds.has(id)) removePendingRemoval(id);
    });
  }, [agents, pendingRemovals, removePendingRemoval]);

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
    const paths = currentMountPathsRef.current;
    void createAgent(
      undefined,
      currentModelId,
      paths.length > 0 ? paths : undefined,
    ).then((id) => {
      setOpenAgent(id);
      setPendingCreate(false);
    });
  }, [agents.length, createAgent, emptyAgentIdRef, setOpenAgent, track]);

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
      addPendingRemoval(id);
      void archiveAgent(id);
    },
    [addPendingRemoval, archiveAgent],
  );

  const handleDelete = useCallback(
    (id: string) => {
      addPendingRemoval(id);
      void deleteAgent(id);
    },
    [addPendingRemoval, deleteAgent],
  );

  const handleRename = useCallback(
    (id: string, newTitle: string) => {
      void setAgentTitle(id, newTitle);
    },
    [setAgentTitle],
  );

  const scrollRef = useRef<OverlayScrollbarRef>(null);
  // Use state (not just a ref) so that when OverlayScrollbar initialises and
  // calls onViewportRef, a re-render is triggered.  useIsContainerScrollable
  // (used by useScrollFadeMask internally) only syncs a ref → element inside
  // a no-dep useEffect that runs after every render — it never fires if the
  // ref is updated without a render.
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const scrollViewportRef = useRef<HTMLElement | null>(null);
  scrollViewportRef.current = scrollViewport;
  const { maskStyle } = useScrollFadeMask(scrollViewportRef, {
    axis: 'vertical',
    fadeDistance: 16,
  });

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

  // Shared context-menu state for all cards — avoids per-card menu roots.
  const [ctxMenuState, ctxMenuTarget, setCtxMenuTarget] =
    useSharedAgentContextMenu();
  const handleCtxMenuClose = useCallback(
    () => setCtxMenuTarget(null),
    [setCtxMenuTarget],
  );

  // Delete confirmation triggered from the context menu. Hoisted out of
  // AgentCard so the popover can survive the card losing hover / the menu
  // closing without tearing down the confirmation UI.
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

  if (!showActiveAgents) return null;

  return (
    <div className="flex h-full flex-col group-data-[collapsed=true]:hidden">
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
        <div className="mt-2 flex items-center justify-between gap-1">
          <span className="flex-1 pl-1.5 font-medium text-muted-foreground/60 text-xs">
            Agents
          </span>
          <AgentsSelector />
        </div>
      </div>
      <OverlayScrollbar
        ref={scrollRef}
        className="-mr-1 min-h-5"
        contentClassName="flex flex-col gap-px pl-0.5 pt-0.5 pb-3.5 pr-1.5"
        options={{
          overflow: { x: 'visible' },
          scrollbars: { theme: 'os-theme-stagewise-subtle' },
        }}
        style={maskStyle}
        onViewportRef={setScrollViewport}
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
              contextMenuState={ctxMenuState}
              onClick={handleClick}
              onArchive={handleArchive}
              onRename={handleRename}
              cache={previewCacheRef.current}
            />
          );
        })}
        {showCreateSkeleton && <AgentCardSkeleton />}
      </OverlayScrollbar>
      <SharedAgentContextMenuHost
        target={ctxMenuTarget}
        onClose={handleCtxMenuClose}
        onArchive={handleArchive}
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
