import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type {
  SuggestionProps,
  SuggestionKeyDownProps,
} from '@tiptap/suggestion';
import { SlashSuggestionPopup } from './suggestion-popup';
import type { SlashItem } from './types';

export const slashSuggestionActive = { current: false };

export function createSlashSuggestionRenderer() {
  let root: Root | null = null;
  let container: HTMLElement | null = null;
  let selectedIndex = 0;
  let currentProps: SuggestionProps<SlashItem> | null = null;

  function renderPopup() {
    if (!root || !currentProps) return;

    const items = currentProps.items;
    const clamped = Math.max(0, Math.min(selectedIndex, items.length - 1));

    if (clamped !== selectedIndex) selectedIndex = clamped;

    root.render(
      createElement(SlashSuggestionPopup, {
        items,
        selectedIndex,
        onSelect: (item: SlashItem) => currentProps?.command(item),
        clientRect: currentProps.clientRect ?? null,
      }),
    );
  }

  return {
    onStart(props: SuggestionProps<SlashItem>) {
      slashSuggestionActive.current = true;
      currentProps = props;
      selectedIndex = 0;

      container = document.createElement('div');
      container.className =
        'slash-suggestion-container animate-in fade-in-0 zoom-in-95 duration-150';
      document.body.appendChild(container);
      root = createRoot(container);
      renderPopup();
    },

    onUpdate(props: SuggestionProps<SlashItem>) {
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

      if (event.key === 'Escape') return true;

      return false;
    },

    onExit() {
      slashSuggestionActive.current = false;
      root?.unmount();
      container?.remove();
      root = null;
      container = null;
      currentProps = null;
    },
  };
}
