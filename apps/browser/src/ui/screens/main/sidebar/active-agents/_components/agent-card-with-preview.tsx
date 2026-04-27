import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { AgentCard, type AgentCardProps } from './agent-card';
import {
  AgentPreviewPanel,
  prefetchAgentPreview,
  type CachedPreview,
} from '@ui/screens/main/sidebar/top/_components/agent-preview-panel';

const SHOW_DELAY_MS = 500;
const EXIT_DURATION_MS = 150;
const MARGIN = 4;

interface AgentCardWithPreviewProps extends AgentCardProps {
  cache: Map<string, CachedPreview>;
}

/**
 * Hover-preview wrapper for `AgentCard`. Shows `AgentPreviewPanel` next to the
 * card after a delay, portaled to `document.body` to escape any ancestor
 * clipping. Purely informational — closes instantly on `mouseleave` /
 * `mousedown` (no gap-traversal timer needed).
 *
 * To eliminate visual jitter, the wrapper:
 *  1. Pre-warms the shared cache during the hover delay, so the panel mounts
 *     with content (no skeleton → content height swap).
 *  2. Uses `useLayoutEffect` to measure the panel synchronously before the
 *     first paint, and keeps the portal `visibility: hidden` until measured,
 *     so the panel never appears at a stale-position first frame.
 */
