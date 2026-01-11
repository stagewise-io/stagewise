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
import { isHomePage } from '@shared/internal-urls';

/** Fallback search URL when no search engine is configured */
const FALLBACK_SEARCH_URL = 'https://www.google.com/search?q={searchTerms}';

export interface OmniboxRef {
  focus: () => void;
}

interface OmniboxProps {
  tabId: string;
  tab: TabState | undefined;
}

/**
 * Determines if the input is a URL or search query, and returns the appropriate URL.
 *
 * @param input - User input from the omnibox
 * @param searchEngines - Available search engines
 * @param defaultEngineId - ID of the default search engine
 * @param searchEngineId - Optional: specific search engine ID to use
 * @param searchEngineKeyword - Optional: search engine keyword to use (takes precedence)
 */
function resolveOmniboxInput(
  input: string,
  searchEngines: SearchEngine[],
  defaultEngineId: number,
  searchEngineId?: number,
  searchEngineKeyword?: string,
): string {
  const trimmed = input.trim();

  // Check if it starts with stagewise:/ - always treat as URL
  if (trimmed.toLowerCase().startsWith('stagewise:/')) {
    return trimmed;
  }

  // Check if it's already a valid URL with protocol
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    // Not a valid URL, continue checking
  }

  // Check if it looks like a domain (no spaces, has a dot)
  if (!trimmed.includes(' ') && trimmed.includes('.')) {
    return `https://${trimmed}`;
  }

  // Treat as search query - find the right search engine
  let engine: SearchEngine | undefined;

  if (searchEngineKeyword) {
    const lowerKeyword = searchEngineKeyword.toLowerCase();
    engine = searchEngines.find(
      (e) => e.keyword.toLowerCase() === lowerKeyword,
    );
  } else if (searchEngineId !== undefined) {
    engine = searchEngines.find((e) => e.id === searchEngineId);
  } else {
    engine = searchEngines.find((e) => e.id === defaultEngineId);
  }

  const urlTemplate = engine?.url ?? FALLBACK_SEARCH_URL;
  return urlTemplate.replace('{searchTerms}', encodeURIComponent(trimmed));
}

export const Omnibox = forwardRef<OmniboxRef, OmniboxProps>(
  ({ tabId, tab }, ref) => {
    const goto = useKartonProcedure((p) => p.browser.goto);
    const defaultEngineId = useKartonState(
      (s) => s.preferences.search.defaultEngineId,
    );
    const searchEngines = useKartonState((s) => s.searchEngines);

    const [localUrl, setLocalUrl] = useState(tab?.url ?? '');
    const [urlBeforeEdit, setUrlBeforeEdit] = useState(tab?.url ?? '');
    const [isUrlInputFocused, setIsUrlInputFocused] = useState(false);
    const urlInputRef = useRef<HTMLInputElement>(null);

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
      if (isHomePage(tab?.url ?? '')) {
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
      return url.startsWith('stagewise://internal/') && !isHomePage(url);
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
          // Resolve the input to a URL (handles both direct URLs and search queries)
          const resolvedUrl = resolveOmniboxInput(
            localUrl,
            searchEngines,
            defaultEngineId,
          );
          // Navigate with TYPED transition to indicate user typed in omnibox
          goto(resolvedUrl, tabId, PageTransition.TYPED);
          setUrlBeforeEdit(localUrl);
          urlInputRef.current?.blur();
        }
      },
      [goto, localUrl, tabId, searchEngines, defaultEngineId],
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
      <div className="relative flex h-8 flex-1 items-center rounded-full bg-surface-1 pr-5 pl-3">
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
            className="w-full truncate rounded-full px-2 text-foreground text-sm outline-none placeholder:font-normal"
            onKeyDown={handleKeyDown}
          />
        )}
        <div className="pointer-events-none flex shrink-0 flex-row items-center gap-1 text-muted-foreground">
          <IconCommand className="size-3" />
          <span className="font-mono text-xs">L</span>
        </div>
      </div>
    );
  },
);

Omnibox.displayName = 'Omnibox';
