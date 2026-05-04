import { GlobeIcon } from 'lucide-react';
import { cn } from '@stagewise/stage-ui/lib/utils';
import type { MentionProvider, MentionContext } from './types';
import type { TabMentionItem } from '../types';

function safeHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export const tabProvider: MentionProvider = {
  type: 'tab',
  groupLabel: 'Open Tabs',
  boost: 1.0,
  icon: ({ className }) => (
    <GlobeIcon className={cn('size-2.5 shrink-0', className)} />
  ),
  query: (_input: string, ctx: MentionContext): TabMentionItem[] => {
    const entries = Object.entries(ctx.tabs).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return entries.map(([tabId, tab]) => ({
      id: tabId,
      label: safeHost(tab.url),
      description: tab.title,
      providerType: 'tab' as const,
      relevance: tabId === ctx.activeTabId ? 1.0 : 0.5,
      meta: {
        providerType: 'tab' as const,
        tabId,
        url: tab.url,
        title: tab.title,
        faviconUrl: tab.faviconUrls?.[0],
      },
    }));
  },
};
