import { ToolbarDraggableBox } from './toolbar';
import { useRef } from 'preact/hooks';
import { DraggableProvider } from '@/hooks/use-draggable';

export function ToolbarArea() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="absolute size-full">
      <div className="absolute inset-4" ref={containerRef}>
        <DraggableProvider
          containerRef={containerRef}
          snapAreas={{
            topLeft: true,
            topRight: true,
            bottomLeft: true,
            bottomRight: true,
            topCenter: true,
            bottomCenter: true,
          }}
        >
          <ToolbarDraggableBox />
        </DraggableProvider>
      </div>
    </div>
  );
}
