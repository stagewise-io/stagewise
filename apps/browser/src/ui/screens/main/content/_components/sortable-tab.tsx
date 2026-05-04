import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TabState } from '@shared/karton-contracts/ui';
import { Tab } from './tab';

export function SortableTab({
  tabState,
  isActive,
}: {
  tabState: TabState;
  isActive: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tabState.id, attributes: { tabIndex: -1 } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    overflow: 'visible',
    // Width constraints: start at 13rem (w-52), shrink to min 6rem (min-w-24)
    width: '8rem',
    minWidth: '5rem',
    flexShrink: 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-state={isActive ? 'active' : 'inactive'}
      className="data-[state=active]:bg-surface-1 data-[state=inactive]:bg-transparent"
      {...attributes}
      {...listeners}
    >
      <Tab tabState={tabState} isDragging={isDragging} />
    </div>
  );
}
