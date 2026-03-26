import { forwardRef } from 'react';
import { cn } from '@ui/utils';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';

const MAX_POPUP_HEIGHT = 208; // max-h-52

/**
 * Shared positioned container for suggestion popups (mentions, slash commands, etc.).
 * Renders a floating panel anchored to the cursor's clientRect, with optional side panel.
 */
export const SuggestionPopupContainer = forwardRef<
  HTMLDivElement,
  {
    clientRect: (() => DOMRect | null) | null;
    children: React.ReactNode;
    sidePanel?: React.ReactNode;
    onMouseMove?: () => void;
  }
>(function SuggestionPopupContainer(
  { clientRect, children, sidePanel, onMouseMove },
  ref,
) {
  const rect = clientRect?.();
  if (!rect) return null;

  const gap = 4;
  const spaceAbove = rect.top;
  const placeAbove = spaceAbove >= MAX_POPUP_HEIGHT + gap;

  const style: React.CSSProperties = placeAbove
    ? { bottom: window.innerHeight - rect.top + gap, left: rect.left }
    : { top: rect.bottom + gap, left: rect.left };

  return (
    <div
      ref={ref}
      className="fixed z-50 flex flex-row items-start gap-1"
      style={style}
      onMouseMove={onMouseMove}
    >
      <div className="w-64 rounded-lg border border-derived bg-background p-1 shadow-lg">
        <OverlayScrollbar className="max-h-52" defer={false}>
          {children}
        </OverlayScrollbar>
      </div>
      {sidePanel}
    </div>
  );
});

/**
 * Shared side panel that floats to the right of a suggestion popup,
 * vertically aligned to the selected item.
 */
export const SuggestionSidePanel = forwardRef<
  HTMLDivElement,
  { offset: number; children: React.ReactNode; className?: string }
>(function SuggestionSidePanel({ offset, children, className }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'absolute left-full ml-1 flex w-56 flex-col gap-2 rounded-lg border border-derived bg-background p-2.5 text-foreground text-xs shadow-lg transition-[top] duration-100 ease-out',
        'fade-in-0 slide-in-from-left-1 animate-in duration-150',
        className,
      )}
      style={{ top: offset }}
    >
      {children}
    </div>
  );
});
