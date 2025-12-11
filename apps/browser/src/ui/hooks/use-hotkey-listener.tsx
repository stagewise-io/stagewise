import { useCallback } from 'react';
import { useEventListener } from './use-event-listener';
import { hotkeyActionDefinitions, type HotkeyActions } from '@shared/hotkeys';
import { usePostHog } from 'posthog-js/react';

export function useHotKeyListener(
  action: () => void,
  hotKeyAction: HotkeyActions,
) {
  const posthog = usePostHog();
  const hotKeyListener = useCallback(
    (ev: KeyboardEvent) => {
      // The first matching hotkey action will be executed and abort further processing of other hotkey actions.
      if (hotkeyActionDefinitions[hotKeyAction].isEventMatching(ev)) {
        posthog.capture('agent_select_elements_hotkey_pressed', {
          hotkey_action: hotKeyAction,
        });

        action();
        ev.stopPropagation();
      }
    },
    [action],
  );

  useEventListener('keydown', hotKeyListener);
}
