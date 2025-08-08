import {
  type MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useChatState } from '@/hooks/use-chat-state';
import { HoveredItem } from './hovered-item.js';
import { useContextChipHover } from '@/hooks/use-context-chip-hover';
import { SelectedItem } from './selected-item.js';
import { cn, getElementAtPoint, getXPathForElement } from '@/utils';

export function DOMContextSelector() {
  const {
    domContextElements,
    addChatDomContext,
    isPromptCreationActive,
    removeChatDomContext,
  } = useChatState();

  const shouldShow = isPromptCreationActive;

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

  const selectedItems = useMemo(() => {
    return domContextElements.map((el) => el.element);
  }, [domContextElements]);

  const lastHoveredElement = useRef<HTMLElement | null>(null);
  const mouseState = useRef<{
    lastX: number;
    lastY: number;
    velocity: number;
    lastTimestamp: number;
  }>(null);

  const nextUpdateTimeout = useRef<NodeJS.Timeout | null>(null);

  const [hoversAddable, setHoversAddable] = useState(false);

  const updateHoveredElement = useCallback(() => {
    if (!mouseState.current) return;
    const refElement = getElementAtPoint(
      mouseState.current.lastX,
      mouseState.current.lastY,
    );
    if (selectedItems.includes(refElement)) {
      setHoversAddable(false);
      lastHoveredElement.current = null;
      setHoveredElement(null);
      return;
    }
    if (lastHoveredElement.current !== refElement) {
      lastHoveredElement.current = refElement;
      setHoveredElement(refElement);
      setHoversAddable(true);
    }
  }, [selectedItems]);

  useEffect(() => {
    updateHoveredElement();
  }, [updateHoveredElement]);

  const handleMouseMove = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      // Calculate mouse velocity
      const currentTimestamp = performance.now();

      const deltaX =
        event.clientX - (mouseState.current?.lastX ?? event.clientX);
      const deltaY =
        event.clientY - (mouseState.current?.lastY ?? event.clientY);
      const deltaTime =
        currentTimestamp -
        (mouseState.current?.lastTimestamp ?? currentTimestamp);

      const distance = Math.hypot(deltaX, deltaY);

      mouseState.current = {
        lastX: deltaTime > 0 ? event.clientX : mouseState.current?.lastX,
        lastY: deltaTime > 0 ? event.clientY : mouseState.current?.lastY,
        velocity: deltaTime > 0 ? (distance / deltaTime) * 1000 : 0,
        lastTimestamp: currentTimestamp,
      };

      // If velocity exceeds 30 pixels per second, delay update
      if (mouseState.current?.velocity > 30) {
        if (nextUpdateTimeout.current) {
          clearTimeout(nextUpdateTimeout.current);
        }
        nextUpdateTimeout.current = setTimeout(updateHoveredElement, 1000 / 28);
      } else if (!nextUpdateTimeout.current) {
        nextUpdateTimeout.current = setTimeout(updateHoveredElement, 1000 / 28);
      }
    },
    [updateHoveredElement],
  );

  const handleMouseLeave = useCallback<
    MouseEventHandler<HTMLDivElement>
  >(() => {
    clearTimeout(nextUpdateTimeout.current);
    lastHoveredElement.current = null;
    setHoveredElement(null);
  }, []);

  const handleMouseClick = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!lastHoveredElement.current) return;
      if (selectedItems.includes(lastHoveredElement.current)) return;

      handleElementSelected(lastHoveredElement.current);
    },
    [handleElementSelected, selectedItems],
  );

  if (!shouldShow) return null;
  return (
    <div
      className={cn(
        'pointer-events-auto fixed inset-0 h-screen w-screen',
        hoversAddable ? 'cursor-copy' : 'cursor-default',
      )}
      id="element-selector"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleMouseClick}
      role="button"
      tabIndex={0}
    >
      {/* Show blue proposal overlay for new elements */}
      {hoveredElement && !hoveredSelectedElement && (
        <HoveredItem refElement={hoveredElement} />
      )}

      {domContextElements.map((el) => (
        <SelectedItem
          key={getXPathForElement(el.element, true)}
          refElement={el.element}
          isChipHovered={chipHoveredElement === el.element}
          onRemoveClick={() => removeChatDomContext(el.element)}
        />
      ))}
    </div>
  );
}
