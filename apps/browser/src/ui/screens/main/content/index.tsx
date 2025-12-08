import { ResizablePanel } from '@stagewise/stage-ui/components/resizable';
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@stagewise/stage-ui/lib/utils';
import {
  IconPlus,
  IconArrowLeft,
  IconArrowRight,
  IconArrowRotateAnticlockwise,
  IconCommand,
} from 'nucleo-micro-bold';
import { ActiveTab } from './_components/active-tab';
import { Button } from '@stagewise/stage-ui/components/button';
import type { TabState } from '@shared/karton-contracts/ui';
import { InactiveTab } from './_components/inactive-tab';
import { useEventListener } from '@/hooks/use-event-listener';
import { BackgroundWithCutout } from './_components/background-with-cutout';
import { IconSquareCodeFill18 } from 'nucleo-ui-fill-18';
import {
  TooltipContent,
  TooltipTrigger,
  Tooltip,
} from '@stagewise/stage-ui/components/tooltip';

export function MainSection() {
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const goBack = useKartonProcedure((p) => p.browser.goBack);
  const goForward = useKartonProcedure((p) => p.browser.goForward);
  const reload = useKartonProcedure((p) => p.browser.reload);
  const goto = useKartonProcedure((p) => p.browser.goto);
  const gotoUrl = useCallback(
    (url: string, tabId?: string) => {
      const trimmed = url.trim();
      // Check if it's already a valid URL with protocol
      try {
        new URL(trimmed);
        return goto(trimmed, tabId);
      } catch {}
      // Check if it looks like a domain (no spaces, has a dot)
      if (!trimmed.includes(' ') && trimmed.includes('.'))
        return goto(`https://${trimmed}`, tabId);
      // Treat as search query
      goto(
        `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`,
        tabId,
      );
    },
    [goto],
  );
  const toggleDevTools = useKartonProcedure((p) => p.browser.toggleDevTools);
  const [localUrl, setLocalUrl] = useState(tabs[activeTabId]?.url ?? '');
  const [urlBeforeEdit, setUrlBeforeEdit] = useState(
    tabs[activeTabId]?.url ?? '',
  );
  const urlInputRef = useRef<HTMLInputElement>(null);

  const activeTab = useMemo(() => {
    return tabs[activeTabId] as TabState | undefined;
  }, [activeTabId, tabs]);

  const activeTabIndex = useMemo(() => {
    return Object.keys(tabs).findIndex((_id) => _id === activeTabId) ?? 0;
  }, [activeTabId, tabs]);

  useEffect(() => {
    setLocalUrl(activeTab?.url);
    setUrlBeforeEdit(activeTab?.url ?? '');
  }, [activeTab?.url]);

  // Command + L to focus URL bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // TODO: Add global key handlers management
  // Escape key handler for URL input - intercepts in capture phase before global handlers
  const handleEscapeKey = useCallback(
    (e: KeyboardEvent) => {
      // Check if URL input is focused and it's an Escape key
      if (
        document.activeElement === urlInputRef.current &&
        e.code === 'Escape'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setLocalUrl(urlBeforeEdit);
        urlInputRef.current?.blur();
      }
    },
    [urlBeforeEdit],
  );

  useEventListener('keydown', handleEscapeKey, { capture: true });

  // Get position of dev-app-preview-container

  return (
    <ResizablePanel
      id="opened-content-panel"
      order={2}
      defaultSize={70}
      className="@container overflow-visible! flex h-full flex-1 flex-col items-start justify-between"
    >
      <div className="flex h-full w-full flex-col">
        <TabsContainer
          activeTabId={activeTabId}
          tabs={tabs}
          setActiveTabId={switchTab}
          onAddTab={async () => {
            await createTab();
            // Focus URL bar
            setLocalUrl('');
            urlInputRef.current?.focus();
          }}
          onCloseTab={(tabId) => {
            closeTab(tabId);
          }}
        />
        {/* URL, Controls, etc. area */}
        <div
          className={cn(
            `flex size-full flex-col overflow-hidden rounded-b-lg rounded-tr-lg ${activeTabIndex !== 0 ? 'rounded-tl-lg' : ''} relative `,
          )}
        >
          {/* Background with mask for the web-content */}
          <BackgroundWithCutout className={cn(`z-0`)} borderRadius={8} />
          <div className="flex w-full items-center gap-2 p-2 pb-0">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!activeTab?.navigationHistory.canGoBack}
              onClick={() => {
                goBack(activeTabId);
              }}
            >
              <IconArrowLeft
                className={`size-4 ${activeTab?.navigationHistory.canGoBack ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!activeTab?.navigationHistory.canGoForward}
              onClick={() => {
                goForward(activeTabId);
              }}
            >
              <IconArrowRight
                className={`size-4 ${activeTab?.navigationHistory.canGoForward ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                reload(activeTabId);
              }}
            >
              <IconArrowRotateAnticlockwise className="size-4 text-muted-foreground" />
            </Button>
            {/* URL bar */}
            <div className="relative flex flex-1 items-center rounded-full bg-zinc-500/5 pr-5 pl-3 focus-within:bg-zinc-500/10">
              <input
                ref={urlInputRef}
                type="text"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                onFocus={() => setUrlBeforeEdit(tabs[activeTabId]?.url ?? '')}
                className="h-[30px] w-full truncate rounded-full px-2 text-foreground text-sm outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    gotoUrl(localUrl, activeTabId);
                    setUrlBeforeEdit(localUrl);
                    urlInputRef.current?.blur();
                  }
                }}
              />
              <div className="pointer-events-none flex shrink-0 flex-row items-center gap-1 opacity-40">
                <IconCommand className="size-3 text-muted-foreground" />
                <span className="font-mono text-muted-foreground text-xs">
                  L
                </span>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    toggleDevTools(activeTabId);
                  }}
                >
                  <IconSquareCodeFill18 className="size-5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open developer tools</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex size-full flex-col gap-4 rounded-lg p-2">
            <div
              id="dev-app-preview-container"
              className={cn(
                'flex size-full flex-col items-center justify-center overflow-hidden rounded-lg shadow-[0_0_3px_rgba(0,0,0,0.1),0_-6px_48px_-24px_rgba(0,0,0,0.05)]',
              )}
            />
          </div>
        </div>
      </div>
    </ResizablePanel>
  );
}

