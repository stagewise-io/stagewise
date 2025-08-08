import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { useChatState } from './use-chat-state.js';

interface ContextChipHoverState {
  hoveredElement: HTMLElement | null;
  setHoveredElement: (element: HTMLElement | null) => void;
}

const ContextChipHoverContext = createContext<
  ContextChipHoverState | undefined
>(undefined);

export function ContextChipHoverProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(
    null,
  );
  const { domContextElements } = useChatState();

  // Clear hover state if the hovered element is no longer in the context
  useEffect(() => {
    if (hoveredElement) {
      const isElementStillInContext = domContextElements.some(
        (contextEl) => contextEl.element === hoveredElement,
      );
      if (!isElementStillInContext) {
        setHoveredElement(null);
      }
    }
  }, [hoveredElement, domContextElements]);

  return (
    <ContextChipHoverContext.Provider
      value={{ hoveredElement, setHoveredElement }}
    >
      {children}
    </ContextChipHoverContext.Provider>
  );
}

export function useContextChipHover() {
  const context = useContext(ContextChipHoverContext);
  if (context === undefined) {
    throw new Error(
      'useContextChipHover must be used within a ContextChipHoverProvider',
    );
  }
  return context;
}
