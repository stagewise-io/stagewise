import { useMemo } from 'react';
import type { TabState } from '@shared/karton-contracts/ui';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';

import { WithTabPreviewCard } from './with-tab-preview-card';
import { TabFavicon } from './tab-favicon';
import { IconVolumeUpFill18, IconVolumeXmarkFill18 } from 'nucleo-ui-fill-18';
import { IconXmark } from 'nucleo-micro-bold';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useTabUIState } from '@ui/hooks/use-tab-ui-state';
import { HotkeyActions } from '@shared/hotkeys';
import { HotkeyComboText } from '@ui/components/hotkey-combo-text';

export function Tab({
  tabState,
}: {
  /** Optional override for just the bottom-left S-curve radius (used during drag interpolation) */
  bottomLeftBorderRadius?: number;
  className?: string;
  activateBottomLeftCornerRadius?: boolean;
  tabState: TabState;
  /** Whether this tab is currently being dragged */
  isDragging?: boolean;
}) {
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const isActive = tabState.id === activeTabId;
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const { tabUiState, removeTabUiState } = useTabUIState();

  const handleClick = async () => {
    if (isActive) return;
    const focus = tabUiState[tabState.id]?.focusedPanel ?? 'stagewise-ui';
    await switchTab(tabState.id);
    void togglePanelKeyboardFocus(focus);
  };

  const handleAuxClick = (e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    const isOnlyTab = Object.keys(tabs).length === 1;
    const isInternalPage =
      tabState.url?.startsWith('stagewise://internal/') ?? false;
    if (isOnlyTab && isInternalPage) return;
    closeTab(tabState.id);
    removeTabUiState(tabState.id);
  };

  return (
    <WithTabPreviewCard tabState={tabState} activeTabId={activeTabId}>
      <div
        className={cn(
          '@container flex h-8 min-w-16 max-w-48 flex-row items-center justify-center gap-2 px-1.5 py-1 ring-1 transition-colors duration-150 ease-out',
          isActive
            ? 'bg-surface-1 ring-1 ring-derived-subtle hover:bg-surface-2'
            : 'bg-transparent ring-transparent hover:bg-surface-1',
        )}
        onClick={isActive ? undefined : handleClick}
        onAuxClick={handleAuxClick}
        tabIndex={-1}
      >
        {/* Shared tab content */}
        <TabContent isActive={isActive} tabState={tabState} />
      </div>
    </WithTabPreviewCard>
  );
}

function TabContent({
  isActive,
  tabState,
}: {
  isActive: boolean;
  tabState: TabState;
}) {
  const tabs = useKartonState((s) => s.browser.tabs);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const toggleAudioMuted = useKartonProcedure(
    (p) => p.browser.toggleAudioMuted,
  );
  const { removeTabUiState } = useTabUIState();

  const handleClose = () => {
    closeTab(tabState.id);
    removeTabUiState(tabState.id);
  };

  const handleToggleAudioMuted = () => {
    toggleAudioMuted(tabState.id);
  };

  const shouldHideCloseButton = useMemo(() => {
    const isOnlyTab = Object.keys(tabs).length === 1;
    const isInternalPage =
      tabState.url?.startsWith('stagewise://internal/') ?? false;
    return isOnlyTab && isInternalPage;
  }, [tabs, tabState.url]);
  const content = (
    <>
      <TabFavicon tabState={tabState} />
      <span
        data-active={isActive ? 'true' : 'false'}
        className="mt-px @[55px]:block hidden flex-1 truncate font-regular text-xs"
      >
        {tabState.title}
      </span>
      {(tabState.isPlayingAudio || tabState.isMuted) && (
        <Button
          variant="ghost"
          size="icon-2xs"
          onClick={handleToggleAudioMuted}
          className={cn(
            'shrink-0',
            tabState.isMuted
              ? 'text-error hover:text-error-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          tabIndex={-1}
        >
          {!tabState.isMuted ? (
            <IconVolumeUpFill18
              className={cn('size-3', !isActive && 'text-muted-foreground')}
            />
          ) : (
            <IconVolumeXmarkFill18
              className={cn('size-3', !isActive && 'text-error-foreground')}
            />
          )}
        </Button>
      )}
      {!shouldHideCloseButton && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-2xs"
              className={cn(
                'ml-auto shrink-0 text-muted-foreground hover:text-foreground',
                !isActive && '@[40px]:flex hidden',
              )}
              onClick={handleClose}
              tabIndex={-1}
            >
              <IconXmark className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>
              Close (<HotkeyComboText action={HotkeyActions.CLOSE_TAB} />)
            </span>
            <br />
            <span className="text-muted-foreground/70">
              {' '}
              Close all other (
              <HotkeyComboText action={HotkeyActions.CLOSE_WINDOW} />)
            </span>
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );

  return content;
}
