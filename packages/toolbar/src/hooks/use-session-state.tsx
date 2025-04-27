import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { useEventListener } from "./use-event-listener";

export function useSessionState(key: string, defaultValue: string) {
  const prependedKey = useMemo(
    () => `stagewise-companion-state-entry-${key}`,
    [key]
  );

  const [cachedState, setCachedState] = useState<string>(
    sessionStorage.getItem(prependedKey) !== null
      ? (sessionStorage.getItem(prependedKey) as string)
      : defaultValue
  );

  // Do initial population of session storage if it doesn't exist
  useEffect(() => {
    if (sessionStorage.getItem(prependedKey) === null) {
      sessionStorage.setItem(prependedKey, defaultValue);
    }
  }, [defaultValue, prependedKey]);

  const setState = useCallback(
    (value: string) => {
      sessionStorage.setItem(prependedKey, value);
      setCachedState(value);
      window.dispatchEvent(
        new Event("stagewise-companion-session-state-change")
      );
    },
    [prependedKey]
  );

  const onStorageChange = useCallback(() => {
    setCachedState(
      sessionStorage.getItem(prependedKey) !== null
        ? (sessionStorage.getItem(prependedKey) as string)
        : defaultValue
    );
  }, [defaultValue, prependedKey]);

  useEventListener("stagewise-companion-session-state-change", onStorageChange);

  return [cachedState, setState] as const;
}
