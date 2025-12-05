import { useEffect } from 'react';
import {
  DOMSelectorHotkeyActions,
  domSelectorHotkeyDefinitions,
} from '@/utils';

export interface DOMSelectorKeyboardHandlers {
  onNavigateToParent: () => void;
  onNavigateToChild: () => void;
  onSelectElement: () => void;
}

/**
 * Hook that handles keyboard shortcuts for DOM context selector
 * @param isActive - Whether the keyboard shortcuts should be active
 * @param handlers - Callback handlers for each keyboard action
 */
export function useDOMSelectorKeyboard(
  isActive: boolean,
  handlers: DOMSelectorKeyboardHandlers,
) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Navigate to parent (Alt + Up Arrow)
      if (
        domSelectorHotkeyDefinitions[
          DOMSelectorHotkeyActions.NAVIGATE_TO_PARENT
        ].isEventMatching(event)
      ) {
        event.preventDefault();
        event.stopPropagation();
        handlers.onNavigateToParent();
      }
      // Navigate to child (Alt + Down Arrow)
      else if (
        domSelectorHotkeyDefinitions[
          DOMSelectorHotkeyActions.NAVIGATE_TO_CHILD
        ].isEventMatching(event)
      ) {
        event.preventDefault();
        event.stopPropagation();
        handlers.onNavigateToChild();
      }
      // Select element (Alt + Enter)
      else if (
        domSelectorHotkeyDefinitions[
          DOMSelectorHotkeyActions.SELECT_ELEMENT
        ].isEventMatching(event)
      ) {
        event.preventDefault();
        event.stopPropagation();
        handlers.onSelectElement();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, handlers]);
}