export function TabsContainer({
  activeTabId,
  tabs,
  setActiveTabId,
  onAddTab,
  onCloseTab,
}: {
  activeTabId: string;
  tabs: Record<string, TabState>;
  setActiveTabId: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
}) {
  const getIsLeftNextToActiveTab = (tabId: string) => {
    return (
      Object.keys(tabs).findIndex((_id) => _id === tabId) ===
      Object.keys(tabs).findIndex((tabId) => tabId === activeTabId) - 1
    );
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') onAddTab();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="flex shrink-0 flex-row items-start gap-0.75">
      {Object.values(tabs).map((tab, index) => {
        const isLeftNextToActiveTab = getIsLeftNextToActiveTab(tab.id);
        if (tab.id === activeTabId)
          return (
            <ActiveTab
              key={tab.id}
              tabState={tab}
              onClose={() => {
                onCloseTab(tab.id);
              }}
              activateBottomLeftCornerRadius={index !== 0}
            />
          );
        return (
          <InactiveTab
            key={tab.id}
            {...tab}
            onClick={() => {
              setActiveTabId(tab.id);
            }}
            onClose={() => {
              onCloseTab(tab.id);
            }}
            showRightSeparator={!isLeftNextToActiveTab}
          />
        );
      })}
      <Button
        variant="ghost"
        size="xs"
        className="h-7 shrink-0 self-start rounded-[5px] hover:bg-zinc-50/70!"
        onClick={onAddTab}
      >
        <IconPlus className="size-3 text-muted-foreground" />
        <div className="pointer-events-none flex flex-row items-center gap-1 opacity-40">
          <IconCommand className="size-3 text-muted-foreground" />
          <span className="font-mono text-muted-foreground text-xs">T</span>
        </div>
      </Button>
      <div className="app-drag h-full min-w-16! grow" />
    </div>
  );
}
