import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactElement, useState } from 'react';
import {
  SortableTabs,
  SortableTabsList,
  type SortableTabItem,
} from '../components/sortable-tabs';
import { TabsContent } from '../components/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip';
import {
  GlobeIcon,
  HomeIcon,
  SettingsIcon,
  BarChartIcon,
  Volume2Icon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const pillItems: SortableTabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'reports', label: 'Reports' },
  { id: 'notifications', label: 'Notifications' },
];

const barItems: SortableTabItem[] = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChartIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  { id: 'external', label: 'stagewise.io', icon: <GlobeIcon /> },
];

function ContentPanel({ id }: { id: string }) {
  return (
    <div className="rounded-lg border border-border/20 bg-white/40 p-4">
      <h2 className="mb-2 font-semibold text-lg capitalize">{id}</h2>
      <p className="text-muted-foreground text-sm">
        Content for <strong>{id}</strong>.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: 'Example/SortableTabs',
  component: SortableTabs,
  tags: ['autodocs'],
} satisfies Meta<typeof SortableTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const PillVariant: Story = {
  name: 'Pill variant (default)',
  render: () => {
    const [items, setItems] = useState(pillItems);
    const [active, setActive] = useState('overview');

    return (
      <SortableTabs value={active} onValueChange={setActive}>
        <SortableTabsList items={items} onReorder={setItems} />
        {items.map((item) => (
          <TabsContent key={item.id} value={item.id}>
            <ContentPanel id={item.id} />
          </TabsContent>
        ))}
      </SortableTabs>
    );
  },
};

export const BarVariant: Story = {
  name: 'Bar variant (browser-chrome style)',
  render: () => {
    const [items, setItems] = useState<SortableTabItem[]>(() =>
      barItems.map((item) => ({
        ...item,
        onClose:
          // Don't allow closing if it's the last tab
          barItems.length > 1
            ? () => setItems((prev) => prev.filter((t) => t.id !== item.id))
            : undefined,
      })),
    );
    const [active, setActive] = useState('home');

    const handleAdd = () => {
      const id = `tab-${Date.now()}`;
      setItems((prev) => [
        ...prev,
        {
          id,
          label: 'New tab',
          icon: <GlobeIcon />,
          onClose: () => setItems((p) => p.filter((t) => t.id !== id)),
        },
      ]);
      setActive(id);
    };

    return (
      <div className="flex flex-col overflow-hidden rounded-lg border border-border/20">
        {/* Tab bar — sits at the top like a browser chrome */}
        <div className="border-derived border-b bg-background">
          <SortableTabs value={active} onValueChange={setActive}>
            <SortableTabsList
              variant="bar"
              items={items}
              onReorder={setItems}
              activeValue={active}
              onAddItem={handleAdd}
            />
            {items.map((item) => (
              <TabsContent key={item.id} value={item.id} className="p-4">
                <ContentPanel id={item.id} />
              </TabsContent>
            ))}
          </SortableTabs>
        </div>
      </div>
    );
  },
};

export const BarWithLocalStoragePersistence: Story = {
  name: 'Bar — localStorage persistence',
  render: () => {
    const STORAGE_KEY = 'storybook-bar-tabs-order';

    const baseItems: SortableTabItem[] = barItems;

    const loadOrder = (): SortableTabItem[] => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return baseItems;
        const savedIds: string[] = JSON.parse(saved);
        const byId = Object.fromEntries(baseItems.map((t) => [t.id, t]));
        return savedIds
          .map((id) => byId[id])
          .filter((t): t is SortableTabItem => t !== undefined);
      } catch {
        return baseItems;
      }
    };

    const [items, setItems] = useState<SortableTabItem[]>(loadOrder);
    const [active, setActive] = useState(items[0]?.id ?? 'home');

    const handleReorder = (newItems: SortableTabItem[]) => {
      setItems(newItems);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(newItems.map((t) => t.id)),
      );
    };

    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          Tab order is persisted to <code>localStorage</code>. Reload to verify.
        </p>
        <SortableTabs value={active} onValueChange={setActive}>
          <SortableTabsList
            variant="bar"
            items={items}
            onReorder={handleReorder}
            activeValue={active}
          />
          {items.map((item) => (
            <TabsContent key={item.id} value={item.id}>
              <ContentPanel id={item.id} />
            </TabsContent>
          ))}
        </SortableTabs>
      </div>
    );
  },
};

export const BarWithActionsAndWrapper: Story = {
  name: 'Bar — actions + wrapTrigger',
  render: () => {
    // Each tab has a "playing audio" badge as its `actions` slot and a
    // Tooltip wrapping the whole tab item via `wrapTrigger`.
    const [items, setItems] = useState<SortableTabItem[]>(() =>
      barItems.map((item, i) => ({
        ...item,
        onClose: () => setItems((prev) => prev.filter((t) => t.id !== item.id)),
        // Alternate tabs show the audio badge so both states are visible
        actions:
          i % 2 === 0 ? (
            <span className="flex shrink-0 items-center pr-1 text-muted-foreground">
              <Volume2Icon className="size-3" />
            </span>
          ) : undefined,
        wrapTrigger: (inner: ReactElement) => (
          <Tooltip key={item.id}>
            <TooltipTrigger>{inner}</TooltipTrigger>
            <TooltipContent>{item.label}</TooltipContent>
          </Tooltip>
        ),
      })),
    );
    const [active, setActive] = useState('home');

    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          Even-indexed tabs show a volume icon via <code>actions</code>. Every
          tab is wrapped in a tooltip via <code>wrapTrigger</code>.
        </p>
        <SortableTabs value={active} onValueChange={setActive}>
          <SortableTabsList
            variant="bar"
            items={items}
            onReorder={setItems}
            activeValue={active}
          />
          {items.map((item) => (
            <TabsContent key={item.id} value={item.id}>
              <ContentPanel id={item.id} />
            </TabsContent>
          ))}
        </SortableTabs>
      </div>
    );
  },
};

export const PillWithLocalStoragePersistence: Story = {
  name: 'Pill — localStorage persistence',
  render: () => {
    const STORAGE_KEY = 'storybook-pill-tabs-order';

    const loadOrder = (): SortableTabItem[] => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return pillItems;
        const savedIds: string[] = JSON.parse(saved);
        const byId = Object.fromEntries(pillItems.map((t) => [t.id, t]));
        return savedIds
          .map((id) => byId[id])
          .filter((t): t is SortableTabItem => t !== undefined);
      } catch {
        return pillItems;
      }
    };

    const [items, setItems] = useState<SortableTabItem[]>(loadOrder);
    const [active, setActive] = useState(items[0]?.id ?? 'overview');

    const handleReorder = (newItems: SortableTabItem[]) => {
      setItems(newItems);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(newItems.map((t) => t.id)),
      );
    };

    return (
      <SortableTabs value={active} onValueChange={setActive}>
        <SortableTabsList items={items} onReorder={handleReorder} />
        {items.map((item) => (
          <TabsContent key={item.id} value={item.id}>
            <ContentPanel id={item.id} />
          </TabsContent>
        ))}
      </SortableTabs>
    );
  },
};
