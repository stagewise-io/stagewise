import { serializeElement } from '@/utils';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

interface ContextElementsState {
  highlightedElement: Element | null;
  selectedElements: Element[];
}

const ContextElementsContext = createContext<ContextElementsState>({
  highlightedElement: null,
  selectedElements: [],
});

export const useContextElements = () => useContext(ContextElementsContext);

export const ContextElementProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [highlightedElement, setHighlightedElement] = useState<Element | null>(
    null,
  );
  const [selectedElements, setSelectedElements] = useState<Element[]>([]);

  useEffect(() => {
    window.__CTX_SELECTION_UPDATE__ = (
      element: Element,
      type: 'hover' | 'selected',
      active: boolean,
    ) => {
      console.log('[Preload] Context Selection Update', type, active);
      if (type === 'hover') {
        setHighlightedElement(active ? element : null);
      } else if (type === 'selected') {
        setSelectedElements((prev) => {
          if (active) {
            // Avoid duplicates
            return prev.includes(element) ? prev : [...prev, element];
          }
          return prev.filter((e) => e !== element);
        });
      }
    };

    window.__CTX_EXTRACT_INFO__ = (element: Element, backendNodeId: number) => {
      console.log(
        '[Preload] Context Element Extracted',
        element,
        backendNodeId,
      );
      return serializeElement(element, backendNodeId);
    };

    console.log('[Preload] Context Selection Agent Ready');

    return () => {
      window.__CTX_SELECTION_UPDATE__ = undefined;
    };
  }, []);

  return (
    <ContextElementsContext.Provider
      value={{ highlightedElement, selectedElements }}
    >
      {children}
    </ContextElementsContext.Provider>
  );
};
