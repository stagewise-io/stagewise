import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type {
  SuggestionProps,
  SuggestionKeyDownProps,
} from '@tiptap/suggestion';
import { SlashSuggestionPopup } from './suggestion-popup';
import type { SlashItem } from './types';
import {
  querySlashItems,
  resetSlashExpansion,
  toggleSlashGroup,
} from './provider';

export const slashSuggestionActive = { current: false };

export function createSlashSuggestionRenderer() {
  let root: Root | null = null;
  let container: HTMLElement | null = null;
  let selectedIndex = 0;
  let selectionSource: 'keyboard' | 'mouse' = 'keyboard';
  let ignoreMouseUntilMove = false;
  let currentProps: SuggestionProps<SlashItem> | null = null;
  let currentQuery = '';

  /** Panel navigation state. */
  let focusMode: 'main' | 'panel' = 'main';
  let panelIndex = 0;

  function resetPanelState() {
    focusMode = 'main';
    panelIndex = 0;
  }

  /** Returns the hiddenItems array for the currently selected item, or null. */
  function getHiddenItems(): SlashItem[] | null {
    if (!currentProps) return null;
    const item = currentProps.items[selectedIndex];
    if (!item?.expandGroup || !item.hiddenItems?.length) return null;
    return item.hiddenItems;
  }

  function handleSelect(item: SlashItem) {
    if (!currentProps) return;

    if (item.expandGroup) {
      // Synthetic "Show N more" item — expand the group and re-render.
      toggleSlashGroup(item.expandGroup);
      const newItems = querySlashItems(currentQuery);
      currentProps.items = newItems;
      if (selectedIndex >= newItems.length)
        selectedIndex = Math.max(0, newItems.length - 1);

      resetPanelState();
      renderPopup();
      return;
    }

    currentProps.command(item);
  }

  function renderPopup() {
    if (!currentProps) return;

    const items = currentProps.items;

    // Don't create DOM for a session that starts with 0 items
    // (phantom onStart from TipTap when the trigger char is deleted).
    // Once a container exists, allow rendering 0 items ("No results").
    if (items.length === 0 && !root) return;

    // Lazily create container on first render with items.
    if (!root) {
      container = document.createElement('div');
      container.className =
        'slash-suggestion-container animate-in fade-in-0 zoom-in-95 duration-150';
      document.body.appendChild(container);
      root = createRoot(container);
    }

    const clamped = Math.max(0, Math.min(selectedIndex, items.length - 1));

    if (clamped !== selectedIndex) selectedIndex = clamped;

    root.render(
      createElement(SlashSuggestionPopup, {
        items,
        selectedIndex,
        selectionSource,
        panelIndex,
        isPanelFocused: focusMode === 'panel',
        onSelect: (item: SlashItem) => handleSelect(item),
        onHoverIndex: handleHoverIndex,
        onHoverPanelIndex: handleHoverPanelIndex,
        onMouseMoved: handleMouseMoved,
        clientRect: currentProps.clientRect ?? null,
      }),
    );
  }

  function handleHoverIndex(index: number) {
    if (ignoreMouseUntilMove) return;
    if (!currentProps) return;
    const count = currentProps.items.length;
    if (index < 0 || index >= count) return;
    selectedIndex = index;
    selectionSource = 'mouse';
    resetPanelState();
    renderPopup();
  }

  function handleHoverPanelIndex(index: number) {
    if (ignoreMouseUntilMove) return;
    const hidden = getHiddenItems();
    if (!hidden || index < 0 || index >= hidden.length) return;
    focusMode = 'panel';
    panelIndex = index;
    selectionSource = 'mouse';
    renderPopup();
  }

  function handleMouseMoved() {
    ignoreMouseUntilMove = false;
  }

  function handleMainKeyDown(
    event: KeyboardEvent,
    count: number,
    isCtrlOnly: boolean,
  ): boolean {
    if (event.key === 'ArrowDown' || (isCtrlOnly && event.key === 'n')) {
      event.preventDefault();
      selectedIndex = (selectedIndex + 1) % count;
      selectionSource = 'keyboard';
      ignoreMouseUntilMove = true;
      resetPanelState();
      renderPopup();
      return true;
    }

    if (event.key === 'ArrowUp' || (isCtrlOnly && event.key === 'p')) {
      event.preventDefault();
      selectedIndex = (selectedIndex - 1 + count) % count;
      selectionSource = 'keyboard';
      ignoreMouseUntilMove = true;
      resetPanelState();
      renderPopup();
      return true;
    }

    if (event.key === 'ArrowRight' || event.key === 'Tab') {
      const hidden = getHiddenItems();
      if (hidden) {
        event.preventDefault();
        focusMode = 'panel';
        panelIndex = 0;
        selectionSource = 'keyboard';
        ignoreMouseUntilMove = true;
        renderPopup();
        return true;
      }
      // No hidden items — fall through (Tab closes popup, ArrowRight ignored).
      return event.key !== 'Tab';
    }

    if (event.key === 'Enter') {
      const item = currentProps!.items[selectedIndex];
      if (item) handleSelect(item);
      return true;
    }

    if (event.key === 'Escape') return false;

    return false;
  }

  function handlePanelKeyDown(
    event: KeyboardEvent,
    isCtrlOnly: boolean,
  ): boolean {
    const hidden = getHiddenItems();
    if (!hidden) {
      // Safety: shouldn't happen, but fall back to main mode.
      resetPanelState();
      renderPopup();
      return false;
    }

    const count = hidden.length;

    if (event.key === 'ArrowDown' || (isCtrlOnly && event.key === 'n')) {
      event.preventDefault();
      panelIndex = (panelIndex + 1) % count;
      selectionSource = 'keyboard';
      ignoreMouseUntilMove = true;
      renderPopup();
      return true;
    }

    if (event.key === 'ArrowUp' || (isCtrlOnly && event.key === 'p')) {
      event.preventDefault();
      panelIndex = (panelIndex - 1 + count) % count;
      selectionSource = 'keyboard';
      ignoreMouseUntilMove = true;
      renderPopup();
      return true;
    }

    if (event.key === 'Enter') {
      const item = hidden[panelIndex];
      if (item && currentProps) {
        currentProps.command(item);
      }
      return true;
    }

    if (
      event.key === 'ArrowLeft' ||
      event.key === 'Escape' ||
      event.key === 'Tab'
    ) {
      event.preventDefault();
      resetPanelState();
      selectionSource = 'keyboard';
      ignoreMouseUntilMove = true;
      renderPopup();
      return true;
    }

    // Ignore modifier-only keys so Ctrl+N / Ctrl+P combos aren't broken.
    if (
      event.key === 'Control' ||
      event.key === 'Shift' ||
      event.key === 'Alt' ||
      event.key === 'Meta'
    ) {
      return false;
    }

    // Any other key (typing, etc.) — return to main, let TipTap handle it.
    resetPanelState();
    renderPopup();
    return false;
  }

  return {
    onStart(props: SuggestionProps<SlashItem>) {
      // Defensive cleanup: if a previous session wasn't properly exited
      // (e.g. TipTap fires onStart twice without onExit), tear it down
      // to avoid leaking a stale popup container in the DOM.
      if (root || container) {
        root?.unmount();
        container?.remove();
        root = null;
        container = null;
      }

      slashSuggestionActive.current = true;
      currentProps = props;
      currentQuery = props.query ?? '';
      selectedIndex = 0;
      selectionSource = 'keyboard';
      resetPanelState();
      resetSlashExpansion();

      // DOM creation is deferred to renderPopup() so that phantom
      // onStart calls with 0 items don't leak a container.
      renderPopup();
    },

    onUpdate(props: SuggestionProps<SlashItem>) {
      const newQuery = props.query ?? '';
      const queryChanged = newQuery !== currentQuery;

      currentProps = props;
      currentQuery = newQuery;

      // Only reset navigation state when the query actually changed.
      // Modifier-only keystrokes (Ctrl, Shift, etc.) can trigger onUpdate
      // without changing the query — resetting here would break Ctrl+N/P
      // navigation inside the panel.
      if (queryChanged) {
        selectedIndex = 0;
        selectionSource = 'keyboard';
        resetPanelState();
      }

      renderPopup();
    },

    onKeyDown({ event }: SuggestionKeyDownProps) {
      if (!currentProps) return false;
      const count = currentProps.items.length;
      if (count === 0) return false;

      const isCtrlOnly =
        event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

      if (focusMode === 'panel') return handlePanelKeyDown(event, isCtrlOnly);

      return handleMainKeyDown(event, count, isCtrlOnly);
    },

    onExit() {
      slashSuggestionActive.current = false;
      root?.unmount();
      container?.remove();
      root = null;
      container = null;
      currentProps = null;
      resetPanelState();
    },
  };
}
