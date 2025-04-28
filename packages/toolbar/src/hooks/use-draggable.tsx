import { ComponentChildren, createContext, RefObject } from "preact";
import {
  useState,
  useEffect,
  useContext,
  useRef,
  MutableRef,
} from "preact/hooks";

interface DraggableContextType {
  borderLocation: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  snapAreas: {
    topLeft: boolean;
    topCenter: boolean;
    topRight: boolean;
    centerLeft: boolean;
    center: boolean;
    centerRight: boolean;
    bottomLeft: boolean;
    bottomCenter: boolean;
    bottomRight: boolean;
  };
}

const DraggableContext = createContext<DraggableContextType | null>(null);

export const DraggableProvider = ({
  containerRef,
  children,
  snapAreas,
}: {
  containerRef: RefObject<HTMLElement>;
  children: ComponentChildren;
  snapAreas: DraggableContextType["snapAreas"];
}) => {
  const [borderLocation, setBorderLocation] = useState({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const updateBorderLocation = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      setBorderLocation({
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
      });
    };

    // Initial update
    updateBorderLocation();

    // Create ResizeObserver to track size changes
    const resizeObserver = new ResizeObserver(updateBorderLocation);
    resizeObserver.observe(containerRef.current);

    // Track scroll events on window and all parent elements
    const handleScroll = () => {
      requestAnimationFrame(updateBorderLocation);
    };

    window.addEventListener("scroll", handleScroll, true);

    // Find all scrollable parents and add scroll listeners
    let parent = containerRef.current.parentElement;
    while (parent) {
      parent.addEventListener("scroll", handleScroll);
      parent = parent.parentElement;
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", handleScroll, true);

      // Clean up parent scroll listeners
      parent = containerRef.current?.parentElement;
      while (parent) {
        parent.removeEventListener("scroll", handleScroll);
        parent = parent.parentElement;
      }
    };
  }, [containerRef]);

  return (
    <DraggableContext.Provider value={{ borderLocation, snapAreas }}>
      {children}
    </DraggableContext.Provider>
  );
};

export interface IDraggable {
  draggableRef: MutableRef<HTMLElement | null>;
  isDragging: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  position: {
    snapArea: keyof DraggableContextType["snapAreas"] | null;
    isTopHalf: boolean;
    isLeftHalf: boolean;
  };
}

export interface DraggableConfig {
  startThreshold?: number;
  areaSnapThreshold?: number;
  areaBorderSnap?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  initialSnapArea?: keyof DraggableContextType["snapAreas"];
}

