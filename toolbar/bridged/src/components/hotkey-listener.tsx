import { useEventListener } from '@/hooks/use-event-listener';
import { useCallback, useMemo } from 'react';
import { hotkeyActionDefinitions, HotkeyActions } from '../utils.js';
import { useChatState } from '@/hooks/use-chat-state';
import { usePanels } from '@/hooks/use-panels';

type StopPreventPropagation = boolean;

// This listener is responsible for listening to hotkeys and triggering the appropriate actions in the global app state.
export function HotkeyListener() {
  const {
    startPromptCreation,
    stopPromptCreation,
    isPromptCreationActive,
    startContextSelector,
    stopContextSelector,
    isContextSelectorActive,
  } = useChatState();
  const { isChatOpen, closeChat, openChat } = usePanels();

  const hotKeyHandlerMap: Record<HotkeyActions, () => StopPreventPropagation> =
    useMemo(
      () => ({
        // Functions that return true will prevent further propagation of the event.
        [HotkeyActions.CTRL_ALT_C]: () => {
          if (!isPromptCreationActive) {
            startPromptCreation();
            return true;
          }
          return false;
        },
        [HotkeyActions.CTRL_ALT_PERIOD]: () => {
          if (isPromptCreationActive) {
            // Toggle context selector when prompt creation is active
            if (isContextSelectorActive) {
              stopContextSelector();
            } else {
              startContextSelector();
            }
            return true;
          } else if (!isChatOpen) {
            // If chat is closed, open it and start both modes
            openChat();
            startPromptCreation();
            startContextSelector();
            return true;
          }
          return false;
        },
        [HotkeyActions.ESC]: () => {
          if (isContextSelectorActive) {
            // If context selector is active, stop it first
            stopContextSelector();
            return true;
          } else if (isPromptCreationActive) {
            // If prompting mode is active, stop it
            stopPromptCreation();
            return true;
          } else if (isChatOpen) {
            // If prompting is not active but chat is open, close the chat
            closeChat();
            return true;
          }
          return false;
        },
      }),
      [
        startPromptCreation,
        stopPromptCreation,
        isPromptCreationActive,
        startContextSelector,
        stopContextSelector,
        isContextSelectorActive,
        isChatOpen,
        closeChat,
        openChat,
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
  return null;
}
