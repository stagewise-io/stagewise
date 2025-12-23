import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TabState } from '@shared/karton-contracts/ui';
import { Tab } from './tab';

export function SortableTab({
  tabState,
  activateBottomLeftCornerRadius,
}: {
  tabState: TabState;
  activateBottomLeftCornerRadius: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tabState.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    overflow: 'visible',
    cursor: isDragging ? 'grabbing' : 'grab',
    // Width constraints: start at 13rem (w-52), shrink to min 6rem (min-w-24)
    width: '13rem',
    minWidth: '6rem',
    flexShrink: 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Tab
        tabState={tabState}
        activateBottomLeftCornerRadius={activateBottomLeftCornerRadius}
      />
    </div>
  );
}
