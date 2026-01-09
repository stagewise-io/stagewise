import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconCommand } from 'nucleo-micro-bold';
import type { TabState } from '@shared/karton-contracts/ui';
import { PageTransition } from '@shared/karton-contracts/pages-api/types';
import { useEventListener } from '@/hooks/use-event-listener';
import { InternalPageBreadcrumbs } from './internal-page-breadcrumbs';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import type { SearchEngine } from '@shared/karton-contracts/ui/shared-types';

export interface OmniboxRef {
  focus: () => void;
}

interface OmniboxProps {
  tabId: string;
  tab: TabState | undefined;
}

function goToUrl(
  goto: (url: string, tabId?: string, transition?: PageTransition) => void,
  url: string,
  tabId?: string,
  transition?: PageTransition,
  getSearchUrl?: (searchTerm: string) => string,
) {
  const trimmed = url.trim();
  // Check if it starts with stagewise:/ - always treat as URL, never search
  if (trimmed.toLowerCase().startsWith('stagewise:/')) {
    return goto(trimmed, tabId, transition);
  }
  // Check if it's already a valid URL with protocol
  try {
    new URL(trimmed);
    return goto(trimmed, tabId, transition);
  } catch {}
  // Check if it looks like a domain (no spaces, has a dot)
  if (!trimmed.includes(' ') && trimmed.includes('.'))
    return goto(`https://${trimmed}`, tabId, transition);
  // Treat as search query - use dynamic search URL
  const searchUrl = getSearchUrl
    ? getSearchUrl(trimmed)
    : `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  goto(searchUrl, tabId, transition);
}

/**
 * Build a search URL from a search engine and search term.
 */
function buildSearchUrl(
  searchEngines: SearchEngine[],
  defaultEngineId: number,
  searchTerm: string,
): string {
  const defaultEngine = searchEngines.find((e) => e.id === defaultEngineId);

  if (defaultEngine) {
    // Replace {searchTerms} placeholder with encoded search term
    return defaultEngine.url.replace(
      '{searchTerms}',
      encodeURIComponent(searchTerm),
    );
  }

  // Fallback to Google if no default engine found
  return `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;
}

export const Omnibox = forwardRef<OmniboxRef, OmniboxProps>(
  ({ tabId, tab }, ref) => {
    const goto = useKartonProcedure((p) => p.browser.goto);
    const preferences = useKartonState((s) => s.preferences);
    const searchEngines = useKartonState((s) => s.searchEngines);

    const [localUrl, setLocalUrl] = useState(tab?.url ?? '');
    const [urlBeforeEdit, setUrlBeforeEdit] = useState(tab?.url ?? '');
    const [isUrlInputFocused, setIsUrlInputFocused] = useState(false);
    const urlInputRef = useRef<HTMLInputElement>(null);

    // Create a memoized search URL builder
    const getSearchUrl = useCallback(
      (searchTerm: string) =>
        buildSearchUrl(
          searchEngines,
          preferences.search.defaultEngineId,
          searchTerm,
        ),
      [searchEngines, preferences.search.defaultEngineId],
    );

    // Expose focus method via ref
    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          setIsUrlInputFocused(true);
          setTimeout(() => {
            urlInputRef.current?.focus();
            urlInputRef.current?.select();
          }, 0);
        },
      }),
      [],
    );

    // Update local URL when tab URL changes
    useEffect(() => {
      // Show empty URL bar for the home page
      if (tab?.url === 'stagewise://internal/home') {
        setLocalUrl('');
        setUrlBeforeEdit('');
      } else {
        setLocalUrl(tab?.url ?? '');
        setUrlBeforeEdit(tab?.url ?? '');
      }
      // Reset focus state when tab URL changes
      setIsUrlInputFocused(false);
    }, [tab?.url]);

    // Check if URL is a stagewise://internal/ URL (but not the home page)
    const showBreadcrumbs = useMemo(() => {
      const url = tab?.url ?? '';
      // Show breadcrumbs for internal pages except the home page
      return (
        url.startsWith('stagewise://internal/') &&
        url !== 'stagewise://internal/home'
      );
    }, [tab?.url]);

    const handleBreadcrumbClick = useCallback(() => {
      // Set focus state first to render the input
      setIsUrlInputFocused(true);
      // Use setTimeout to ensure the input is rendered before focusing
      setTimeout(() => {
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      }, 0);
    }, []);

    const handleInputFocus = useCallback(() => {
      setUrlBeforeEdit(tab?.url ?? '');
      setIsUrlInputFocused(true);
    }, [tab?.url]);

    const handleInputBlur = useCallback(() => {
      setIsUrlInputFocused(false);
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          // When user types in omnibox and presses Enter, mark as TYPED transition
          goToUrl(goto, localUrl, tabId, PageTransition.TYPED, getSearchUrl);
          setUrlBeforeEdit(localUrl);
          urlInputRef.current?.blur();
        }
      },
      [goto, localUrl, tabId, getSearchUrl],
    );

    // Handle Escape key to cancel editing
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
      <div className="relative flex flex-1 items-center rounded-full bg-zinc-500/5 pr-5 pl-3 focus-within:bg-zinc-500/10">
        {!isUrlInputFocused && showBreadcrumbs && tab?.url ? (
          <InternalPageBreadcrumbs
            url={tab.url}
            onFocusInput={handleBreadcrumbClick}
          />
        ) : (
          <input
            ref={urlInputRef}
            placeholder="Search or type a URL"
            type="text"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            className="h-8 w-full truncate rounded-full px-2 text-foreground text-sm outline-none"
            onKeyDown={handleKeyDown}
          />
        )}
        <div className="pointer-events-none flex shrink-0 flex-row items-center gap-1 opacity-40">
          <IconCommand className="size-3 text-muted-foreground" />
          <span className="font-mono text-muted-foreground text-xs">L</span>
        </div>
      </div>
    );
  },
);

Omnibox.displayName = 'Omnibox';
