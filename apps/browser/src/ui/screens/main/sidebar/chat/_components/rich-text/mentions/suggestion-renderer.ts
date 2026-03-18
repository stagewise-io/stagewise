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
  let currentProps: SuggestionProps<ResolvedMentionItem> | null = null;

  function renderPopup() {
    if (!root || !currentProps) return;

    const items = currentProps.items;
    const clamped = Math.max(0, Math.min(selectedIndex, items.length - 1));

    if (clamped !== selectedIndex) selectedIndex = clamped;

    root.render(
      createElement(SuggestionPopup, {
        items,
        selectedIndex,
        onSelect: (item: ResolvedMentionItem) => currentProps?.command(item),
        clientRect: currentProps.clientRect ?? null,
        tabs: mentionContextRef.current.tabs,
        mounts: mentionContextRef.current.mounts,
      }),
    );
  }

  return {
    onStart(props: SuggestionProps<ResolvedMentionItem>) {
      mentionSuggestionActive.current = true;
      currentProps = props;
      selectedIndex = 0;

      container = document.createElement('div');
      container.className =
        'mention-suggestion-container animate-in fade-in-0 zoom-in-95 duration-150';
      document.body.appendChild(container);
      root = createRoot(container);
      renderPopup();
    },

    onUpdate(props: SuggestionProps<ResolvedMentionItem>) {
      currentProps = props;
      selectedIndex = 0;
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
        renderPopup();
        return true;
      }

      if (event.key === 'ArrowUp' || (isCtrlOnly && event.key === 'p')) {
        event.preventDefault();
        selectedIndex = (selectedIndex - 1 + count) % count;
        renderPopup();
        return true;
      }

      if (event.key === 'Enter') {
        const item = currentProps.items[selectedIndex];
        if (item) currentProps.command(item);
        return true;
      }

      if (event.key === 'Escape') {
        return true;
      }

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
