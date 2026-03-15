import { useMemo, useState, useCallback } from 'react';
import { IconGlobe2Fill18 } from 'nucleo-ui-fill-18';
import { cn } from '@ui/utils';
import { InlineBadge, InlineBadgeWrapper } from '../shared';
import { useTabSnapshots } from '@ui/hooks/use-tab-snapshots';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import type { TabMentionMeta } from '@shared/karton-contracts/ui/agent/metadata';

interface TabMentionBadgeProps {
  /** Tab ID — always available from the mention node's id attr. */
  tabId?: string;
  /** Direct meta from @-mention node attrs (takes priority over context lookup) */
  meta?: TabMentionMeta | null;
  selected?: boolean;
  isEditable?: boolean;
  onDelete?: () => void;
  viewOnly?: boolean;
}

function TabFaviconMini({
  url,
  title,
  className,
}: {
  url?: string;
  title?: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (!url || hasError) {
    return (
      <IconGlobe2Fill18
        className={cn('size-3 shrink-0 text-muted-foreground', className)}
      />
    );
  }

  return (
    <img
      src={url}
      alt={title || 'Tab icon'}
      onError={() => setHasError(true)}
      className={cn('size-3 shrink-0 rounded-sm', className)}
    />
  );
}

export function TabMentionBadge({
  tabId,
  meta,
  selected = false,
  isEditable = false,
  onDelete,
  viewOnly = true,
}: TabMentionBadgeProps) {
  const tabSnapshots = useTabSnapshots();
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const createTab = useKartonProcedure((p) => p.browser.createTab);

  const liveTab = useKartonState((s) => {
    if (tabId && s.browser.tabs[tabId]) return s.browser.tabs[tabId]!;
    return null;
  });

  // Resolution priority: live state > persisted snapshot > inline meta
  const tabData = useMemo(() => {
    if (liveTab) {
      return {
        title: liveTab.title,
        url: liveTab.url,
        faviconUrl: liveTab.faviconUrls?.[0],
        isOpen: true,
        tabId: liveTab.id,
      };
    }

    if (tabId) {
      const snapshot = tabSnapshots?.get(tabId);
      if (snapshot) {
        return {
          title: snapshot.title,
          url: snapshot.url,
          faviconUrl: snapshot.faviconUrl,
          isOpen: false,
          tabId: null,
        };
      }
    }

    if (meta) {
      return {
        title: meta.title,
        url: meta.url,
        faviconUrl: meta.faviconUrl,
        isOpen: false,
        tabId: null,
      };
    }

    return null;
  }, [liveTab, tabSnapshots, tabId, meta]);

  const displayLabel = useMemo(() => {
    if (!tabData) return tabId ?? '?';
    const title = tabData.title;
    if (title && title.length > 24) return `${title.slice(0, 24)}...`;
    return title || tabId || '?';
  }, [tabData, tabId]);

  const tooltipContent = useMemo(() => {
    if (!tabData) return tabId ?? '';
    return tabData.url ?? '';
  }, [tabData, tabId]);

  const handleClick = useCallback(() => {
    if (!tabData) return;
    if (tabData.isOpen && tabData.tabId) {
      void switchTab(tabData.tabId);
    } else if (tabData.url) {
      void createTab(tabData.url);
    }
  }, [tabData, switchTab, createTab]);

  const icon = (
    <TabFaviconMini url={tabData?.faviconUrl} title={tabData?.title} />
  );

  const badge = (
    <InlineBadgeWrapper viewOnly={viewOnly} tooltipContent={tooltipContent}>
      <InlineBadge
        icon={icon}
        label={displayLabel}
        selected={selected}
        isEditable={isEditable}
        onDelete={() => onDelete?.()}
        className={cn('cursor-pointer', !tabData?.isOpen && 'opacity-70')}
        onClick={handleClick}
      />
    </InlineBadgeWrapper>
  );

  return badge;
}
