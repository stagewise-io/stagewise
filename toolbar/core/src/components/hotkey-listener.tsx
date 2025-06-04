import { useEventListener } from '@/hooks/use-event-listener';
import { useCallback, useMemo } from 'preact/hooks';
import { hotkeyActionDefinitions, HotkeyActions } from '../utils';
import { useChatState } from '@/hooks/use-chat-state';

type StopPreventPropagation = boolean;

// This listener is responsible for listening to hotkeys and triggering the appropriate actions in the global app state.
export function HotkeyListener() {
  const { startPromptCreation, stopPromptCreation, isPromptCreationActive } =
    useChatState();

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
        [HotkeyActions.ESC]: () => {
          if (isPromptCreationActive) {
            stopPromptCreation();
            return true;
          }
          return false;
        },
      }),
      [startPromptCreation, stopPromptCreation, isPromptCreationActive],
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
