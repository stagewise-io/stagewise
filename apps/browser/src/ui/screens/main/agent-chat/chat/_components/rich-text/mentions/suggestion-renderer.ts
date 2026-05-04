import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type {
  SuggestionProps,
  SuggestionKeyDownProps,
} from '@tiptap/suggestion';
import { SuggestionPopup } from './suggestion-popup';
import { mentionContextRef } from './mention-extension';
import type { ResolvedMentionItem } from './types';

export const mentionSuggestionActive = { current: false };

export function createSuggestionRenderer() {
  let root: Root | null = null;
  let container: HTMLElement | null = null;
  let selectedIndex = 0;
  let selectionSource: 'keyboard' | 'mouse' = 'keyboard';
  let ignoreMouseUntilMove = false;
  let currentProps: SuggestionProps<ResolvedMentionItem> | null = null;

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
        'mention-suggestion-container animate-in fade-in-0 zoom-in-95 duration-150';
      document.body.appendChild(container);
      root = createRoot(container);
    }

    const clamped = Math.max(0, Math.min(selectedIndex, items.length - 1));

    if (clamped !== selectedIndex) selectedIndex = clamped;

    root.render(
      createElement(SuggestionPopup, {
        items,
        selectedIndex,
        selectionSource,
        onSelect: (item: ResolvedMentionItem) => currentProps?.command(item),
        onHoverIndex: handleHoverIndex,
        onMouseMoved: handleMouseMoved,
        clientRect: currentProps.clientRect ?? null,
        tabs: mentionContextRef.current.tabs,
        mounts: mentionContextRef.current.mounts,
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
    renderPopup();
  }

  function handleMouseMoved() {
    ignoreMouseUntilMove = false;
  }

  return {
    onStart(props: SuggestionProps<ResolvedMentionItem>) {
      // Defensive cleanup: if a previous session wasn't properly exited
      // (e.g. TipTap fires onStart twice without onExit), tear it down
      // to avoid leaking a stale popup container in the DOM.
      if (root || container) {
        root?.unmount();
        container?.remove();
        root = null;
        container = null;
      }

      mentionSuggestionActive.current = true;
      currentProps = props;
      selectedIndex = 0;
      selectionSource = 'keyboard';

      // DOM creation is deferred to renderPopup() so that phantom
      // onStart calls with 0 items don't leak a container.
      renderPopup();
    },

    onUpdate(props: SuggestionProps<ResolvedMentionItem>) {
      currentProps = props;
      selectedIndex = 0;
      selectionSource = 'keyboard';
      renderPopup();
    },

    onKeyDown({ event }: SuggestionKeyDownProps) {
      if (!currentProps) return false;
      const count = currentProps.items.length;
      if (count === 0) return false;

      const isCtrlOnly =
        event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

      if (event.key === 'ArrowDown' || (isCtrlOnly && event.key === 'n')) {
        event.preventDefault();
        selectedIndex = (selectedIndex + 1) % count;
        selectionSource = 'keyboard';
        ignoreMouseUntilMove = true;
        renderPopup();
        return true;
      }

      if (event.key === 'ArrowUp' || (isCtrlOnly && event.key === 'p')) {
        event.preventDefault();
        selectedIndex = (selectedIndex - 1 + count) % count;
        selectionSource = 'keyboard';
        ignoreMouseUntilMove = true;
        renderPopup();
        return true;
      }

      if (event.key === 'Enter') {
        const item = currentProps.items[selectedIndex];
        if (item) currentProps.command(item);
        return true;
      }

      if (event.key === 'Escape') return false;

      return false;
    },

    onExit() {
      mentionSuggestionActive.current = false;
      root?.unmount();
      container?.remove();
      root = null;
      container = null;
      currentProps = null;
    },
  };
}
