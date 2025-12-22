import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import {
  IconXmark,
  IconChevronLeft,
  IconChevronRight,
} from 'nucleo-micro-bold';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconFindEditOutline18 } from 'nucleo-ui-outline-18';
import {
  Collapsible,
  CollapsibleContent,
} from '@stagewise/stage-ui/components/collapsible';

export function SearchBar({ ref }: { ref: React.RefObject<HTMLInputElement> }) {
  const [searchString, setSearchString] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isSearchBarActive = useKartonState((s) => s.browser.isSearchBarActive);
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTabSearch = activeTabId ? tabs[activeTabId]?.search : null;

  const startSearch = useKartonProcedure((p) => p.browser.searchInPage.start);
  const updateSearch = useKartonProcedure(
    (p) => p.browser.searchInPage.updateText,
  );
  const nextSearchResult = useKartonProcedure(
    (p) => p.browser.searchInPage.next,
  );
  const previousSearchResult = useKartonProcedure(
    (p) => p.browser.searchInPage.previous,
  );
  const deactivateSearchBar = useKartonProcedure(
    (p) => p.browser.searchBar.deactivate,
  );

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (!shouldShow) {
      setShouldShow(true);
    }
  }, [shouldShow]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  // Handle auto-show/hide logic
  useEffect(() => {
    // Clear any existing timers
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    // Show if search bar is active
    if (isSearchBarActive) {
      if (!shouldShow) {
        setShouldShow(true);
      }
      return;
    }

    // If search bar is not active and mouse is not hovering, start hide timer
    if (!isSearchBarActive && !isHovered) {
      hideTimerRef.current = setTimeout(() => {
        setShouldShow(false);
      }, 150);
    }

    // Cleanup timers on unmount
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [isSearchBarActive, isHovered, shouldShow]);

  // Focus input when search bar becomes active
  useEffect(() => {
    if (isSearchBarActive && ref && typeof ref !== 'function') {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [isSearchBarActive, ref]);

  // Clear local search string when backend search is cleared (e.g., on navigation)
  useEffect(() => {
    if (!activeTabSearch && searchString.length > 0) {
      setSearchString('');
    }
  }, [activeTabSearch]); // Only watch activeTabSearch, not searchString

  // Start or update search when user types
  useEffect(() => {
    if (!isSearchBarActive || !activeTabId) return;

    if (searchString.length === 0) {
      // Don't search for empty string
      return;
    }

    if (!activeTabSearch) {
      // First time typing - start search
      startSearch(searchString, activeTabId);
    } else if (searchString !== activeTabSearch.text) {
      // Text changed - update search
      updateSearch(searchString, activeTabId);
    }
  }, [
    searchString,
    isSearchBarActive,
    // Removed activeTabSearch from dependencies to prevent duplicate searches
    // when backend state updates (e.g., result count changes)
    activeTabId,
    startSearch,
    updateSearch,
  ]);

  return (
    <Collapsible open={shouldShow}>
      <CollapsibleContent
        className="h-8 w-[calc-size(auto,size)] justify-center rounded-full bg-zinc-500/5 pr-1.5 pl-2.5 text-base opacity-100 blur-none transition-all duration-150 ease-out focus-within:bg-zinc-500/10 data-ending-style:h-8! data-starting-style:h-8! data-ending-style:w-0 data-starting-style:w-0 data-ending-style:overflow-hidden data-starting-style:overflow-hidden data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:blur-sm data-starting-style:blur-sm"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex h-full min-w-48 basis-1/4 flex-row items-center justify-between gap-2">
          <IconFindEditOutline18 className="size-4 text-muted-foreground opacity-50" />
          <input
            ref={ref}
            placeholder="Search in tab..."
            type="text"
            value={searchString}
            onChange={(e) => setSearchString(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (activeTabSearch && activeTabSearch.resultsCount > 0) {
                  nextSearchResult(activeTabId);
                }
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (activeTabSearch && activeTabSearch.resultsCount > 0) {
                  previousSearchResult(activeTabId);
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                deactivateSearchBar();
              }
            }}
            className="w-full flex-1 truncate text-foreground text-sm outline-none"
          />
          {searchString.length > 0 && (
            <div className="flex flex-row items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={
                  !activeTabSearch || activeTabSearch.resultsCount === 0
                }
                onClick={() => previousSearchResult(activeTabId)}
              >
                <IconChevronLeft className="size-3" />
              </Button>
              <span className="text-muted-foreground text-xs">
                {activeTabSearch?.activeMatchIndex ?? 0} /{' '}
                {activeTabSearch?.resultsCount ?? 0}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={
                  !activeTabSearch || activeTabSearch.resultsCount === 0
                }
                onClick={() => nextSearchResult(activeTabId)}
              >
                <IconChevronRight className="size-3" />
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => deactivateSearchBar()}
          >
            <IconXmark className="size-3" />
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
