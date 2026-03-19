import { useMemo, useState, useCallback } from 'react';
import { IconGlobe2Fill18 } from 'nucleo-ui-fill-18';
import { ExternalLinkIcon } from 'lucide-react';
import { cn } from '@ui/utils';
import { InlineBadge, InlineBadgeWrapper } from '../shared';
import { useMessageBrowserContext } from '@ui/hooks/use-message-browser-context';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { ContextMenu } from '@base-ui/react/context-menu';
import { Menu as MenuBase } from '@base-ui/react/menu';
import type { TabMentionMeta } from '@shared/karton-contracts/ui/agent/metadata';

interface TabMentionBadgeProps {
  /** Tab ID — always available from the mention node's id attr. */
  tabId?: string;
  /** Direct meta from @-mention node attrs (fallback when no context snapshot) */
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

const menuItemClassName =
  'flex w-full cursor-default flex-row items-center justify-start gap-2 rounded-md px-2 py-1 text-foreground text-xs outline-none transition-colors duration-150 ease-out hover:bg-surface-1 data-highlighted:bg-surface-1';

type TabState =
  | 'normal' // live tab, same session, URL unchanged
  | 'navigated' // live tab, same session, URL differs
  | 'closed' // no live tab, same session
  | 'restarted'; // stale session

export function TabMentionBadge({
  tabId,
  meta,
  selected = false,
  isEditable = false,
  onDelete,
  viewOnly = true,
}: TabMentionBadgeProps) {
  const { sessionId: messageBrowserSessionId, tabs: tabSnapshots } =
    useMessageBrowserContext();
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const createTab = useKartonProcedure((p) => p.browser.createTab);

  const liveBrowserSessionId = useKartonState((s) => s.browser.sessionId);
  const liveTab = useKartonState((s) =>
    tabId ? (s.browser.tabs[tabId] ?? null) : null,
  );

  const isStaleSession =
    messageBrowserSessionId !== null &&
    messageBrowserSessionId !== '' &&
    liveBrowserSessionId !== '' &&
    messageBrowserSessionId !== liveBrowserSessionId;

  /**
   * The tab's title/url/favicon as they were when the message was sent.
   * Resolution order: per-message snapshot (from sparse env snapshot) → inline meta.
   */
  const historicalData = useMemo(() => {
    if (tabId && tabSnapshots) {
      const snap = tabSnapshots.get(tabId);
      if (snap) {
        return {
          title: snap.title,
          url: snap.url,
          faviconUrl: snap.faviconUrl,
        };
      }
    }
    if (meta) {
      return {
        title: meta.title,
        url: meta.url,
        faviconUrl: meta.faviconUrl,
      };
    }
    return null;
  }, [tabId, tabSnapshots, meta]);

  /** Determine which state the badge is in. */
  const tabState = useMemo<TabState>(() => {
    if (isStaleSession) return 'restarted';
    if (!liveTab) return 'closed';
    // Same session, tab is open — check URL drift
    const originalUrl = historicalData?.url;
    if (originalUrl && liveTab.url && liveTab.url !== originalUrl) {
      return 'navigated';
    }
    return 'normal';
  }, [isStaleSession, liveTab, historicalData]);

  /**
   * Display data: for 'normal' state use the live favicon so it stays fresh
   * (e.g. after a favicon change). Title/url always come from historical data
   * so the label is stable. For all other states use historical only.
   */
  const displayData = useMemo(() => {
    const base = historicalData ?? {
      title: liveTab?.title,
      url: liveTab?.url,
      faviconUrl: liveTab?.faviconUrls?.[0],
    };
    if (tabState === 'normal' && liveTab?.faviconUrls?.[0]) {
      return { ...base, faviconUrl: liveTab.faviconUrls[0] };
    }
    return base;
  }, [historicalData, liveTab, tabState]);

  const displayLabel = useMemo(() => {
    const title = displayData.title;
    if (!title) return tabId ?? '?';
    if (title.length > 24) return `${title.slice(0, 24)}…`;
    return title;
  }, [displayData.title, tabId]);

  const isWarning = tabState !== 'normal';

  const tooltipContent = useMemo(() => {
    const url = displayData.url ?? tabId ?? '';

    const statusLine = (() => {
      switch (tabState) {
        case 'navigated':
          return 'Tab is on a different URL now.';
        case 'closed':
          return 'Tab is closed.';
        case 'restarted':
          return 'Browser was restarted.';
        default:
          return null;
      }
    })();

    if (!statusLine) return url;

    return (
      <span>
        {url && <span className="block font-medium">{url}</span>}
        <span className="block text-muted-foreground">{statusLine}</span>
      </span>
    );
  }, [tabState, displayData.url, tabId]);

  const originalUrl = displayData.url;

  const handleClick = useCallback(() => {
    switch (tabState) {
      case 'normal':
      case 'navigated':
        if (tabId) void switchTab(tabId);
        break;
      case 'closed':
      case 'restarted':
        if (originalUrl) void createTab(originalUrl);
        break;
    }
  }, [tabState, tabId, originalUrl, switchTab, createTab]);

  const handleOpenOriginalInNewTab = useCallback(() => {
    if (originalUrl) void createTab(originalUrl);
  }, [originalUrl, createTab]);

  const badge = (
    <InlineBadgeWrapper viewOnly={viewOnly} tooltipContent={tooltipContent}>
      <InlineBadge
        icon={
          <TabFaviconMini
            url={displayData.faviconUrl}
            title={displayData.title}
          />
        }
        label={displayLabel}
        selected={selected}
        isEditable={isEditable}
        onDelete={() => onDelete?.()}
        className={cn('cursor-pointer', isWarning && 'opacity-50')}
        onClick={handleClick}
      />
    </InlineBadgeWrapper>
  );

  // 'navigated': right-click offers opening the original URL in a new tab
  if (tabState === 'navigated' && !isEditable) {
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger render={<span />} className="contents">
          {badge}
        </ContextMenu.Trigger>
        <MenuBase.Portal>
          <MenuBase.Positioner
            className="z-50"
            sideOffset={4}
            align="start"
            side="bottom"
          >
            <MenuBase.Popup
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'flex origin-(--transform-origin) flex-col items-stretch gap-0.5',
                'rounded-lg border border-border-subtle bg-background p-1',
                'text-xs shadow-lg',
                'transition-[transform,scale,opacity] duration-150 ease-out',
                'data-ending-style:scale-90 data-starting-style:scale-90',
                'data-ending-style:opacity-0 data-starting-style:opacity-0',
              )}
            >
              <MenuBase.Item
                className={menuItemClassName}
                onClick={handleOpenOriginalInNewTab}
              >
                <ExternalLinkIcon className="size-3.5 shrink-0" />
                <span>Open original URL in new tab</span>
              </MenuBase.Item>
            </MenuBase.Popup>
          </MenuBase.Positioner>
        </MenuBase.Portal>
      </ContextMenu.Root>
    );
  }

  return badge;
}
