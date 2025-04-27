import { useAppState } from "@/hooks/use-app-state";
import { cn } from "@/utils";
import { type VNode } from "preact";
import { ToolbarDraggableBox } from "./draggable-box";
import { useCallback } from "preact/compat";
import { useState } from "preact/hooks";
import { HTMLAttributes } from "preact/compat";
import { DropAreaZone } from "./drop-zones";

const dropAreaStyles: Record<number, string> = {
  [DropAreaZone.TOP_LEFT]: "left-4 top-4 items-start justify-start",
  [DropAreaZone.TOP_CENTER]:
    "left-1/2 top-4 -translate-x-1/2 items-start justify-center",
  [DropAreaZone.TOP_RIGHT]: "right-4 top-4 items-start justify-end",
  [DropAreaZone.BOTTOM_LEFT]: "bottom-4 left-4 items-end justify-start",
  [DropAreaZone.BOTTOM_CENTER]:
    "bottom-4 left-1/2 -translate-x-1/2 items-end justify-center",
  [DropAreaZone.BOTTOM_RIGHT]: "bottom-4 right-4 items-end justify-end",
};

export function ToolbarArea() {
  const [dragging, setDragging] = useState(false);

  const toolbarPosition = useAppState((state) => state.toolbarPosition);
  const setToolbarPosition = useAppState((state) => state.setToolbarPosition);

  return (
    <div className="absolute size-full">
      <ToolbarDropBlurBackground />

      {Object.values(DropAreaZone)
        .filter((z) => !isNaN(Number(z)))
        .map((dropArea, index) => (
          <ToolbarDropZone
            key={index}
            dropZoneId={dropArea}
            className={dropAreaStyles[dropArea]}
          >
            {!dragging && toolbarPosition === dropArea ? (
              <ToolbarDraggableBox />
            ) : null}
          </ToolbarDropZone>
        ))}
    </div>
  );
}

function ToolbarDropBlurBackground() {
  const [showBlurBackground, setShowBlurBackground] = useState(false);

  const dragStartHandler = useCallback(() => {
    setShowBlurBackground(true);
  }, []);

  const dragEndHandler = useCallback(() => {
    setShowBlurBackground(false);
  }, []);

  return (
    <div
      className={`bg-gradient-light-1/40 fixed inset-0 flex items-center justify-center rounded-lg p-8 shadow-lg backdrop-blur-lg transition-all ${
        showBlurBackground ? "opacity-100" : "opacity-0"
      }`}
    >
      <span className="text-xl font-medium text-foreground/50">
        Drag and drop the toolbar in a position your prefer.
      </span>
    </div>
  );
}

function ToolbarDropZone({
  children,
  dropZoneId,
  ...props
}: {
  children?: VNode;
  dropZoneId: string | number;
} & HTMLAttributes<HTMLDivElement>) {
  const [dragging, setDragging] = useState(false);

  const dragStartHandler = useCallback(() => {
    setDragging(true);
  }, []);

  const dragEndHandler = useCallback(() => {
    setDragging(false);
  }, []);

  const isOver = true;

  return (
    <div
      {...props}
      className={cn("absolute flex flex-row transition-all", props.className)}
    >
      <div
        className={cn(
          "absolute size-full transition-all duration-500",
          !dragging && "opacity-0",
          isOver
            ? "h-24 w-48 rounded-2xl bg-stagewise-400/50 shadow-md shadow-indigo-300/50"
            : "h-16 w-32 rounded-xl bg-zinc-500/20"
        )}
      />
      {children}
    </div>
  );
}
