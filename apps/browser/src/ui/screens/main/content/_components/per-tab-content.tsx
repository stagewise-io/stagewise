import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import type { ColorScheme, TabState } from '@shared/karton-contracts/ui';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { IconSquareCodeFillDuo18 } from 'nucleo-ui-fill-duo-18';
import {
  IconMoonFill18,
  IconBrightnessIncreaseFill18,
  IconGear2Fill18,
} from 'nucleo-ui-fill-18';
import { NavButtons } from './nav-buttons';
import { SETTINGS_PAGE_URL } from '@shared/internal-urls';
import { Omnibox, type OmniboxRef } from './omnibox';
import { ZoomBar } from './control-buttons/zoom-bar';
import { SearchBar } from './control-buttons/search-bar';
import { ResourceRequestsControlButton } from './control-buttons/resource-requests';
import { DownloadsControlButton } from './control-buttons/downloads';
import { DOMContextSelector } from '@/components/dom-context-selector/selector-canvas';
import { BasicAuthDialog } from './basic-auth-dialog';

const ColorSchemeIcon = ({
  colorScheme,
  className,
}: {
  colorScheme: ColorScheme;
  className?: string;
}) => {
  switch (colorScheme) {
    case 'light':
      return (
        <IconBrightnessIncreaseFill18
          className={cn(
            'size-4.5 text-primary-foreground hover:text-derived-lighter-subtle',
            className,
          )}
        />
      );
    case 'dark':
      return (
        <IconMoonFill18
          className={cn(
            'mb-px ml-px size-4 text-primary-foreground hover:text-derived-lighter-subtle',
            className,
          )}
        />
      );
    case 'system':
      return <IconMoonFill18 className={cn('mb-px ml-px size-4', className)} />;
  }
};

export interface PerTabContentRef {
  focusOmnibox: () => void;
  focusSearchBar: () => void;
}

interface PerTabContentProps {
  tabId: string;
  isActive: boolean;
}

export const PerTabContent = forwardRef<PerTabContentRef, PerTabContentProps>(
  ({ tabId, isActive }, ref) => {
    const tab = useKartonState((s) => s.browser.tabs[tabId]) as
      | TabState
      | undefined;

    const cycleColorScheme = useKartonProcedure(
      (p) => p.browser.cycleColorScheme,
    );
    const toggleDevTools = useKartonProcedure((p) => p.browser.toggleDevTools);
    const activateSearchBar = useKartonProcedure(
      (p) => p.browser.searchBar.activate,
    );
    const createTab = useKartonProcedure((p) => p.browser.createTab);

    const omniboxRef = useRef<OmniboxRef>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const devAppPreviewContainerRef = useRef<HTMLDivElement>(null);

    const isInternalPage = useMemo(() => {
      // Consider a page "internal" if it's a stagewise:// URL or if an error page is displayed
      // (Error pages show the failed URL but are still internal pages)
      const isInternalUrl =
        tab?.url?.startsWith('stagewise://internal/') ?? false;
      const isErrorPageDisplayed = tab?.error?.isErrorPageDisplayed ?? false;
      return isInternalUrl || isErrorPageDisplayed;
    }, [tab?.url, tab?.error?.isErrorPageDisplayed]);

    const colorScheme = tab?.colorScheme ?? 'system';

    // Expose methods via ref for parent to call
    useImperativeHandle(
      ref,
      () => ({
        focusOmnibox: () => {
          omniboxRef.current?.focus();
        },
        focusSearchBar: () => {
          activateSearchBar();
          setTimeout(() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
          }, 50);
        },
      }),
      [activateSearchBar],
    );

    return (
      <div
        className={cn(
          'absolute inset-0 flex flex-col',
          isActive ? 'z-10' : 'hidden',
        )}
      >
        {/* Control Bar */}
        <div className={cn('flex w-full shrink-0 items-center gap-2 p-2 pb-0')}>
          <NavButtons tabId={tabId} tab={tab} />
          <Omnibox ref={omniboxRef} tabId={tabId} tab={tab} />
          <ZoomBar tabId={tabId} />
          <SearchBar tabId={tabId} ref={searchInputRef} />
          <ResourceRequestsControlButton tabId={tabId} />
          <DownloadsControlButton />
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isInternalPage}
                onClick={() => {
                  cycleColorScheme(tabId);
                }}
              >
                <ColorSchemeIcon
                  colorScheme={colorScheme}
                  className={cn(isInternalPage ? 'opacity-50' : '')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div>
                Toggle color scheme
                <br />
                <span className="text-muted-foreground/70">
                  Current: {colorScheme}
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isInternalPage}
                onClick={() => {
                  toggleDevTools(tabId);
                }}
              >
                <IconSquareCodeFillDuo18
                  className={cn(
                    'size-5',
                    tab?.devToolsOpen
                      ? 'text-primary-foreground hover:text-derived-lighter-subtle'
                      : '',
                    isInternalPage ? 'opacity-50' : '',
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open developer tools</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  createTab(SETTINGS_PAGE_URL, true);
                }}
              >
                <IconGear2Fill18 className="size-4.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Settings</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex size-full flex-col gap-4 rounded-lg p-2">
          <div className="flex size-full flex-col items-center justify-center overflow-hidden rounded-sm shadow-[0_0_6px_0_rgba(0,0,0,0.08),0_-6px_48px_-24px_rgba(0,0,0,0.15)] ring-1 ring-border-subtle">
            <div
              ref={devAppPreviewContainerRef}
              id={`dev-app-preview-container-${tabId}`}
              className="relative flex size-full flex-col items-center justify-center overflow-hidden rounded-lg"
            >
              {isActive && !isInternalPage && <DOMContextSelector />}
              {isActive && tab?.authenticationRequest && (
                <BasicAuthDialog
                  request={tab.authenticationRequest}
                  container={devAppPreviewContainerRef}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);

PerTabContent.displayName = 'PerTabContent';
