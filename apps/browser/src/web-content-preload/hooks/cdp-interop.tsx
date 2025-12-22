import { serializeElement } from '@/utils';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

interface SelectedElementsState {
  highlightedElement: Element | null;
  selectedElements: Element[];
}

const SelectedElementsContext = createContext<SelectedElementsState>({
  highlightedElement: null,
  selectedElements: [],
});

export const useSelectedElements = () => useContext(SelectedElementsContext);

export const SelectedElementsProvider = ({
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
      return serializeElement(element, backendNodeId);
    };

    return () => {
      window.__CTX_SELECTION_UPDATE__ = undefined;
    };
  }, []);

  return (
    <SelectedElementsContext.Provider
      value={{ highlightedElement, selectedElements }}
    >
      {children}
    </SelectedElementsContext.Provider>
  );
};
