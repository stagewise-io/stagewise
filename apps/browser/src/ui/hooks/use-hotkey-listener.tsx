import { useCallback, useMemo } from 'react';
import { useEventListener } from './use-event-listener';
import {
  hotkeyActionDefinitions,
  getCurrentPlatform,
  type HotkeyActions,
} from '@shared/hotkeys';
import { usePostHog } from 'posthog-js/react';

export function useHotKeyListener(
  action: () => void,
  hotKeyAction: HotkeyActions,
) {
  const posthog = usePostHog();
  const platform = useMemo(() => getCurrentPlatform(), []);
  const hotKeyListener = useCallback(
    (ev: KeyboardEvent) => {
      // The first matching hotkey action will be executed and abort further processing of other hotkey actions.
      if (hotkeyActionDefinitions[hotKeyAction].isEventMatching(ev, platform)) {
        posthog.capture('agent_select_elements_hotkey_pressed', {
          hotkey_action: hotKeyAction,
        });

        action();
        ev.stopPropagation();
      }
    },
    [action, platform],
  );

  useEventListener('keydown', hotKeyListener);
}
