import { useEffect, useMemo, useRef } from 'react';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import type {
  AgentCommandItem,
  CommandCenterItem,
  CommandCenterMode,
} from '../command-center-model';
import { CommandCenterEmptyState } from './command-center-empty-state';
import { CommandCenterRow } from './command-center-row';

type CommandCenterRenderRow =
  | { type: 'header'; key: string; label: string }
  | { type: 'item'; item: CommandCenterItem; itemIndex: number };

type AgentGroupLabel =
  | 'Today'
  | 'Yesterday'
  | 'Last 7 days'
  | 'Last 30 days'
  | 'Older';

const AGENT_GROUP_ORDER: AgentGroupLabel[] = [
  'Today',
  'Yesterday',
  'Last 7 days',
  'Last 30 days',
  'Older',
];

function getAgentGroupLabel(timestamp: number): AgentGroupLabel {
  if (!timestamp) return 'Today';

  const now = new Date();
  const ts = new Date(timestamp);
  const nowMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const tsMidnight = new Date(
    ts.getFullYear(),
    ts.getMonth(),
    ts.getDate(),
  ).getTime();
  const diffDays = Math.round((nowMidnight - tsMidnight) / 86_400_000);

  if (diffDays < 0) return 'Today';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'Last 7 days';
  if (diffDays < 30) return 'Last 30 days';
  return 'Older';
}

function pushSection(
  rows: CommandCenterRenderRow[],
  label: string,
  items: { item: CommandCenterItem; itemIndex: number }[],
) {
  if (items.length === 0) return;
  rows.push({ type: 'header', key: `header:${label}`, label });
  rows.push(
    ...items.map(({ item, itemIndex }) => ({
      type: 'item' as const,
      item,
      itemIndex,
    })),
  );
}

function buildGlobalRows(items: CommandCenterItem[]): CommandCenterRenderRow[] {
  const indexedItems = items.map((item, itemIndex) => ({ item, itemIndex }));
  const rows: CommandCenterRenderRow[] = [];

  pushSection(
    rows,
    'Agents',
    indexedItems.filter(({ item }) => item.kind === 'agent'),
  );
  pushSection(
    rows,
    'Browser',
    indexedItems.filter(({ item }) => item.kind === 'tab'),
  );
  pushSection(
    rows,
    'Settings',
    indexedItems.filter(({ item }) => item.kind === 'setting'),
  );
  pushSection(
    rows,
    'Actions',
    indexedItems.filter(({ item }) => item.kind === 'action'),
  );

  return rows;
}

function buildAgentRows(items: CommandCenterItem[]): CommandCenterRenderRow[] {
  const groupedItems = new Map<
    AgentGroupLabel,
    { item: CommandCenterItem; itemIndex: number }[]
  >();

  items.forEach((item, itemIndex) => {
    const group = getAgentGroupLabel((item as AgentCommandItem).lastMessageAt);
    const groupItems = groupedItems.get(group) ?? [];
    groupItems.push({ item, itemIndex });
    groupedItems.set(group, groupItems);
  });

  return AGENT_GROUP_ORDER.flatMap((group) => {
    const groupItems = groupedItems.get(group);
    if (!groupItems?.length) return [];

    return [
      { type: 'header' as const, key: `header:agents:${group}`, label: group },
      ...groupItems.map(({ item, itemIndex }) => ({
        type: 'item' as const,
        item,
        itemIndex,
      })),
    ];
  });
}

function buildGroupedRows(
  items: CommandCenterItem[],
  mode: CommandCenterMode,
): CommandCenterRenderRow[] {
  if (mode === 'global') return buildGlobalRows(items);
  if (mode === 'agents') return buildAgentRows(items);

  return [
    {
      type: 'header',
      key: `header:${mode}`,
      label: mode === 'browser' ? 'Browser' : 'Settings',
    },
    ...items.map((item, itemIndex) => ({
      type: 'item' as const,
      item,
      itemIndex,
    })),
  ];
}

export function CommandCenterResults({
  items,
  mode,
  selectedIndex,
  isLoading,
  onSelect,
  onHoverIndex,
}: {
  items: CommandCenterItem[];
  mode: CommandCenterMode;
  selectedIndex: number;
  isLoading?: boolean;
  onSelect: (item: CommandCenterItem) => void;
  onHoverIndex: (index: number) => void;
}) {
  const itemRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
  const rows = useMemo(() => buildGroupedRows(items, mode), [items, mode]);

  useEffect(() => {
    itemRefs.current.get(selectedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (items.length === 0)
    return <CommandCenterEmptyState isLoading={isLoading} />;

  return (
    <OverlayScrollbar className="max-h-[44vh]">
      <div className="flex flex-col gap-0.5 p-1.5">
        {rows.map((row) => {
          if (row.type === 'header') {
            return (
              <div
                key={row.key}
                className="shrink-0 px-2 pt-2 pb-1 font-semibold text-subtle-foreground text-xs"
              >
                {row.label}
              </div>
            );
          }

          return (
            <CommandCenterRow
              key={row.item.id}
              item={row.item}
              selected={row.itemIndex === selectedIndex}
              onSelect={() => onSelect(row.item)}
              onHover={() => onHoverIndex(row.itemIndex)}
              onRef={(node) => itemRefs.current.set(row.itemIndex, node)}
            />
          );
        })}
      </div>
    </OverlayScrollbar>
  );
}
