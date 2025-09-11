import { useEventListener } from '@/hooks/use-event-listener';
import { useCallback, useMemo } from 'react';
import { hotkeyActionDefinitions, HotkeyActions } from '../utils';
import { useChatState } from '@/hooks/use-chat-state';
import { usePanels } from '@/hooks/use-panels';

type StopPreventPropagation = boolean;

// This listener is responsible for listening to hotkeys and triggering the appropriate actions in the global app state.
export function HotkeyListener() {
  const { isContextSelectorActive, stopContextSelector, startContextSelector } =
    useChatState();
  const { leftPanelContent, closeLeftPanel, openLeftPanel } = usePanels();

  const hotKeyHandlerMap: Record<HotkeyActions, () => StopPreventPropagation> =
    useMemo(
      () => ({
        // Functions that return true will prevent further propagation of the event.
        [HotkeyActions.CTRL_ALT_PERIOD]: () => {
          if (leftPanelContent !== 'chat') {
            openLeftPanel('chat');
            return true;
          } else if (!isContextSelectorActive) {
            startContextSelector();
            return true;
          }
          return false;
        },
        [HotkeyActions.ESC]: () => {
          if (isContextSelectorActive) {
            stopContextSelector();
            return true;
          } else if (leftPanelContent === 'chat') {
            // If prompting is not active but chat is open, close the chat
            closeLeftPanel();
            return true;
          }
          return false;
        },
      }),
      [
        isContextSelectorActive,
        stopContextSelector,
        startContextSelector,
        leftPanelContent,
        closeLeftPanel,
      ],
    );

  const hotKeyListener = useCallback(
    (ev: KeyboardEvent) => {
      // The first matching hotkey action will be executed and abort further processing of other hotkey actions.
      for (const [action, definition] of Object.entries(
        hotkeyActionDefinitions,
      )) {
        if (definition.isEventMatching(ev)) {
          const matched =
            hotKeyHandlerMap[action as unknown as HotkeyActions]();
          if (matched) {
            ev.preventDefault();
            ev.stopPropagation();
          }
          break;
        }
      }
    },
    [hotKeyHandlerMap],
  );

  useEventListener('keydown', hotKeyListener, {
    capture: true,
  });

  // Also listen to iframe events to capture hotkeys when iframe has focus
  const iframe = document.getElementById(
    'user-app-iframe',
  ) as HTMLIFrameElement;
  useEventListener(
    'keydown',
    hotKeyListener,
    {
      capture: true,
    },
    iframe?.contentWindow,
  );

  return null;
}
