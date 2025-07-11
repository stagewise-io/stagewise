import { useCallback, useState } from 'react';
import { ElementSelector } from './element-selector';
import { useChatState } from '@/hooks/use-chat-state';
import { HoveredItem } from './hovered-item';
import { useContextChipHover } from '@/hooks/use-context-chip-hover';
import { ChipHoveredItem } from './chip-hovered-item';

export function DOMContextSelector() {
  const {
    domContextElements,
    addChatDomContext,
    isPromptCreationActive,
    promptState,
  } = useChatState();

  const shouldShow = isPromptCreationActive && promptState !== 'loading';

  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(
    null,
  );

  const { hoveredElement: chipHoveredElement } = useContextChipHover();

  const handleElementSelected = useCallback(
    (el: HTMLElement) => {
      // Check if element is already selected
      const existingElement = domContextElements.find(
        (contextEl) => contextEl.element === el,
      );

      if (existingElement) {
        // If already selected, remove it
        return; // The SelectedItem component handles deletion via click
      } else {
        // If not selected, add it
        addChatDomContext(el);
      }
    },
    [addChatDomContext, domContextElements],
  );

  // Check if the hovered element is already selected
  const hoveredSelectedElement = hoveredElement
    ? domContextElements.find((el) => el.element === hoveredElement)
    : null;

  if (!shouldShow) return null;
  return (
    <>
      {/* Show blue proposal overlay for new elements */}
      {hoveredElement && !hoveredSelectedElement && (
        <HoveredItem refElement={hoveredElement} />
      )}

      {chipHoveredElement && (
        <ChipHoveredItem refElement={chipHoveredElement} />
      )}

      <ElementSelector
        ignoreList={[]} // Remove ignore list to allow hovering over selected elements
        onElementHovered={setHoveredElement}
        onElementSelected={handleElementSelected}
        onElementUnhovered={() => setHoveredElement(null)}
      />
    </>
  );
}
