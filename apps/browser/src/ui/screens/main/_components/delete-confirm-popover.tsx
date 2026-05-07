import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
  PopoverFooter,
  PopoverClose,
} from '@stagewise/stage-ui/components/popover';
import { Button } from '@stagewise/stage-ui/components/button';
import { useEffect, useMemo, useRef } from 'react';
import { useKartonState } from '@ui/hooks/use-karton';
import { useFloatingIsolation } from './use-floating-isolation';

/**
 * Top viewport padding reserved for the macOS traffic-light controls when
 * the window uses a hidden titlebar. Matches the `h-8` (32px) titlebar
 * placeholder plus a small visual margin.
 */
const MAC_TRAFFIC_LIGHT_PADDING = 40;

/**
 * Confirmation popover for permanently deleting an agent.
 * Controlled by the parent via `open` / `onOpenChange`.
 *
 * Pass `isolated` when this popover may appear alongside (not inside) an
 * ambient floating surface such as an open Combobox — the right-click
 * context-menu flow is the main case. Isolation stops clicks inside this
 * popover from dismissing the ambient surface. See `useFloatingIsolation`.
 *
 * When `anchorPoint` is set, the popover spawns just above that viewport
 * coordinate (typically the cursor position captured at right-click time).
 * Without it, the popover falls back to the static zero-sized trigger span,
 * which anchors against its nearest positioned ancestor.
 */
export function DeleteConfirmPopover({
  open,
  onOpenChange,
  onConfirm,
  isolated = false,
  anchorPoint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isolated?: boolean;
  anchorPoint?: { x: number; y: number };
}) {
  // On macOS with a hidden titlebar, keep the popover clear of the
  // traffic-light overlay that sits at the top of the window.
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);
  const collisionPadding = useMemo(
    () =>
      isMacOs && !isFullScreen ? { top: MAC_TRAFFIC_LIGHT_PADDING } : undefined,
    [isMacOs, isFullScreen],
  );

  // PopoverContent doesn't forwardRef — mount an internal `display: contents`
  // wrapper we can ref and use as the isolation boundary.
  const shieldRef = useRef<HTMLDivElement>(null);
  useFloatingIsolation(shieldRef, isolated && open);

  // Retain the last anchor point through the close animation. If we drop
  // back to `undefined` the moment the parent clears its state, base-ui
  // falls back to the static `<span>` trigger (bottom-right of the nearest
  // positioned ancestor) for the remainder of the ~150ms exit transition,
  // causing a visible flash at the bottom of the sidebar. Same pattern as
  // SharedAgentContextMenuHost's `lastTargetRef` — render-phase ref
  // mutation keeps the coords around without forcing an extra render each
  // time the parent hands us a fresh `{ x, y }` object.
  const lastAnchorRef = useRef<{ x: number; y: number } | null>(null);
  if (anchorPoint) lastAnchorRef.current = anchorPoint;
  const activeAnchor = anchorPoint ?? lastAnchorRef.current ?? undefined;

  // Release the retained anchor shortly after the close animation settles.
  // 300ms is comfortably longer than the 150ms popup transition.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      lastAnchorRef.current = null;
    }, 300);
    return () => clearTimeout(t);
  }, [open]);

  // Virtual anchor built from the captured cursor coordinates. base-ui's
  // positioner only needs `getBoundingClientRect()`. Memoized on the coords
  // so the anchor identity is stable across renders while `open`.
  const anchorX = activeAnchor?.x;
  const anchorY = activeAnchor?.y;
  const anchor = useMemo(() => {
    if (anchorX === undefined || anchorY === undefined) return undefined;
    return {
      getBoundingClientRect: () =>
        DOMRect.fromRect({ x: anchorX, y: anchorY, width: 0, height: 0 }),
    };
  }, [anchorX, anchorY]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger nativeButton={false}>
        <span className="pointer-events-none absolute right-0 bottom-0 size-0" />
      </PopoverTrigger>
      <PopoverContent
        anchor={anchor}
        side={anchor ? 'top' : undefined}
        align={anchor ? 'center' : undefined}
        collisionPadding={collisionPadding}
      >
        <div ref={shieldRef} className="contents">
          <PopoverTitle>Delete agent?</PopoverTitle>
          <PopoverDescription>
            This will permanently delete this agent and its chat history.
          </PopoverDescription>
          <PopoverClose />
          <PopoverFooter>
            <Button variant="primary" size="xs" onClick={onConfirm} autoFocus>
              Delete
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </PopoverFooter>
        </div>
      </PopoverContent>
    </Popover>
  );
}
