import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  cmdEnterRegistry,
  type CmdEnterPriority,
} from '@ui/utils/cmd-enter-registry';

export interface UseCmdEnterTargetOptions {
  id: string;
  priority: CmdEnterPriority;
  action: () => void;
  enabled: boolean;
}

export interface UseCmdEnterTargetResult {
  setRef: (element: HTMLElement | null) => void;
  isWinner: boolean;
}

/**
 * Registers a CMD+Enter-eligible button with the global registry.
 *
 * - The DOM element is tracked via a callback ref (`setRef`).
 * - The `action` callback is stored in a ref so action changes never
 *   trigger re-registration — the registry always calls the latest one.
 * - `isWinner` is driven by `useSyncExternalStore`, so only the old
 *   winner and the new winner re-render when the winner changes.
 */
export function useCmdEnterTarget(
  options: UseCmdEnterTargetOptions,
): UseCmdEnterTargetResult {
  const { id, priority, action, enabled } = options;

  // Always-current action — registration callback reads from this ref,
  // so we never need to re-register when the closure changes.
  const actionRef = useRef(action);
  actionRef.current = action;

  const [element, setElement] = useState<HTMLElement | null>(null);
  const setRef = useCallback((el: HTMLElement | null) => {
    setElement(el);
  }, []);

  // Register / unregister with the registry when id, element, or enabled
  // changes. Priority is intentionally excluded — the update effect below
  // propagates priority changes in-place without a full re-registration,
  // avoiding a transient unregister gap where a keystroke could be dropped.
  useEffect(() => {
    if (!enabled || !element) return;
    const unregister = cmdEnterRegistry.register({
      id,
      priority,
      action: () => actionRef.current(),
      element,
    });
    return unregister;
  }, [id, enabled, element]);

  // Update priority in-place when it changes (no re-registration).
  useEffect(() => {
    if (!enabled) return;
    cmdEnterRegistry.update(id, { priority });
  }, [id, priority, enabled]);

  // Subscribe to winner changes — only re-renders when this target
  // becomes or stops being the winner.
  const getIsWinner = useCallback(
    () => cmdEnterRegistry.getSnapshot() === id,
    [id],
  );
  const isWinner = useSyncExternalStore(
    cmdEnterRegistry.subscribe,
    getIsWinner,
    () => false,
  );

  return { setRef, isWinner };
}
