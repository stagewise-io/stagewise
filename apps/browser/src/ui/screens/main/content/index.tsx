import { ResizablePanel } from '@stagewise/stage-ui/components/resizable';
import { useTabUIState } from '@/hooks/use-tab-ui-state';
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { TabsContainer } from './_components/tabs-container';
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowRotateAnticlockwise,
  IconCommand,
} from 'nucleo-micro-bold';
import { Button } from '@stagewise/stage-ui/components/button';
import type { ColorScheme, TabState } from '@shared/karton-contracts/ui';
import { useEventListener } from '@/hooks/use-event-listener';
import { BackgroundWithCutout } from './_components/background-with-cutout';
import {
  TooltipContent,
  TooltipTrigger,
  Tooltip,
} from '@stagewise/stage-ui/components/tooltip';
import { StartPage } from './_components/start-page';
import { DOMContextSelector } from '@/components/dom-context-selector/selector-canvas';
import { CoreHotkeyBindings } from './_components/core-hotkey-bindings';
import {
  IconNightShiftFillDuo18,
  IconSquareCodeFillDuo18,
} from 'nucleo-ui-fill-duo-18';
import {
  IconMoonFill18,
  IconBrightnessIncreaseFill18,
} from 'nucleo-ui-fill-18';
import { SearchBar } from './_components/search-bar';
import { ZoomBar } from './_components/zoom-bar';

const COLOR_SCHEME_ICON_MAP: Record<ColorScheme, React.ReactNode> = {
  light: <IconBrightnessIncreaseFill18 className="size-4.5 text-primary" />,
  dark: <IconMoonFill18 className="mb-px ml-px size-4 text-primary" />,
  system: <IconNightShiftFillDuo18 className="size-4.5 text-foreground" />,
};

