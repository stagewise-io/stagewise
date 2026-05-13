import {
  getCurrentPlatform,
  hotkeyDefinitions,
  HotkeyActions,
  isEventMatch,
} from '@shared/hotkeys';
import { AgentTypes } from '@shared/karton-contracts/ui/agent';
import type { AgentHistoryEntry } from '@shared/karton-contracts/ui/agent';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import {
  useComparingSelector,
  useKartonProcedure,
  useKartonState,
} from '@ui/hooks/use-karton';
import { useAgentSwitcher } from '@ui/hooks/use-open-chat';
import { usePendingRemovals } from '@ui/hooks/use-pending-agent-removals';
import { extractTipTapText, firstWords } from '@ui/utils/text-utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  activeAgentCardsEqual,
  getOrderedAgentIds,
  mergeAgentEntries,
  type ActiveAgentCardData,
} from '../sidebar/agents-list/agent-list-model';
import { getToolActivityLabel } from '../sidebar/agents-list/_utils/tool-label';

const HOTKEY_HISTORY_FETCH_LIMIT = 100;

function getVisibleAgentIds() {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-agent-id]'),
    (element) => element.dataset.agentId,
  ).filter((id): id is string => !!id);
}

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

  if (inputState) {
    const draftText = extractTipTapText(inputState).trim();
    if (draftText) {
      const snippet = firstWords(draftText, 10, false);
      if (snippet) return { text: snippet, isUserInput: true };
    }
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

function useOrderedAgentIds() {
  const [historyList, setHistoryList] = useState<AgentHistoryEntry[]>([]);
  const getAgentsHistoryList = useKartonProcedure(
    (p) => p.agents.getAgentsHistoryList,
  );
  const getAgentsHistoryListRef = useRef(getAgentsHistoryList);
  const fetchedHistoryKeyRef = useRef<string | null>(null);
  const activeAgentIds = useKartonState(
    useComparingSelector((s) => Object.keys(s.agents.instances)),
  );
  const activeAgentIdsKey = useMemo(
    () => activeAgentIds.join(','),
    [activeAgentIds],
  );

  useEffect(() => {
    getAgentsHistoryListRef.current = getAgentsHistoryList;
  }, [getAgentsHistoryList]);

  useEffect(() => {
    if (activeAgentIds.length === 0) {
      fetchedHistoryKeyRef.current = null;
      setHistoryList([]);
      return;
    }

    if (fetchedHistoryKeyRef.current === activeAgentIdsKey) return;

    fetchedHistoryKeyRef.current = activeAgentIdsKey;
    let cancelled = false;
    getAgentsHistoryListRef
      .current(0, HOTKEY_HISTORY_FETCH_LIMIT)
      .then((entries) => {
        if (!cancelled) setHistoryList(entries);
      })
      .catch((err) => {
        if (!cancelled) fetchedHistoryKeyRef.current = null;
        console.error('Failed to fetch agent history for hotkeys:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgentIds.length, activeAgentIdsKey]);

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
              createdAt: agent.state.history[0]?.metadata?.createdAt
                ? new Date(agent.state.history[0].metadata.createdAt).getTime()
                : 0,
              messageCount: history.length,
            };
          }),
      activeAgentCardsEqual,
    ),
  );

  const { pending } = usePendingRemovals();

  return useMemo(
    () =>
      getOrderedAgentIds(
        mergeAgentEntries({
          activeAgents: agents,
          historyList,
          pendingRemovals: pending,
        }),
      ),
    [agents, historyList, pending],
  );
}

export function AgentHotkeyBindings() {
  const orderedAgentIds = useOrderedAgentIds();
  const orderedAgentIdsRef = useRef(orderedAgentIds);
  orderedAgentIdsRef.current = orderedAgentIds;

  const resumeAgent = useKartonProcedure((p) => p.agents.resume);
  const resumeAgentRef = useRef(resumeAgent);
  resumeAgentRef.current = resumeAgent;

  const platform = useMemo(() => getCurrentPlatform(), []);
  const {
    stepAgentCycle,
    commitAgentCycle,
    cancelAgentCycle,
    focusAgentFromHotkey,
    isCyclingAgents,
  } = useAgentSwitcher();
  const isCyclingAgentsRef = useRef(isCyclingAgents);
  isCyclingAgentsRef.current = isCyclingAgents;
  const hasActiveCycleRef = useRef(false);

  const handleAgentCycle = useCallback(
    (direction: 'next' | 'previous') => {
      const previewId = stepAgentCycle(getVisibleAgentIds(), direction);
      if (previewId) hasActiveCycleRef.current = true;
    },
    [stepAgentCycle],
  );

  useEffect(() => {
    const nextAgentDefinition = hotkeyDefinitions[HotkeyActions.NEXT_AGENT];
    const prevAgentDefinition = hotkeyDefinitions[HotkeyActions.PREV_AGENT];

    const handleCycleKeyDown = (event: KeyboardEvent) => {
      const direction = isEventMatch(event, prevAgentDefinition, platform)
        ? 'previous'
        : isEventMatch(event, nextAgentDefinition, platform)
          ? 'next'
          : null;

      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();

      // A held Tab key should not race through the stack. Only deliberate
      // repeated key presses while Ctrl remains held should step the cycle.
      if (event.repeat) return;
      handleAgentCycle(direction);
    };

    window.addEventListener('keydown', handleCycleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleCycleKeyDown, true);
    };
  }, [handleAgentCycle, platform]);

  const commitCycle = useCallback(() => {
    hasActiveCycleRef.current = false;
    const { id, committed } = commitAgentCycle();
    if (id && committed) void resumeAgentRef.current(id);
  }, [commitAgentCycle]);

  const cancelCycle = useCallback(() => {
    hasActiveCycleRef.current = false;
    cancelAgentCycle();
  }, [cancelAgentCycle]);

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Control') return;
      if (!hasActiveCycleRef.current && !isCyclingAgentsRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      commitCycle();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!hasActiveCycleRef.current && !isCyclingAgentsRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      cancelCycle();
    };

    const handleBlur = () => {
      if (hasActiveCycleRef.current || isCyclingAgentsRef.current)
        commitCycle();
    };

    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [cancelCycle, commitCycle]);

  const focusAgentByIndex = useCallback(
    (index: number) => {
      const visibleAgentIds = getVisibleAgentIds();
      const id = index === 8 ? visibleAgentIds.at(-1) : visibleAgentIds[index];
      if (!id) return;
      focusAgentFromHotkey(id);
      void resumeAgentRef.current(id);
    },
    [focusAgentFromHotkey],
  );

  useHotKeyListener(() => focusAgentByIndex(0), HotkeyActions.FOCUS_AGENT_1);
  useHotKeyListener(() => focusAgentByIndex(1), HotkeyActions.FOCUS_AGENT_2);
  useHotKeyListener(() => focusAgentByIndex(2), HotkeyActions.FOCUS_AGENT_3);
  useHotKeyListener(() => focusAgentByIndex(3), HotkeyActions.FOCUS_AGENT_4);
  useHotKeyListener(() => focusAgentByIndex(4), HotkeyActions.FOCUS_AGENT_5);
  useHotKeyListener(() => focusAgentByIndex(5), HotkeyActions.FOCUS_AGENT_6);
  useHotKeyListener(() => focusAgentByIndex(6), HotkeyActions.FOCUS_AGENT_7);
  useHotKeyListener(() => focusAgentByIndex(7), HotkeyActions.FOCUS_AGENT_8);
  useHotKeyListener(() => focusAgentByIndex(8), HotkeyActions.FOCUS_AGENT_LAST);

  return null;
}
