import { buttonVariants } from '@stagewise/stage-ui/components/button';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { cn } from '@ui/utils';

export interface SettingsScrollTabItem {
  id: string;
  label: string;
  subLabel?: string;
}

interface SettingsScrollTabsProps {
  items: SettingsScrollTabItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Truncate the sub-label from the start (left) and cap the tab width. Use
   * for path-like sub-labels where the trailing segment is the meaningful
   * part.
   */
  truncateSubLabelFromStart?: boolean;
}

/**
 * Horizontally-scrollable single-select tab bar used by settings sections.
 * Each tab shows a primary label and an optional subtle sub-label, with an
 * edge fade mask when the row overflows. Shared by the Worktrees and
 * Skills & Context settings pages so they stay visually in sync.
 */
export function SettingsScrollTabs({
  items,
  selectedId,
  onSelect,
  truncateSubLabelFromStart = false,
}: SettingsScrollTabsProps) {
  return (
    <OverlayScrollbar
      className="scrollbar-subtle max-w-full"
      viewportClassName="scroll-fade-x scroll-fade-6"
      options={{ overflow: { x: 'scroll', y: 'hidden' } }}
      contentClassName="flex gap-2"
    >
      <nav className="flex gap-2">
        {items.map((item) => {
          const selected = selectedId === item.id;
          const subLabelColor = selected
            ? 'text-muted-foreground group-hover/button:text-foreground group-focus-visible/button:text-foreground'
            : 'text-subtle-foreground group-hover/button:text-muted-foreground group-focus-visible/button:text-muted-foreground';
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                buttonVariants({
                  variant: 'ghost',
                }),
                'h-auto shrink-0 flex-col items-start px-3 py-2 text-left first:pl-0',
                truncateSubLabelFromStart && 'max-w-48',
                selected && 'font-medium text-foreground',
              )}
            >
              <span className="block max-w-full truncate text-sm">
                {item.label}
              </span>
              {item.subLabel ? (
                truncateSubLabelFromStart ? (
                  <span
                    className={cn(
                      'block max-w-full truncate text-xs',
                      subLabelColor,
                    )}
                    dir="rtl"
                  >
                    <span dir="ltr">{item.subLabel}</span>
                  </span>
                ) : (
                  <span className={cn('block truncate text-xs', subLabelColor)}>
                    {item.subLabel}
                  </span>
                )
              ) : null}
            </button>
          );
        })}
      </nav>
    </OverlayScrollbar>
  );
}
