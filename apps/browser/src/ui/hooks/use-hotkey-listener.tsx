import { useCallback, useMemo } from 'react';
import { useEventListener } from './use-event-listener';
import {
  hotkeyDefinitions,
  getCurrentPlatform,
  isEventMatch,
  HotkeyActions,
} from '@shared/hotkeys';
import { shouldNativeInputConsumeEvent } from '@shared/native-input-events';

const commandCenterModalActiveAttribute = 'data-command-center-modal-active';
const commandCenterModalRootSelector = '[data-command-center-modal-root]';

function isEventFromCommandCenter(event: KeyboardEvent) {
  return (
    event.target instanceof Element &&
    event.target.closest(commandCenterModalRootSelector) !== null
  );
}

export function useHotKeyListener(
  action: () => void,
  hotKeyAction: HotkeyActions,
  enabled = true,
) {
  const platform = useMemo(() => getCurrentPlatform(), []);
  const definition = hotkeyDefinitions[hotKeyAction];

  const hotKeyListener = useCallback(
    (ev: KeyboardEvent) => {
      const isMatchingHotkey = isEventMatch(ev, definition, platform);

      if (
        hotKeyAction !== HotkeyActions.OPEN_COMMAND_CENTER &&
        document.body.hasAttribute(commandCenterModalActiveAttribute)
      ) {
        if (isMatchingHotkey) {
          ev.preventDefault();
          if (!isEventFromCommandCenter(ev)) {
            ev.stopPropagation();
            ev.stopImmediatePropagation();
          }
        }
        return;
      }

      if (!enabled) return;

      // For non-dominant hotkeys, check if a native editable element should consume the event
      // This allows standard text editing behavior to work (e.g., Cmd+ArrowLeft in inputs)
      if (!definition.captureDominantly && shouldNativeInputConsumeEvent(ev))
        return;

      // The first matching hotkey action will be executed and abort further processing of other hotkey actions.
      if (isMatchingHotkey) {
        action();
        ev.stopPropagation();
        ev.preventDefault();
      }
    },
    [action, platform, definition, hotKeyAction, enabled],
  );

  // Use capture phase for dominant hotkeys to ensure they work even when
  // focus is inside webcontents (e.g., BrowserView)
  const options = useMemo(
    () => (definition.captureDominantly ? { capture: true } : undefined),
    [definition.captureDominantly],
  );

  useEventListener('keydown', hotKeyListener, options, window);
}
