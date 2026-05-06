import {
  type Ref,
  useCallback,
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
  type KeyboardEvent,
} from 'react';
import type { TabState } from '@shared/karton-contracts/ui';
import {
  Autocomplete,
  type AutocompleteRootProps,
} from '@base-ui/react/autocomplete';
import { PageTransition } from '@shared/karton-contracts/pages-api/types';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import {
  type OmniboxSuggestionItem,
  useOmniboxSuggestions,
  convertOmniboxInputToUrl,
} from './utils';
import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { InternalPageBreadcrumbs } from './internal-page-breadcrumbs';
import { dispatchArrowFromCtrl } from '@ui/utils/keyboard-nav';

export interface OmniboxRef {
  focus: () => void;
}

export const Omnibox = ({
  tabId,
  tab,
  isActive,
  ref,
}: {
  tabId: string;
  tab: TabState | undefined;
  isActive: boolean;
  ref: Ref<OmniboxRef>;
}) => {
  const displayedTabUrl =
    tab?.url === 'stagewise://internal/home' ? '' : tab?.url;

  const goto = useKartonProcedure((p) => p.browser.goto);
  const movePanelToForeground = useKartonProcedure(
    (p) => p.browser.layout.movePanelToForeground,
  );
  const defaultEngineId = useKartonState(
    (s) => s.preferences.search.defaultEngineId,
  );
  const searchEngines = useKartonState((s) => s.searchEngines);

  const [isOmniboxOpen, setIsOmniboxOpen] = useState(false);

  const [inputValue, setInputValue] = useState(displayedTabUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track whether the current open/close interaction was triggered by keyboard
  // This is used to disable animations for keyboard interactions (instant feel)
  // while keeping animations for mouse interactions
  const [isKeyboardInteraction, setIsKeyboardInteraction] = useState(false);

  // Track whether the omnibox is closing because a navigation was triggered
  // (Enter / suggestion click). When true:
  //   data-omnibox-modal-active stays set so the WebContentsBoundsSyncer
  //   keeps UI in foreground until the URL actually changes
  const [navigationPending, setNavigationPending] = useState(false);

  // Expose focus method via ref (called by hotkey CMD+L)
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        // Notify other components that omnibox is taking focus
        // This prevents chat input from reclaiming focus when stagewise-ui regains keyboard focus
        window.dispatchEvent(new Event('omnibox-focus-requested'));

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
        setIsOmniboxOpen(true);
        // Focus immediately without delay for instant keyboard response
        // Use requestAnimationFrame to ensure state has been applied
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      },
    }),
    [],
  );

  // Clear navigation-pending state when the page finishes loading (isLoading: true→false).
  // We can’t use displayedTabUrl as the signal because updateState({ url }) fires
  // immediately in loadURL — before the page loads — which would clear the guard
  // too early and let WebContentsBoundsSyncer switch to tab-content mid-navigation.
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (tab?.isLoading) {
      wasLoadingRef.current = true;
    } else if (wasLoadingRef.current && navigationPending) {
      wasLoadingRef.current = false;
      setNavigationPending(false);
    }
  }, [tab?.isLoading, navigationPending]);

  const shouldShowBreadcrumbs = displayedTabUrl?.startsWith(
    'stagewise://internal/',
  );

  useEffect(() => {
    if (!isOmniboxOpen) {
      setInputValue(displayedTabUrl);
    }
  }, [displayedTabUrl, tab?.isLoading]);

  // Close omnibox when the active tab changes or when this tab becomes inactive
  useEffect(() => {
    if (!isActive) {
      setIsOmniboxOpen(false);
    }
  }, [tabId, isActive]);

  // Sync Electron z-order with omnibox open state so the popover is visible
  // above tab webcontents. Only force stagewise-ui to foreground on open.
  // On close, WebContentsBoundsSyncer handles restoring tab-content z-order
  // based on mouse position — this avoids a race where the popover closes
  // before onSubmit runs, causing a premature tab-content switch.
  useEffect(() => {
    if (isOmniboxOpen) {
      void movePanelToForeground('stagewise-ui');
    }
  }, [isOmniboxOpen, movePanelToForeground]);

  const { groups: suggestionGroups, resetSuggestions } = useOmniboxSuggestions(
    displayedTabUrl,
    inputValue ?? '',
    searchEngines,
    defaultEngineId,
    undefined,
    undefined,
  );

  const onValueChange = useCallback<
    NonNullable<AutocompleteRootProps<OmniboxSuggestionItem>['onValueChange']>
  >(
    (value, details) => {
      if (details.reason !== 'escape-key') {
        setInputValue(value);
      }

      if (details.reason === 'escape-key') {
        // Mark this as a keyboard interaction for instant close (no animation)
        setIsKeyboardInteraction(true);
        inputRef.current?.blur();
      }

      if (!isOmniboxOpen) {
        // We should clear stale suggestions for the omnibox if it's not shown anyway
        resetSuggestions();
      }
    },
    [isOmniboxOpen, resetSuggestions],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!inputValue || inputValue.trim() === '') {
        return;
      }
      // Convert input to proper URL (handles localhost, search queries, etc.)
      const url = convertOmniboxInputToUrl(
        inputValue,
        searchEngines,
        defaultEngineId,
      );
      // Keep omnibox-modal-active attribute set so WebContentsBoundsSyncer
      // doesn't switch to tab-content while the navigation is in progress.
      setNavigationPending(true);
      // Close the omnibox immediately so the popover disappears.
      setIsOmniboxOpen(false);
      inputRef.current?.blur();
      // Navigate with TYPED transition to indicate user typed in omnibox
      goto(url, tabId, PageTransition.TYPED);
    },
    [inputValue, tabId, searchEngines, defaultEngineId],
  );

  const onOpenChange = useCallback(
    (open: boolean) => {
      // If opening and not already marked as keyboard interaction,
      // this is a mouse interaction (clicking on input)
      if (open && !isKeyboardInteraction) {
        setIsKeyboardInteraction(false);
      }
      setIsOmniboxOpen(open);
      if (!open) {
        inputRef.current?.blur();
        // Reset keyboard interaction flag after close completes
        // Use a small delay to allow the closing animation to use the current flag
        setTimeout(() => {
          setIsKeyboardInteraction(false);
        }, 0);
      }
    },
    [isKeyboardInteraction],
  );

  const onInputFocus = useCallback(() => {
    // Select all text when the input is focused (e.g., by clicking on it)
    // Use setTimeout to ensure selection happens after the focus event completes
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  }, []);

  const onInputKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    dispatchArrowFromCtrl(e);
  }, []);

  const showDefaultBrowserInfo = false; // TODO

  return (
    <form
      onSubmit={onSubmit}
      className="flex-1"
      // When omnibox is open OR a navigation is pending (omnibox just submitted),
      // mark it so WebContentsBoundsSyncer keeps UI in foreground.
      // This prevents web content from stealing focus during/after omnibox interaction.
      data-omnibox-modal-active={
        isOmniboxOpen || navigationPending || undefined
      }
    >
      <Autocomplete.Root
        items={suggestionGroups}
        openOnInputClick
        open={isOmniboxOpen}
        onOpenChange={onOpenChange}
        value={inputValue}
        defaultValue={inputValue}
        onValueChange={onValueChange}
        highlightItemOnHover
        submitOnItemClick
        autoHighlight="always"
        keepHighlight={true}
        mode="inline"
      >
        <div className="flex-1">
          <Autocomplete.Input
            ref={inputRef}
            placeholder="Search or type a URL"
            onFocus={onInputFocus}
            onKeyDown={onInputKeyDown}
            // Windows: body { user-select: none } suppresses the mousedown
            // default action that normally triggers focus on <input> elements.
            // Explicitly calling focus() bypasses this platform-specific behavior.
            onMouseDown={() => inputRef.current?.focus()}
            className={cn(
              'h-7.5 w-full flex-1 select-text pr-5 pl-3 text-muted-foreground text-sm focus:bg-surface-1 focus:text-foreground focus:outline-none focus:ring-derived-strong focus-visible:outline-none',
              // Only apply transitions for mouse interactions, instant for keyboard
              isKeyboardInteraction
                ? 'transition-none'
                : 'transition-all duration-150 ease-out',
              shouldShowBreadcrumbs && !isOmniboxOpen && 'text-transparent',
            )}
          />
          {shouldShowBreadcrumbs && !isOmniboxOpen && (
            <InternalPageBreadcrumbs url={displayedTabUrl ?? ''} />
          )}
        </div>
        <Autocomplete.Portal>
          <Autocomplete.Backdrop className="app-no-drag absolute inset-0 size-full bg-black" />
          <Autocomplete.Positioner
            className="outline-none"
            side="bottom"
            sideOffset={6}
          >
            <Autocomplete.Popup
              className={cn(
                'w-[calc(var(--anchor-width)-0.5rem)] max-w-[calc(var(--anchor-width)-0.5rem)] rounded-md bg-surface-1 p-0.5 text-foreground shadow-lg ring-1 ring-derived-strong',
                // Only apply transitions and animation styles for mouse interactions
                isKeyboardInteraction
                  ? 'transition-none'
                  : 'data-ending-style:-translate-y-2 data-starting-style:-translate-y-2 transition-all duration-150 ease-out data-ending-style:scale-y-95 data-starting-style:scale-y-95 data-ending-style:rounded-t-none data-starting-style:rounded-t-none data-ending-style:opacity-0 data-starting-style:opacity-0',
              )}
              finalFocus={false}
            >
              {suggestionGroups.filter((g) => g.items.length > 0).length ===
                0 && (
                <Autocomplete.Empty className="p-3 text-muted-foreground text-sm empty:m-0 empty:p-0">
                  {inputValue && inputValue.trim() !== ''
                    ? 'No suggestions found.'
                    : 'No browsing history yet.'}
                </Autocomplete.Empty>
              )}
              <Autocomplete.List className="divide-y divide-surface-2">
                {suggestionGroups
                  .filter((g) => g.items.length > 0)
                  .map((group, _gIdx) => (
                    <Autocomplete.Group
                      key={group.key}
                      className="py-1 first:pt-0 last:pb-0"
                    >
                      {group.label && (
                        <Autocomplete.GroupLabel className="mt-0.5 mb-1 pl-1.5 font-medium text-muted-foreground text-xs">
                          {group.label}
                        </Autocomplete.GroupLabel>
                      )}
                      {group.items.map((item, i) => (
                        <Autocomplete.Item
                          key={`${item.type}-${item.value}-${i}`}
                          className={cn(
                            'flex flex-row items-center gap-2 rounded-md px-2 py-1 text-sm',
                            !item.unselectable &&
                              'data-highlighted:bg-surface-2',
                          )}
                          value={item.value}
                          disabled={item.unselectable}
                        >
                          <div className="flex min-w-0 flex-row items-center gap-2">
                            <div className="shrink-0">
                              {item.suggestionIcon}
                            </div>
                            <span className="truncate">
                              {item.suggestionLabel ?? item.value}
                            </span>
                          </div>
                        </Autocomplete.Item>
                      ))}
                    </Autocomplete.Group>
                  ))}
              </Autocomplete.List>
              {showDefaultBrowserInfo && (
                <div className="mt-2 flex w-full items-center justify-end gap-4 rounded-md px-1 py-1 text-primary-solid text-sm">
                  <span>
                    Always building something new?{' '}
                    <strong className="font-medium">
                      Set stagewise as your default browser!
                    </strong>
                  </span>
                  <Button variant="primary" size="xs">
                    Set as default
                  </Button>
                </div>
              )}
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      </Autocomplete.Root>
    </form>
  );
};
