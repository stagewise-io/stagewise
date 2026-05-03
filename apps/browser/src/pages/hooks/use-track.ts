import { useCallback, useRef } from 'react';
import { useKartonProcedure } from './use-karton';

/**
 * Hook that returns a `track(eventName, properties?)` function for the pages
 * renderer, which forwards UI telemetry to the backend via the pages-API
 * `captureTelemetry` procedure.
 *
 * ## Stability guarantee
 *
 * The returned `track` function has a stable identity across renders (it
 * never changes for the lifetime of the component). This is essential
 * because callers frequently include `track` in `useEffect` dep arrays to
 * satisfy the exhaustive-deps rule. If the identity changed per render,
 * those effects would re-run every render and any one-shot
 * fire-once-on-mount telemetry (e.g. `*-add-started`) would loop.
 *
 * We cannot rely on `useKartonProcedure` returning a stable reference:
 * Karton's procedure selector is memoized against the selector function
 * identity, and callers pass a fresh arrow `(p) => p.captureTelemetry`
 * per render, so the memoization invalidates every render and the proxy
 * accessor returns a newly-constructed Proxy each time. We pin the latest
 * capture function on a ref and dispatch through it.
 *
 * ## Error safety
 *
 * Any RPC failure (backend karton server unavailable, handler not yet
 * registered, transport error) is silently swallowed. Telemetry must
 * never surface as an unhandled rejection or bubble into React error
 * boundaries.
 *
 * Mirrors the contract of the sidebar's `useTrack` hook, but uses the
 * pages-API karton contract instead of the UI karton contract, because
 * pages run under a different preload.
 */
export function useTrack() {
  const capture = useKartonProcedure((p) => p.captureTelemetry);

  // Keep the latest `capture` proxy accessible without changing the
  // identity of the returned `track` function.
  const captureRef = useRef(capture);
  captureRef.current = capture;

  // Empty deps: stable identity for the component's lifetime. The ref
  // above ensures we still call the latest `capture` proxy each invocation.
  return useCallback(
    (eventName: string, properties?: Record<string, unknown>): void => {
      // Fire-and-forget. We intentionally do not await and we explicitly
      // catch, so a failed RPC (server unavailable, handler not registered,
      // transport error) cannot crash the page.
      void Promise.resolve()
        .then(() => captureRef.current(eventName, properties))
        .catch(() => {
          // Telemetry failures are intentionally silent.
        });
    },
    [],
  );
}
