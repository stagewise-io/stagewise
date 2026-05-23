import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useKartonState } from '@ui/hooks/use-karton';
import type { TabState } from '@shared/karton-contracts/ui';
import { NavButtons } from './nav-buttons';
import { Omnibox, type OmniboxRef } from './omnibox';
import { ZoomBar } from './control-buttons/zoom-bar';
import { SearchBar, type SearchBarRef } from './control-buttons/search-bar';
import { ResourceRequestsControlButton } from './control-buttons/resource-requests';
import { DOMContextSelector } from '@ui/components/dom-context-selector/selector-canvas';
import { WebContentsOverlay } from '@ui/components/web-contents-overlay';
import { WebContentsOverlayProvider } from '@ui/contexts';
import { BasicAuthDialog } from './basic-auth-dialog';
import { ColorSchemeWidget } from './control-buttons/color-scheme';
import { ChromeDevToolsWidget } from './control-buttons/chrome-devtools';
import { TabErrorBoundary } from './tab-error-boundary';
import { PerTerminalContent } from '../../terminal-panel/_components/per-terminal-content';

export interface PerTabContentRef {
  focusOmnibox: () => void;
  focusSearchBar: () => void;
}

interface PerTabContentProps {
  tabId: string;
}

export const PerTabContent = forwardRef<PerTabContentRef, PerTabContentProps>(
  ({ tabId }, ref) => {
    const tab = useKartonState((s) => s.contentTabs.tabs[tabId]) as
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
      <TabErrorBoundary tabId={tabId}>
        {tab?.type === 'terminal' ? (
          <div className="absolute inset-0 z-10 flex flex-col">
            <PerTerminalContent terminalId={tabId} isActive />
          </div>
        ) : (
          <div className="absolute inset-0 z-10 flex flex-col">
            {/* Control Bar */}
            <div className="flex w-full shrink-0 items-stretch divide-x divide-surface-2 border-derived border-b bg-background px-1 py-0 [&_button:focus-visible]:outline-offset-[-4px]">
              <NavButtons tabId={tabId} tab={tab} />
              <Omnibox ref={omniboxRef} tabId={tabId} tab={tab} isActive />
              <ZoomBar tabId={tabId} />
              <SearchBar tabId={tabId} ref={searchBarRef} />
              {(tab?.permissionRequests?.length ?? 0) > 0 && (
                <ResourceRequestsControlButton tabId={tabId} isActive />
              )}
              <div className="flex flex-row items-center gap-0.5">
                {tab && <ColorSchemeWidget tab={tab} />}
                {tab && <ChromeDevToolsWidget tab={tab} />}
              </div>
            </div>
            {/* Content area - wrapped with WebContentsOverlayProvider for overlay access */}
            <WebContentsOverlayProvider>
              <div className="flex size-full flex-col items-center justify-center overflow-hidden">
                <div
                  ref={devAppPreviewContainerRef}
                  id={`dev-app-preview-container-${tabId}`}
                  className="relative flex size-full flex-col items-center justify-center overflow-hidden rounded-lg"
                >
                  {/* Unified web contents overlay for devtools and DOM selection */}
                  {!isInternalPage && <WebContentsOverlay />}
                  {/* DOM context selector - uses the unified overlay via hook */}
                  {!isInternalPage && <DOMContextSelector />}
                  {tab?.authenticationRequest && (
                    <BasicAuthDialog
                      request={tab.authenticationRequest}
                      container={devAppPreviewContainerRef}
                    />
                  )}
                </div>
              </div>
            </WebContentsOverlayProvider>
          </div>
        )}
      </TabErrorBoundary>
    );
  },
);

PerTabContent.displayName = 'PerTabContent';
