import { useAppState } from "@/hooks/use-app-state";
import { useEventListener } from "@/hooks/use-event-listener";
import { useCallback, useMemo } from "preact/hooks";
import { hotkeyActionDefinitions, HotkeyActions } from "../utils";
import { useChatState } from "@/hooks/use-chat-state";

// This listener is responsible for listening to hotkeys and triggering the appropriate actions in the global app state.
export function HotkeyListener() {
  const { setInputFocus } = useChatState();

  const hotKeyHandlerMap: Record<HotkeyActions, () => void> = useMemo(
    () => ({
      [HotkeyActions.CTRL_K]: () => {
        console.log("CTRL + K got triggered!");
        setInputFocus(true);
      },
    }),
    [setInputFocus]
  );

  const hotKeyListener = useCallback(
    (ev: KeyboardEvent) => {
      // The first matching hotkey action will be executed and abort further processing of other hotkey actions.
      for (const [action, definition] of Object.entries(
        hotkeyActionDefinitions
      )) {
        if (definition.isEventMatching(ev)) {
          ev.preventDefault();
          ev.stopPropagation();
          hotKeyHandlerMap[action as unknown as HotkeyActions]();
          break;
        }
      }
    },
    [hotKeyHandlerMap]
  );

  useEventListener("keydown", hotKeyListener, {
    capture: true,
  });
  return null;
}