export function useDraggable(config?: DraggableConfig): IDraggable {
  const context = useContext(DraggableContext);
  if (!context) {
    throw new Error("useDraggable must be used within a DraggableProvider");
  }

  const {
    startThreshold = 5,
    areaSnapThreshold = 20,
    areaBorderSnap = true,
    onDragStart,
    onDragEnd,
    initialSnapArea,
  } = config || {};

  const draggableRef = useRef<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const transformRef = useRef({ x: 0, y: 0 });
  const [position, setPosition] = useState({
    snapArea: null as keyof DraggableContextType["snapAreas"] | null,
    isTopHalf: true,
    isLeftHalf: true,
  });
  const dragStartRef = useRef<{
    x: number;
    y: number;
    elementX: number;
    elementY: number;
  } | null>(null);

  // Apply necessary styles to the draggable element
  const applyDraggableStyles = (element: HTMLElement) => {
    element.style.position = "absolute";
    element.style.left = "0";
    element.style.top = "0";
    element.style.transform = "translate(0px, 0px)";
    element.style.cursor = "move";
    element.style.userSelect = "none";
    element.style.touchAction = "none";
  };

  // Apply styles whenever the ref changes
  useEffect(() => {
    if (draggableRef.current) {
      applyDraggableStyles(draggableRef.current);
    }
  }, [draggableRef.current]);

  // Calculate position as percentage within container
  const calculatePosition = (x: number, y: number) => {
    if (!draggableRef.current || !context) return { x: 0, y: 0 };

    const containerWidth =
      context.borderLocation.right - context.borderLocation.left;
    const containerHeight =
      context.borderLocation.bottom - context.borderLocation.top;

    console.log("[useDraggable] Container dimensions:", {
      width: containerWidth,
      height: containerHeight,
      borders: context.borderLocation,
    });

    // Calculate percentage position relative to container
    const xPercent = ((x - context.borderLocation.left) / containerWidth) * 100;
    const yPercent = ((y - context.borderLocation.top) / containerHeight) * 100;

    console.log("[useDraggable] Position calculation:", {
      inputX: x,
      inputY: y,
      containerLeft: context.borderLocation.left,
      containerTop: context.borderLocation.top,
      xPercent,
      yPercent,
    });

    // Clamp values between 0 and 100
    return {
      x: Math.max(0, Math.min(100, xPercent)),
      y: Math.max(0, Math.min(100, yPercent)),
    };
  };

  // Check if position is near a snap area
  const checkSnapAreas = (x: number, y: number) => {
    if (!context) return null;

    const snapDistances = {
      topLeft: Math.hypot(x - 0, y - 0),
      topCenter: Math.hypot(x - 50, y - 0),
      topRight: Math.hypot(x - 100, y - 0),
      centerLeft: Math.hypot(x - 0, y - 50),
      center: Math.hypot(x - 50, y - 50),
      centerRight: Math.hypot(x - 100, y - 50),
      bottomLeft: Math.hypot(x - 0, y - 100),
      bottomCenter: Math.hypot(x - 50, y - 100),
      bottomRight: Math.hypot(x - 100, y - 100),
    };

    // Find the closest enabled snap area
    let closestArea: keyof typeof snapDistances | null = null;
    let minDistance = areaSnapThreshold;

    Object.entries(snapDistances).forEach(([area, distance]) => {
      if (
        context.snapAreas[area as keyof typeof context.snapAreas] &&
        distance < minDistance
      ) {
        minDistance = distance;
        closestArea = area as keyof typeof snapDistances;
      }
    });

    if (closestArea) {
      const [vertical, horizontal] = closestArea.split(/(?=[A-Z])/);
      return {
        x: horizontal === "Left" ? 0 : horizontal === "Right" ? 100 : 50,
        y: vertical === "Top" ? 0 : vertical === "Bottom" ? 100 : 50,
      };
    }

    return null;
  };

  // Check if position is near borders
  const checkBorders = (x: number, y: number) => {
    const snapped = {
      top: y <= areaSnapThreshold,
      left: x <= areaSnapThreshold,
      right: x >= 100 - areaSnapThreshold,
      bottom: y >= 100 - areaSnapThreshold,
    };

    return {
      x: snapped.left ? 0 : snapped.right ? 100 : x,
      y: snapped.top ? 0 : snapped.bottom ? 100 : y,
      snapped,
    };
  };

  // Update element position using CSS transform
  const updateElementPosition = (
    x: number,
    y: number,
    snapArea: keyof DraggableContextType["snapAreas"] | null = null
  ) => {
    if (!draggableRef.current) return;

    const containerWidth =
      context.borderLocation.right - context.borderLocation.left;
    const containerHeight =
      context.borderLocation.bottom - context.borderLocation.top;

    const translateX = (x / 100) * containerWidth;
    const translateY = (y / 100) * containerHeight;

    console.log("[useDraggable] Applying transform:", {
      x,
      y,
      translateX,
      translateY,
      containerWidth,
      containerHeight,
    });

    draggableRef.current.style.transform = `translate(${translateX}px, ${translateY}px)`;
    transformRef.current = { x, y };

    // Update position information
    const newPosition = {
      snapArea,
      isTopHalf: y < 50,
      isLeftHalf: x < 50,
    };

    setPosition(newPosition);
  };

  // Initialize position if initialSnapArea is provided
  useEffect(() => {
    if (initialSnapArea && context.snapAreas[initialSnapArea]) {
      console.log(
        "[useDraggable] Initializing position to snap area:",
        initialSnapArea
      );
      const [vertical, horizontal] = initialSnapArea.split(/(?=[A-Z])/);
      const x = horizontal === "Left" ? 0 : horizontal === "Right" ? 100 : 50;
      const y = vertical === "Top" ? 0 : vertical === "Bottom" ? 100 : 50;
      updateElementPosition(x, y, initialSnapArea);
    }
  }, [initialSnapArea]);

  // Handle mouse down
  const handleMouseDown = (e: MouseEvent) => {
    if (!draggableRef.current) return;

    console.log("[useDraggable] Mouse down event:", {
      clientX: e.clientX,
      clientY: e.clientY,
      currentPosition: transformRef.current,
      containerBorders: context.borderLocation,
    });

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      elementX: transformRef.current.x,
      elementY: transformRef.current.y,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      // Check if we've moved enough to start dragging
      if (!isDragging && Math.hypot(deltaX, deltaY) > startThreshold) {
        console.log("[useDraggable] Drag started:", {
          deltaX,
          deltaY,
          threshold: startThreshold,
          startPosition: dragStartRef.current,
        });
        setIsDragging(true);
        onDragStart?.();
      }

      if (isDragging) {
        const newPosition = calculatePosition(e.clientX, e.clientY);

        console.log("[useDraggable] Mouse move:", {
          clientX: e.clientX,
          clientY: e.clientY,
          calculatedPosition: newPosition,
        });

        // Check for snap areas first
        const snapArea = checkSnapAreas(newPosition.x, newPosition.y);
        if (snapArea) {
          const snapAreaKey = Object.entries(context.snapAreas).find(
            ([key, enabled]) => {
              if (!enabled) return false;
              const [vertical, horizontal] = key.split(/(?=[A-Z])/);
              const x =
                horizontal === "Left" ? 0 : horizontal === "Right" ? 100 : 50;
              const y =
                vertical === "Top" ? 0 : vertical === "Bottom" ? 100 : 50;
              return x === snapArea.x && y === snapArea.y;
            }
          )?.[0] as keyof DraggableContextType["snapAreas"] | undefined;

          console.log("[useDraggable] Snapped to area:", {
            snapArea: snapAreaKey,
            position: snapArea,
          });

          updateElementPosition(snapArea.x, snapArea.y, snapAreaKey || null);
          return;
        }

        // Then check borders if areaBorderSnap is enabled
        if (areaBorderSnap) {
          const { x, y } = checkBorders(newPosition.x, newPosition.y);
          console.log("[useDraggable] Border snap:", {
            x,
            y,
            originalX: newPosition.x,
            originalY: newPosition.y,
          });
          updateElementPosition(x, y, null);
          return;
        }

        // If no snapping, use the calculated position
        console.log("[useDraggable] Free movement:", {
          x: newPosition.x,
          y: newPosition.y,
        });
        updateElementPosition(newPosition.x, newPosition.y, null);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        console.log("[useDraggable] Drag ended:", {
          finalPosition: transformRef.current,
          snapArea: position.snapArea,
        });
        onDragEnd?.();
      }
      setIsDragging(false);
      dragStartRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Set up mouse down listener
  useEffect(() => {
    const element = draggableRef.current;
    if (!element) return;

    element.addEventListener("mousedown", handleMouseDown);
    return () => {
      element.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isDragging]);

  // Handle window resize and scroll
  useEffect(() => {
    if (!isDragging) return;

    const handleResize = () => {
      if (!draggableRef.current) return;
      const rect = draggableRef.current.getBoundingClientRect();
      const newPosition = calculatePosition(rect.left, rect.top);

      console.log("[useDraggable] Container resized:", {
        newPosition,
        currentPosition: transformRef.current,
      });

      // Recheck snap areas and borders after resize
      const snapArea = checkSnapAreas(newPosition.x, newPosition.y);
      if (snapArea) {
        const snapAreaKey = Object.entries(context.snapAreas).find(
          ([key, enabled]) => {
            if (!enabled) return false;
            const [vertical, horizontal] = key.split(/(?=[A-Z])/);
            const x =
              horizontal === "Left" ? 0 : horizontal === "Right" ? 100 : 50;
            const y = vertical === "Top" ? 0 : vertical === "Bottom" ? 100 : 50;
            return x === snapArea.x && y === snapArea.y;
          }
        )?.[0] as keyof DraggableContextType["snapAreas"] | undefined;

        console.log("[useDraggable] Resize snap to area:", {
          snapArea: snapAreaKey,
          position: snapArea,
        });

        updateElementPosition(snapArea.x, snapArea.y, snapAreaKey || null);
        return;
      }

      if (areaBorderSnap) {
        const { x, y } = checkBorders(newPosition.x, newPosition.y);
        console.log("[useDraggable] Resize border snap:", {
          x,
          y,
          originalX: newPosition.x,
          originalY: newPosition.y,
        });
        updateElementPosition(x, y, null);
        return;
      }

      updateElementPosition(newPosition.x, newPosition.y, null);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [isDragging, areaBorderSnap]);

  return {
    draggableRef,
    isDragging,
    onDragStart,
    onDragEnd,
    position,
  };
}