export function AgentCardWithPreview({
  cache,
  ...cardProps
}: AgentCardWithPreviewProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonically incrementing hover-session counter. Used to discard a
  // late-resolving prefetch that belonged to a hover session the user has
  // already abandoned (moved to another card / clicked / left), and to
  // cancel a queued exit-unmount when a new hover arrives mid-fade-out.
  const hoverSessionRef = useRef(0);

  // Karton procedures are not referentially stable across state updates
  // (see `AgentPreviewPanel`). Mirror them into refs so `handleMouseEnter`'s
  // `useCallback` identity does not flip on every message/status change.
  // This matters because `AgentCard`'s memo comparator compares
  // `onMouseEnter` identity — an unstable handler would force every card to
  // re-render on every Karton state update, defeating the memo entirely.
  const getStoredInstance = useKartonProcedure(
    (p) => p.agents.getStoredInstance,
  );
  const getTouchedFiles = useKartonProcedure((p) => p.agents.getTouchedFiles);
  const getStoredInstanceRef = useRef(getStoredInstance);
  getStoredInstanceRef.current = getStoredInstance;
  const getTouchedFilesRef = useRef(getTouchedFiles);
  getTouchedFilesRef.current = getTouchedFiles;

  const [isOpen, setIsOpen] = useState(false);
  // Mirror `isOpen` into a ref so event handlers (`close`, `handleMouseEnter`)
  // can read the *committed* open-state regardless of React closure snapshots.
  // Used by `handleMouseEnter`'s re-hover branch to detect "portal currently
  // mounted" (both fully-open and fading-out count).
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  // Synchronous open-intent flag. Set `true` the instant we call
  // `setIsOpen(true)` (before React commits) and `false` the instant `close`
  // runs. Distinct from `isOpenRef` because it reflects *intent*, not
  // committed state.
  //
  // Why both are needed: when the timer callback calls `setIsOpen(true)` and
  // the user's `mouseleave` arrives before React commits, `close` reading
  // only `isOpenRef` would see `false` and take the early-return path —
  // leaving the pending open queued, which then mounts the panel even
  // though the hover has ended. Checking the intent ref instead lets
  // `close` run the full fade-out path: the portal mounts invisible
  // (`isExiting=true`) and unmounts after the transition, with no visible
  // flash.
  const openIntentRef = useRef(false);
  const [isMeasured, setIsMeasured] = useState(false);
  // When true the portal remains mounted but the panel is transitioning
  // opacity → 0 so the user sees a fade-out. Unmount happens after the
  // transition completes.
  const [isExiting, setIsExiting] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const cancelShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const cancelExitTimer = useCallback(() => {
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancelShowTimer();
    // Bump the session so an in-flight prefetch cannot re-open the panel
    // after the user moved away.
    hoverSessionRef.current++;
    // Snapshot + clear intent atomically. A racing `setIsOpen(true)` that
    // was queued but not yet committed still counts as "panel about to
    // mount" — we must run the full fade-out path so the portal unmounts
    // cleanly rather than staying stuck open.
    const hadIntent = openIntentRef.current;
    openIntentRef.current = false;

    // If neither currently rendered nor about-to-render, nothing to fade.
    if (!isOpenRef.current && !hadIntent) {
      setIsMeasured(false);
      setIsExiting(false);
      return;
    }

    // Start fade-out transition, then unmount after it completes. A
    // mid-fade re-hover calls `cancelExitTimer` in `handleMouseEnter`,
    // which prevents this callback from ever firing — no session check
    // needed here.
    setIsExiting(true);
    cancelExitTimer();
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      setIsOpen(false);
      setIsMeasured(false);
      setIsExiting(false);
    }, EXIT_DURATION_MS);
  }, [cancelShowTimer, cancelExitTimer]);

  /** Compute final position using the currently-rendered panel height. Only
   *  safe to call *after* the portal has mounted (panelRef.current is set).
   */
  const computePosition = useCallback(() => {
    const card = cardRef.current;
    const panel = panelRef.current;
    if (!card || !panel) return;

    const cardRect = card.getBoundingClientRect();
    // Measure the rendered panel (includes padding + border from
    // `PreviewCard`'s wrapper, not just the inner `w-56` content) so the
    // viewport-edge flip/clamp math matches what the user actually sees.
    const panelW = panel.offsetWidth;
    const panelH = panel.offsetHeight;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const rightAnchor = cardRect.right + MARGIN;
    const placeLeft = rightAnchor + panelW > viewportW;
    const left = placeLeft
      ? Math.max(MARGIN, cardRect.left - panelW - MARGIN)
      : rightAnchor;

    const idealTop = cardRect.top + cardRect.height / 2 - panelH / 2;
    const top = Math.max(
      MARGIN,
      Math.min(idealTop, viewportH - panelH - MARGIN),
    );

    setPos({ top, left });
  }, []);

  const handleMouseEnter = useCallback(() => {
    cancelShowTimer();
    cancelExitTimer();
    const session = ++hoverSessionRef.current;

    // If the panel is still mounted (fade-out in progress or already open),
    // cancel the exit and show immediately instead of re-running the full
    // 500ms intent delay. Feels snappy when the user moves away briefly
    // and comes back. `cancelExitTimer` above already prevented the pending
    // unmount; just flip `isExiting` back off so the opacity/transform
    // transition reverses.
    if (isOpenRef.current) {
      setIsExiting(false);
      return;
    }
    // Start prefetch immediately so it runs in parallel with the 500ms
    // intent delay. By the time the timer fires the RPC is typically
    // already resolved and the cache is warm — the panel then mounts with
    // content on the very first frame, no skeleton flash.
    // `isLiveAgent=true`: every card in `ActiveAgentsGrid` is sourced from
    // `s.agents.instances`, so it is by construction a live (in-memory)
    // agent — regardless of whether it's the currently-focused card
    // (`cardProps.isActive`, which is pure visual state). Passing the
    // visual flag here would cause prefetch to cache `{ data: null }` for
    // non-focused live agents whose stored row hasn't been flushed yet,
    // pinning their preview blank for the grid lifetime.
    const prefetchPromise = prefetchAgentPreview(
      cardProps.id,
      cache,
      getStoredInstanceRef.current,
      getTouchedFilesRef.current,
      true,
    );
    showTimerRef.current = setTimeout(async () => {
      showTimerRef.current = null;
      // Await to guarantee the cache is warm before mounting the portal,
      // even if the RPC is slower than the delay. On warm cache this is a
      // no-op (early return inside `prefetchAgentPreview`).
      const prefetched = await prefetchPromise;
      // Abort if the user moved away / a newer hover superseded this one.
      if (hoverSessionRef.current !== session) return;
      // Skip opening the portal when there is nothing to render:
      //   - `prefetched === null` — cache could not be warmed (stored-fetch
      //     rejected, or active agent not yet persisted). Next hover retries.
      //   - `prefetched.data === null` — confirmed-empty history agent; the
      //     panel would render nothing anyway, so suppressing the portal
      //     avoids an empty-div flash.
      // Without this guard we'd break the "pre-warm before first paint"
      // contract: the portal would mount cold, show the skeleton, then
      // resolve to nothing.
      if (!prefetched?.data) return;
      // Mark intent synchronously *before* queueing the state update. If a
      // `mouseleave` lands between here and React's commit, `close` will
      // observe the intent and trigger a fade-out that mounts the portal
      // invisible instead of leaving it stuck open.
      openIntentRef.current = true;
      setIsOpen(true);
    }, SHOW_DELAY_MS);
    // Dep-array intentionally omits `getStoredInstance` / `getTouchedFiles`
    // — they're read via refs above, so reference changes should not
    // re-create the callback. See the comment where the refs are set up.
  }, [cancelShowTimer, cancelExitTimer, cardProps.id, cache]);

  // Measure-then-show: runs synchronously before paint so the panel never
  // renders at a stale position.
  useLayoutEffect(() => {
    if (!isOpen) return;
    computePosition();
    setIsMeasured(true);
  }, [isOpen, computePosition]);

  // While open, reposition on panel height changes (late fetch resolution,
  // content swap), list scroll, and window resize.
  useEffect(() => {
    if (!isOpen) return;

    const onScroll = () => computePosition();
    const onResize = () => computePosition();
    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', onResize, { passive: true });

    let ro: ResizeObserver | null = null;
    const panel = panelRef.current;
    if (panel) {
      ro = new ResizeObserver(() => computePosition());
      ro.observe(panel);
    }

    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [isOpen, computePosition]);

  // Cancel any pending timers on unmount.
  useEffect(
    () => () => {
      cancelShowTimer();
      cancelExitTimer();
    },
    [cancelShowTimer, cancelExitTimer],
  );

  return (
    <>
      <AgentCard
        {...cardProps}
        ref={cardRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={close}
        onMouseDown={close}
      />
      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            // `pointer-events: none` so the cursor passes through the panel
            // back to the card beneath — avoids flicker on the narrow gap
            // and keeps the panel purely informational.
            //
            // Opacity + translateX transition, gated on `isMeasured`, gives
            // us both the jitter-prevention (no paint at panelH=0 position)
            // and a smooth fade-in-from-left on entry. The `PreviewCard`'s
            // own `animate-in` classes still run underneath, but invisibly
            // during the opacity=0 window — the user sees the combined
            // effect as a single smooth reveal.
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              pointerEvents: 'none',
              opacity: isMeasured && !isExiting ? 1 : 0,
              transform:
                isMeasured && !isExiting ? 'translateX(0)' : 'translateX(-4px)',
              transition: `opacity ${EXIT_DURATION_MS}ms ease-out, transform ${EXIT_DURATION_MS}ms ease-out`,
              zIndex: 50,
            }}
          >
            <AgentPreviewPanel
              key={cardProps.id}
              agentId={cardProps.id}
              // Always `true` in this surface — see the prefetch call above
              // for the rationale. `cardProps.isActive` here would make the
              // panel skip the Karton live-overlay (title / messageCount /
              // workspaces) for non-focused live cards, rendering stale
              // persisted values instead.
              isActive={true}
              cache={cache}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
