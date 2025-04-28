import { useAppState } from "@/hooks/use-app-state";
import { cn } from "@/utils";
import { type VNode } from "preact";
import { ToolbarDraggableBox } from "./draggable-box";
import { useCallback } from "preact/compat";
import { useRef, useState } from "preact/hooks";
import { HTMLAttributes } from "preact/compat";
import { DraggableProvider } from "@/hooks/use-draggable";

export function ToolbarArea() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="absolute size-full" ref={containerRef}>
      <DraggableProvider
        containerRef={containerRef}
        snapAreas={{
          topLeft: true,
          topCenter: true,
          topRight: true,
          centerLeft: true,
          center: true,
          centerRight: true,
          bottomLeft: true,
          bottomCenter: true,
          bottomRight: true,
        }}
      >
        <ToolbarDraggableBox />
      </DraggableProvider>
    </div>
  );
}
