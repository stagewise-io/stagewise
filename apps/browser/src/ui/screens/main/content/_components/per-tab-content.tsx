import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { useKartonState } from '@ui/hooks/use-karton';
import type { TabState } from '@shared/karton-contracts/ui';
import { NavButtons } from './nav-buttons';
import { Omnibox, type OmniboxRef } from './omnibox';
import { ZoomBar } from './control-buttons/zoom-bar';
import { SearchBar, type SearchBarRef } from './control-buttons/search-bar';
import { ResourceRequestsControlButton } from './control-buttons/resource-requests';
import { DownloadsControlButton } from './control-buttons/downloads';
import { DOMContextSelector } from '@ui/components/dom-context-selector/selector-canvas';
import { WebContentsOverlay } from '@ui/components/web-contents-overlay';
import { WebContentsOverlayProvider } from '@ui/contexts';
import { BasicAuthDialog } from './basic-auth-dialog';
import { ColorSchemeWidget } from './control-buttons/color-scheme';
import { ChromeDevToolsWidget } from './control-buttons/chrome-devtools';

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
    const omniboxRef = useRef<OmniboxRef>(null);
    const searchBarRef = useRef<SearchBarRef>(null);

    const devAppPreviewContainerRef = useRef<HTMLDivElement>(null);

    const isInternalPage = useMemo(() => {
      // Consider a page "internal" if it's a stagewise:// URL or if an error page is displayed
      // (Error pages show the failed URL but are still internal pages)
      const isInternalUrl =
        tab?.url?.startsWith('stagewise://internal/') ?? false;
      const isErrorPageDisplayed = tab?.error?.isErrorPageDisplayed ?? false;
      return isInternalUrl || isErrorPageDisplayed;
    }, [tab?.url, tab?.error?.isErrorPageDisplayed]);

    // Expose methods via ref for parent to call
    useImperativeHandle(
      ref,
      () => ({
        focusOmnibox: () => {
          omniboxRef.current?.focus();
        },
        focusSearchBar: () => {
          searchBarRef.current?.focus();
        },
      }),
      [],
    );

    return (
      <div
        className={cn(
          'absolute inset-0 flex flex-col',
          isActive ? 'z-10' : 'hidden',
        )}
      >
        {/* Control Bar */}
        <div
          className={cn(
            'flex w-full shrink-0 items-stretch divide-x divide-surface-2 border-derived-subtle border-t bg-background px-1 py-0',
          )}
        >
          <NavButtons tabId={tabId} tab={tab} />
          <Omnibox
            ref={omniboxRef}
            tabId={tabId}
            tab={tab}
            isActive={isActive}
          />
          <ZoomBar tabId={tabId} />
          <SearchBar tabId={tabId} ref={searchBarRef} />
          <div className="flex flex-row items-center gap-0.5">
            <ResourceRequestsControlButton tabId={tabId} isActive={isActive} />
            <DownloadsControlButton isActive={isActive} />

            {tab && <ColorSchemeWidget tab={tab} />}

            {tab && <ChromeDevToolsWidget tab={tab} />}
          </div>
        </div>
        {/* Content area - wrapped with WebContentsOverlayProvider for overlay access */}
        <WebContentsOverlayProvider>
          <div className="flex size-full flex-col items-center justify-center overflow-hidden ring-1 ring-derived-subtle">
            <div
              ref={devAppPreviewContainerRef}
              id={`dev-app-preview-container-${tabId}`}
              className="relative flex size-full flex-col items-center justify-center overflow-hidden rounded-lg"
            >
              {/* Unified web contents overlay for devtools and DOM selection */}
              {isActive && !isInternalPage && <WebContentsOverlay />}
              {/* DOM context selector - uses the unified overlay via hook */}
              {isActive && !isInternalPage && <DOMContextSelector />}
              {isActive && tab?.authenticationRequest && (
                <BasicAuthDialog
                  request={tab.authenticationRequest}
                  container={devAppPreviewContainerRef}
                />
              )}
            </div>
          </div>
        </WebContentsOverlayProvider>
      </div>
    );
  },
);

PerTabContent.displayName = 'PerTabContent';
