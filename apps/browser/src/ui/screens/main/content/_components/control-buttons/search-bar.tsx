import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import {
  IconXmark,
  IconChevronLeft,
  IconChevronRight,
} from 'nucleo-micro-bold';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  type Ref,
} from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconMagnifierOutline18 } from 'nucleo-ui-outline-18';
import { useHotKeyListener } from '@ui/hooks/use-hotkey-listener';
import { HotkeyActions } from '@shared/hotkeys';

export interface SearchBarRef {
  focus: () => void;
}

interface SearchBarProps {
  tabId: string;
  ref: Ref<SearchBarRef>;
}

export function SearchBar({ tabId, ref }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchString, setSearchString] = useState('');
  const [shouldShow, setShouldShow] = useState(false);

  // Track whether the current interaction was triggered by keyboard
  // This is used to disable animations for keyboard interactions (instant feel)
  // while keeping animations for mouse interactions
  const [_isKeyboardInteraction, setIsKeyboardInteraction] = useState(false);

  const isSearchBarActive = useKartonState(
    (s) => s.browser.tabs[tabId]?.isSearchBarActive ?? false,
  );
  const tabSearch = useKartonState((s) => s.browser.tabs[tabId]?.search);

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
  const activateSearchBar = useKartonProcedure(
    (p) => p.browser.searchBar.activate,
  );

  // Track if we have a pending focus request from keyboard interaction
  const [pendingKeyboardFocus, setPendingKeyboardFocus] = useState(false);

  // Expose focus method via ref (called by hotkey CMD+F)
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        // Notify other components that search bar is taking focus
        // This prevents chat input from reclaiming focus when stagewise-ui regains keyboard focus
        window.dispatchEvent(new Event('search-bar-focus-requested'));

        // WORKAROUND: TipTap/ProseMirror may capture keyboard events even after blur.
        // Explicitly blur ALL contentEditable elements to release keyboard capture.
        const contentEditables = document.querySelectorAll(
          '[contenteditable="true"]',
        );
        contentEditables.forEach((el) => {
          if (el instanceof HTMLElement) el.blur();
        });

        // Mark this as a keyboard interaction for instant open (no animation)
        setIsKeyboardInteraction(true);

        // If the search bar is already active and input exists, focus immediately
        if (isSearchBarActive && inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        } else {
          // Input doesn't exist yet - set pending focus flag
          // The useEffect below will focus when the input becomes available
          setPendingKeyboardFocus(true);
          activateSearchBar();
        }
      },
    }),
    [activateSearchBar, isSearchBarActive],
  );

  // Focus the input when it becomes available after a keyboard-triggered open
  useEffect(() => {
    if (pendingKeyboardFocus && shouldShow && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      setPendingKeyboardFocus(false);
    }
  }, [pendingKeyboardFocus, shouldShow]);

  const _handleMouseEnter = useCallback(() => {
    // Mouse interaction should always use transitions
    setIsKeyboardInteraction(false);
  }, []);

  // Sync shouldShow with isSearchBarActive from backend
  useEffect(() => {
    if (isSearchBarActive) {
      setShouldShow(true);
    } else {
      setShouldShow(false);
      // Reset keyboard interaction flag after close completes
      // Use a small delay to allow the closing animation to use the current flag
      setTimeout(() => {
        setIsKeyboardInteraction(false);
      }, 0);
    }
  }, [isSearchBarActive]);

  // Clear local search string when backend search is cleared (e.g., on navigation)
  useEffect(() => {
    if (!tabSearch && searchString.length > 0) {
      setSearchString('');
    }
  }, [tabSearch]); // Only watch tabSearch, not searchString

  // Global hotkey: Mod+G - Jump to next search result (Chrome-style)
  const handleFindNext = useCallback(() => {
    if (!isSearchBarActive) return;
    if (tabSearch && tabSearch.resultsCount > 0) {
      nextSearchResult(tabId);
    }
  }, [isSearchBarActive, tabSearch, tabId, nextSearchResult]);

  useHotKeyListener(handleFindNext, HotkeyActions.FIND_NEXT);

  // Global hotkey: Mod+Shift+G - Jump to previous search result (Chrome-style)
  const handleFindPrev = useCallback(() => {
    if (!isSearchBarActive) return;
    if (tabSearch && tabSearch.resultsCount > 0) {
      previousSearchResult(tabId);
    }
  }, [isSearchBarActive, tabSearch, tabId, previousSearchResult]);

  useHotKeyListener(handleFindPrev, HotkeyActions.FIND_PREV);

  // Start or update search when user types
  useEffect(() => {
    if (!isSearchBarActive || !tabId) return;

    if (searchString.length === 0) {
      // Don't search for empty string
      return;
    }

    if (!tabSearch) {
      // First time typing - start search
      startSearch(searchString, tabId);
    } else if (searchString !== tabSearch.text) {
      // Text changed - update search
      updateSearch(searchString, tabId);
    }
  }, [
    searchString,
    isSearchBarActive,
    // Removed tabSearch from dependencies to prevent duplicate searches
    // when backend state updates (e.g., result count changes)
    tabId,
    startSearch,
    updateSearch,
  ]);

  if (!shouldShow) return null;

  return (
    <div className="flex h-full min-w-48 basis-1/4 flex-row items-center justify-between gap-2 pr-0.5 pl-1.5">
      <IconMagnifierOutline18 className="size-4 text-muted-foreground opacity-50" />
      <input
        ref={inputRef}
        placeholder="Search in tab..."
        type="text"
        value={searchString}
        onChange={(e) => setSearchString(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (tabSearch && tabSearch.resultsCount > 0) {
              if (e.shiftKey) {
                // Shift+Enter: Previous result
                previousSearchResult(tabId);
              } else {
                // Enter: Next result
                nextSearchResult(tabId);
              }
            }
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation(); // Prevent React event from bubbling
            e.nativeEvent.stopImmediatePropagation(); // Prevent native event from reaching window listeners
            // Mark as keyboard interaction for instant close (no animation)
            // Set both states synchronously so they're batched in the same render
            setIsKeyboardInteraction(true);
            setShouldShow(false);
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
            disabled={!tabSearch || tabSearch.resultsCount === 0}
            onClick={() => previousSearchResult(tabId)}
          >
            <IconChevronLeft className="size-3" />
          </Button>
          <span className="text-muted-foreground text-xs">
            {tabSearch?.activeMatchIndex ?? 0} / {tabSearch?.resultsCount ?? 0}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={!tabSearch || tabSearch.resultsCount === 0}
            onClick={() => nextSearchResult(tabId)}
          >
            <IconChevronRight className="size-3" />
          </Button>
        </div>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => {
          setShouldShow(false);
          deactivateSearchBar();
        }}
      >
        <IconXmark className="size-3" />
      </Button>
    </div>
  );
}
