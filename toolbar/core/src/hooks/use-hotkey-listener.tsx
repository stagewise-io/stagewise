import type { HotkeyActions } from '@/utils';
import { useCallback } from 'react';
import { useEventListener } from './use-event-listener';
import { hotkeyActionDefinitions } from '@/utils';
import { usePostHog } from 'posthog-js/react';

export function useHotKeyListener(
  action: () => boolean | undefined,
  hotKeyAction: HotkeyActions,
) {
  const posthog = usePostHog();
  const hotKeyListener = useCallback(
    (ev: KeyboardEvent) => {
      // The first matching hotkey action will be executed and abort further processing of other hotkey actions.
      if (hotkeyActionDefinitions[hotKeyAction].isEventMatching(ev)) {
        posthog.capture('toolbar-hotkey-pressed', {
          hotkey_action: hotKeyAction,
        });
        const matched = action();
        if (typeof matched !== 'boolean' || matched) {
          ev.preventDefault();
          ev.stopPropagation();
        }
      }
    },
    [action],
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
}
