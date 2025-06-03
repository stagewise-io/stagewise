import { useCallback } from 'preact/hooks';
import { useEventListener } from './use-event-listener';

const eventListenerOptions: AddEventListenerOptions = {
  capture: true,
};

// binding and unbinding keydown handler
export function useKeydownBinding(
  key: string,
  withCtrl: boolean,
  withAlt: boolean,
  callback: () => void,
) {
  const handler = useCallback(
    (ev: KeyboardEvent) => {
      if (
        ev.key === key &&
        (ev.ctrlKey || !withCtrl) &&
        (ev.altKey || !withAlt)
      )
        callback();
    },
    [callback, key, withAlt, withCtrl],
  );

  useEventListener('keydown', handler, eventListenerOptions);
}
