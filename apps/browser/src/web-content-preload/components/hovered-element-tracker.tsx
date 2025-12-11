import { useEffect, useRef } from 'react';
import { useContextElements } from '../hooks/cdp-interop';
import { useKartonProcedure } from '../hooks/karton';

const elementIds = new WeakMap<Element, string>();
let idCounter = 0;

function getUniqueId(element: Element): string {
  if (!elementIds.has(element)) elementIds.set(element, `el-${++idCounter}`);

  return elementIds.get(element)!;
}

export function HoveredElementTracker() {
  const { highlightedElement, selectedElements } = useContextElements();
  const movePanelToForeground = useKartonProcedure(
    (s) => s.movePanelToForeground,
  );

  return (
    <>
      {selectedElements.map((element) => (
        <ElementOverlay
          key={getUniqueId(element)}
          element={element}
          onHover={() => movePanelToForeground('tab-content')}
          style="selected"
        />
      ))}

      {highlightedElement && (
        <ElementOverlay
          element={highlightedElement}
          onHover={() => movePanelToForeground('tab-content')}
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

  const overlayStyles =
    style === 'hovered'
      ? {
          position: 'fixed' as const,
          background: 'oklch(54.6% 0.245 262.881 / 0.1)',
          border: 'solid 2px oklch(54.6% 0.245 262.881 / 0.8)',
          borderRadius: '2px',
        }
      : {
          position: 'fixed' as const,
          background: 'transparent',
          border: 'dashed 2px oklch(14.1% 0.005 285.823 / 0.5)',
          borderRadius: '2px',
        };

  return (
    <div ref={divRef} onMouseEnter={onHover} style={overlayStyles}>
      <div
        style={{
          position: 'absolute',
          top: '-16px',
          left: '0px',
          width: 'fit-content',
          height: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '9px',
          fontWeight: 600,
          textAlign: 'center',
          textOverflow: 'ellipsis',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          borderRadius: '3px',
          padding: '0px 4px',
          boxShadow: '0 0 0 1px oklch(55.2% 0.016 285.938 / 0.3)',
        }}
      >
        {element.tagName.toLowerCase()}
      </div>
    </div>
  );
}
