import { useMemo } from 'react';
import { useComparingSelector, useKartonState } from '@ui/hooks/use-karton';
import type { TabState } from '@shared/karton-contracts/ui';
import { CommandCenterTabFavicon } from '../_components/command-center-tab-favicon';
import type { TabCommandItem } from '../command-center-model';
import { filterAndRankCommandCenterItems } from '../command-center-search';

function tabsEqual(a: TabCommandItem[], b: TabCommandItem[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (
      ai.tabId !== bi.tabId ||
      ai.title !== bi.title ||
      ai.url !== bi.url ||
      ai.screenshot !== bi.screenshot ||
      ai.isActive !== bi.isActive ||
      ai.lastFocusedAt !== bi.lastFocusedAt ||
      ai.faviconUrls.length !== bi.faviconUrls.length ||
      ai.faviconUrls.some((url, index) => url !== bi.faviconUrls[index])
    )
      return false;
  }
  return true;
}

function tabTitle(tab: TabState) {
  if (tab.title.trim()) return tab.title;
  if (tab.url.trim()) return tab.url;
  return 'Untitled Tab';
}

export function useTabCommandItems(query: string) {
  const tabs = useKartonState(
    useComparingSelector((s): TabCommandItem[] => {
      const activeTabId = s.browser.activeTabId;
      return Object.values(s.browser.tabs).map((tab) => {
        const title = tabTitle(tab);

        return {
          id: `tab:${tab.id}`,
          kind: 'tab',
          mode: 'browser',
          title,
          subtitle: tab.url,
          keywords: ['tab', 'browser', tab.url],
          icon: (
            <CommandCenterTabFavicon
              faviconUrls={tab.faviconUrls}
              title={title}
              url={tab.url}
            />
          ),
          tabId: tab.id,
          url: tab.url,
          faviconUrls: tab.faviconUrls,
          screenshot: tab.screenshot,
          isActive: tab.id === activeTabId,
          lastFocusedAt: tab.lastFocusedAt,
        };
      });
    }, tabsEqual),
  );

  const items = useMemo(() => {
    return filterAndRankCommandCenterItems(tabs, query).sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (b.score !== a.score) return (b.score ?? 0) - (a.score ?? 0);
      return b.lastFocusedAt - a.lastFocusedAt;
    });
  }, [tabs, query]);

  return { items };
}
