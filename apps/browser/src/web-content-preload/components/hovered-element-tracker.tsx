import { useEffect, useRef } from 'react';
import { useContextElements } from '../hooks/cdp-interop';
import { useKartonProcedure } from '../hooks/karton';

const elementIds = new WeakMap<Element, string>();
let idCounter = 0;

function getUniqueId(element: Element): string {
  if (!elementIds.has(element)) {
    elementIds.set(element, `el-${++idCounter}`);
  }
  return elementIds.get(element)!;
}

export function HoveredElementTracker() {
  const { highlightedElement, selectedElements } = useContextElements();
  const putIntoBackground = useKartonProcedure((s) => s.putIntoBackground);

  return (
    <>
      {selectedElements.map((element) => (
        <ElementOverlay
          key={getUniqueId(element)}
          element={element}
          onHover={putIntoBackground}
          style="selected"
        />
      ))}

      {highlightedElement && (
        <ElementOverlay
          element={highlightedElement}
          onHover={putIntoBackground}
          style="hovered"
        />
      )}
    </>
  );
}

function ElementOverlay({
  element,
  style,
  onHover,
}: {
  element: Element;
  style: 'hovered' | 'selected';
  onHover: () => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const lastDrawTimeRef = useRef<number>(0);

  useEffect(() => {
    const update = (time: number) => {
      // Throttle to 10fps (approx 100ms)
      if (time - lastDrawTimeRef.current < 100) {
        requestRef.current = requestAnimationFrame(update);
        return;
      }
      lastDrawTimeRef.current = time;

      if (divRef.current && element) {
        const rect = element.getBoundingClientRect();
        divRef.current.style.top = `${rect.top}px`;
        divRef.current.style.left = `${rect.left}px`;
        divRef.current.style.width = `${rect.width}px`;
        divRef.current.style.height = `${rect.height}px`;
      }

      requestRef.current = requestAnimationFrame(update);
    };

    requestRef.current = requestAnimationFrame(update);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [element]);

  return (
    <div
      ref={divRef}
      onMouseEnter={onHover}
      className={style === 'hovered' ? 'hovered-element' : 'selected-element'}
    >
      <div className="tag-name">{element.tagName.toLowerCase()}</div>
    </div>
  );
}
