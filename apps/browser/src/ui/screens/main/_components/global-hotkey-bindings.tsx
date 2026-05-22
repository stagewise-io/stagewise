import {
  getCurrentPlatform,
  hotkeyDefinitions,
  HotkeyActions,
  isEventMatch,
} from '@shared/hotkeys';
import { SETTINGS_PAGE_URL } from '@shared/internal-urls';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useAgentSwitcher } from '@ui/hooks/use-open-chat';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSidebarCollapsed } from './sidebar-collapsed-context';
import { useCommandCenter } from '../command-center';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getVisibleAgentIds() {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-agent-id]'),
    (element) => element.dataset.agentId,
  ).filter((id): id is string => !!id);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Global hotkeys — always mounted. Covers UI chrome toggles, agent
 * switching, and window-level actions. No dependency on browser tabs.
 */
export function GlobalHotkeyBindings() {
  const { isOpen: isCommandCenterOpen } = useCommandCenter();
  const globalHotkeysEnabled = !isCommandCenterOpen;

  // -- Agent switching --------------------------------------------------
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

  const switchAgentImmediate = useCallback(
    (direction: 'next' | 'previous') => {
      const nextId = stepAgentCycle(getVisibleAgentIds(), direction);
      if (!nextId) return;
      const { id, committed } = commitAgentCycle();
      if (id && committed) void resumeAgentRef.current(id);
    },
    [stepAgentCycle, commitAgentCycle],
  );

  // Ctrl+Tab / Ctrl+Shift+Tab — agent cycling with preview.
  // Mod+PageDown/Up — immediate agent switch (no cycling UI).
  // Handled via window-level capture listener (not useHotKeyListener)
  // because we need to track the held Control key for commit-on-release
  // of the Ctrl+Tab cycling mode.
  useEffect(() => {
    if (!globalHotkeysEnabled) return;

    const nextDef = hotkeyDefinitions[HotkeyActions.NEXT_AGENT];
    const prevDef = hotkeyDefinitions[HotkeyActions.PREV_AGENT];
    const handleCycleKeyDown = (event: KeyboardEvent) => {
      const isPrev = isEventMatch(event, prevDef, platform);
      const isNext = isEventMatch(event, nextDef, platform);
      if (!isPrev && !isNext) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;

      const direction = isPrev ? 'previous' : 'next';
      const isPageKey = event.code === 'PageDown' || event.code === 'PageUp';

      if (isPageKey) {
        // Mod+PageDown/Up: immediate switch, no cycling UI.
        switchAgentImmediate(direction);
      } else {
        // Ctrl+Tab: enter cycling mode with preview overlay.
        handleAgentCycle(direction);
      }
    };
    window.addEventListener('keydown', handleCycleKeyDown, true);
    return () =>
      window.removeEventListener('keydown', handleCycleKeyDown, true);
  }, [globalHotkeysEnabled, handleAgentCycle, platform, switchAgentImmediate]);

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
    if (!globalHotkeysEnabled) {
      if (hasActiveCycleRef.current || isCyclingAgentsRef.current) {
        cancelCycle();
      }
      return;
    }

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
  }, [cancelCycle, commitCycle, globalHotkeysEnabled]);

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

  useHotKeyListener(
    () => focusAgentByIndex(0),
    HotkeyActions.FOCUS_AGENT_1,
    globalHotkeysEnabled,
  );
  useHotKeyListener(
    () => focusAgentByIndex(1),
    HotkeyActions.FOCUS_AGENT_2,
    globalHotkeysEnabled,
  );
  useHotKeyListener(
    () => focusAgentByIndex(2),
    HotkeyActions.FOCUS_AGENT_3,
    globalHotkeysEnabled,
  );
  useHotKeyListener(
    () => focusAgentByIndex(3),
    HotkeyActions.FOCUS_AGENT_4,
    globalHotkeysEnabled,
  );
  useHotKeyListener(
    () => focusAgentByIndex(4),
    HotkeyActions.FOCUS_AGENT_5,
    globalHotkeysEnabled,
  );
  useHotKeyListener(
    () => focusAgentByIndex(5),
    HotkeyActions.FOCUS_AGENT_6,
    globalHotkeysEnabled,
  );
  useHotKeyListener(
    () => focusAgentByIndex(6),
    HotkeyActions.FOCUS_AGENT_7,
    globalHotkeysEnabled,
  );
  useHotKeyListener(
    () => focusAgentByIndex(7),
    HotkeyActions.FOCUS_AGENT_8,
    globalHotkeysEnabled,
  );
  useHotKeyListener(
    () => focusAgentByIndex(8),
    HotkeyActions.FOCUS_AGENT_LAST,
    globalHotkeysEnabled,
  );

  // -- Settings (Mod+,) --------------------------------------------------
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  useHotKeyListener(
    () => createTab(SETTINGS_PAGE_URL, true),
    HotkeyActions.OPEN_SETTINGS,
    globalHotkeysEnabled,
  );

  // -- Sidebar toggle (Mod+B) -------------------------------------------
  const { toggle: toggleSidebar } = useSidebarCollapsed();
  useHotKeyListener(
    () => toggleSidebar(),
    HotkeyActions.TOGGLE_SIDEBAR,
    globalHotkeysEnabled,
  );

  // -- Close window (Mod+Shift+W) ---------------------------------------
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const { removeTabUiState } = useTabUIState();

  useHotKeyListener(
    () => {
      if (!activeTabId) return;
      const ids = Object.keys(tabs).filter((id) => id !== activeTabId);
      void Promise.allSettled(ids.map((id) => closeTab(id))).then((results) => {
        for (let i = 0; i < results.length; i++) {
          if (results[i]!.status === 'fulfilled') removeTabUiState(ids[i]!);
        }
      });
    },
    HotkeyActions.CLOSE_WINDOW,
    globalHotkeysEnabled,
  );

  // TODO: lift NEW_CHAT handler from sidebar/agents-list here.

  return null;
}