export function MainSection({
  isSidebarCollapsed,
  openSidebarChatPanel,
}: {
  isSidebarCollapsed: boolean;
  openSidebarChatPanel: () => void;
}) {
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const createTab = useKartonProcedure((p) => p.browser.createTab);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const goBack = useKartonProcedure((p) => p.browser.goBack);
  const goForward = useKartonProcedure((p) => p.browser.goForward);
  const reload = useKartonProcedure((p) => p.browser.reload);
  const goto = useKartonProcedure((p) => p.browser.goto);
  const toggleDevTools = useKartonProcedure((p) => p.browser.toggleDevTools);
  const [localUrl, setLocalUrl] = useState(tabs[activeTabId]?.url ?? '');
  const [urlBeforeEdit, setUrlBeforeEdit] = useState(
    tabs[activeTabId]?.url ?? '',
  );

  const cycleColorScheme = useKartonProcedure(
    (p) => p.browser.cycleColorScheme,
  );
  const colorScheme = useKartonState(
    (s) => s.browser.tabs[activeTabId]?.colorScheme,
  );

  const urlInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activateSearchBar = useKartonProcedure(
    (p) => p.browser.searchBar.activate,
  );

  const { setTabUiState } = useTabUIState();

  const handleCreateTab = useCallback(() => {
    createTab();
    // Focus URL bar
    setLocalUrl('');
    urlInputRef.current?.focus();
  }, [createTab]);

  const handleCleanAllTabs = useCallback(() => {
    Object.values(tabs).forEach((tab) => {
      if (tab.id !== activeTabId) {
        closeTab(tab.id);
      }
    });
  }, [tabs, activeTabId]);

  const handleFocusSearchBar = useCallback(() => {
    activateSearchBar();
    // Use setTimeout to ensure the SearchBar has rendered before focusing
    setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 50);
  }, [activateSearchBar]);

  const activeTab = useMemo(() => {
    return tabs[activeTabId] as TabState | undefined;
  }, [activeTabId, tabs]);

  const activeTabIndex = useMemo(() => {
    return Object.keys(tabs).findIndex((_id) => _id === activeTabId) ?? 0;
  }, [activeTabId, tabs]);

  const handleTabFocused = useCallback(
    (event: CustomEvent<string>) => {
      setTabUiState(event.detail, {
        focusedPanel: 'tab-content',
      });
    },
    [setTabUiState],
  );

  const handleUIFocused = useCallback(
    (_e: FocusEvent) => {
      setTabUiState(activeTabId, {
        focusedPanel: 'stagewise-ui',
      });
    },
    [activeTabId, setTabUiState],
  );

  useEventListener('focus', handleUIFocused, undefined, window);

  useEventListener(
    'stagewise-tab-focused',
    handleTabFocused,
    undefined,
    window,
  );

  const showTopLeftCornerRadius = useMemo(() => {
    return activeTabIndex !== 0 || isSidebarCollapsed;
  }, [activeTabIndex, isSidebarCollapsed]);

  useEffect(() => {
    if (activeTab?.url === 'ui-main') {
      setLocalUrl('');
      setUrlBeforeEdit('');
    } else {
      setLocalUrl(activeTab?.url ?? '');
      setUrlBeforeEdit(activeTab?.url ?? '');
    }
  }, [activeTab?.url]);

  useEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        setLocalUrl(urlBeforeEdit);
        urlInputRef.current?.blur();
      }
    },
    { capture: true },
    urlInputRef.current,
  );

  return (
    <ResizablePanel
      id="opened-content-panel"
      order={2}
      defaultSize={70}
      className="@container overflow-visible! flex h-full flex-1 flex-col items-start justify-between"
    >
      <CoreHotkeyBindings
        onCreateTab={handleCreateTab}
        onFocusUrlBar={() => {
          urlInputRef.current?.focus();
          urlInputRef.current?.select();
        }}
        onFocusSearchBar={handleFocusSearchBar}
        onCleanAllTabs={handleCleanAllTabs}
      />
      <div className="flex h-full w-full flex-col">
        <TabsContainer
          openSidebarChatPanel={openSidebarChatPanel}
          isSidebarCollapsed={isSidebarCollapsed}
          onAddTab={handleCreateTab}
          onCleanAllTabs={handleCleanAllTabs}
        />
        {/* URL, Controls, etc. area */}
        <div
          className={cn(
            `flex size-full flex-col overflow-hidden rounded-b-lg rounded-tr-lg ${showTopLeftCornerRadius ? 'rounded-tl-lg' : ''} relative`,
          )}
        >
          {/* Background with mask for the web-content */}
          <BackgroundWithCutout className={cn(`z-0`)} borderRadius={4} />
          <div className="flex w-full shrink-0 items-center gap-2 p-2 pb-0">
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
                placeholder="Search or type a URL"
                type="text"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                onFocus={() => setUrlBeforeEdit(tabs[activeTabId]?.url ?? '')}
                className="h-[30px] w-full truncate rounded-full px-2 text-foreground text-sm outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    goToUrl(goto, localUrl, activeTabId);
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
            <ZoomBar />
            <SearchBar ref={searchInputRef} />
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    cycleColorScheme(activeTabId);
                  }}
                >
                  {COLOR_SCHEME_ICON_MAP[colorScheme]}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Toggle color scheme</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    toggleDevTools(activeTabId);
                  }}
                >
                  <IconSquareCodeFillDuo18
                    className={cn(
                      'size-5',
                      activeTab?.devToolsOpen
                        ? 'text-primary'
                        : 'text-muted-foreground',
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Open developer tools
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex size-full flex-col gap-4 rounded-lg p-2">
            <div className="flex size-full flex-col items-center justify-center overflow-hidden rounded-sm shadow-[0_0_6px_0_rgba(0,0,0,0.08),0_-6px_48px_-24px_rgba(0,0,0,0.15)] ring-1 ring-foreground/10">
              {activeTab?.url === 'ui-main' ? (
                <StartPage />
              ) : activeTab?.error ? (
                <div>Error: {activeTab?.error?.message}</div>
              ) : (
                <div
                  id="dev-app-preview-container"
                  className="flex size-full flex-col items-center justify-center overflow-hidden rounded-lg"
                >
                  <DOMContextSelector />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ResizablePanel>
  );
}

function goToUrl(
  goto: (url: string, tabId?: string) => void,
  url: string,
  tabId?: string,
) {
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
  goto(`https://www.google.com/search?q=${encodeURIComponent(trimmed)}`, tabId);
}
