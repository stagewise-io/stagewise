import { type ComponentChildren, createContext, type RefObject } from 'preact';
import {
  useState,
  useEffect,
  useContext,
  useRef,
  type MutableRef,
  useCallback,
} from 'preact/hooks';

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
  snapAreas: DraggableContextType['snapAreas'];
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

    window.addEventListener('scroll', handleScroll, true);

    // Find all scrollable parents and add scroll listeners
    let parent = containerRef.current.parentElement;
    while (parent) {
      parent.addEventListener('scroll', handleScroll);
      parent = parent.parentElement;
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', handleScroll, true);

      // Clean up parent scroll listeners
      parent = containerRef.current?.parentElement;
      while (parent) {
        parent.removeEventListener('scroll', handleScroll);
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
    snapArea: keyof DraggableContextType['snapAreas'] | null;
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
  initialSnapArea?: keyof DraggableContextType['snapAreas'];
}

export function useDraggable(config: {
  startThreshold?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const providerData = useContext(DraggableContext);
  const latestProviderDataRef = useRef(providerData);

  useEffect(() => {
    latestProviderDataRef.current = providerData;
  }, [providerData]);

  // Renamed from draggableRef to movingElementRef for internal clarity
  const movingElementRef = useRef<HTMLElement | null>(null);
  // New ref for the drag handle initiator
  const dragInitiatorRef = useRef<HTMLElement | null>(null);

  // State to hold the actual DOM nodes to trigger effect updates
  const [movingElementNode, setMovingElementNode] =
    useState<HTMLElement | null>(null);
  const [dragInitiatorNode, setDragInitiatorNode] =
    useState<HTMLElement | null>(null);

  const initialDraggableViewportPosRef = useRef<{
    x: number;
    y: number;
  } | null>(null);
  const mouseAndDraggablePosDeltaRef = useRef<{ x: number; y: number } | null>(
    null,
  );
  const draggableTargetPosRef = useRef<{ x: number; y: number } | null>(null);
  const draggableReachedTargetPosRef = useRef(false);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const currentMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  const { startThreshold = 3, onDragStart, onDragEnd } = config;

  const updateDraggablePosition = useCallback(() => {
    if (
      !movingElementRef.current ||
      !currentMousePosRef.current ||
      !mouseAndDraggablePosDeltaRef.current
    )
      return;

    // Calculate the new target viewport position of the draggable element
    draggableTargetPosRef.current = {
      x:
        currentMousePosRef.current!.x - mouseAndDraggablePosDeltaRef.current!.x,
      y:
        currentMousePosRef.current!.y - mouseAndDraggablePosDeltaRef.current!.y,
    };

    const draggableEl = movingElementRef.current!;
    const elStyle = draggableEl.style;

    // Get current visual position for comparison later
    const currentRect = draggableEl.getBoundingClientRect();
    const targetViewportX = draggableTargetPosRef.current!.x;
    const targetViewportY = draggableTargetPosRef.current!.y;

    // Check if the draggable element is at the target position
    draggableReachedTargetPosRef.current =
      Math.round(currentRect.left) === Math.round(targetViewportX) &&
      Math.round(currentRect.top) === Math.round(targetViewportY);

    // Log if the current position is not the same as the target position
    if (!draggableReachedTargetPosRef.current) {
      console.log(
        'Targeting new position. Rounded Target Viewport X/Y:',
        Math.round(targetViewportX),
        Math.round(targetViewportY),
        'Current Viewport Left/Top:',
        Math.round(currentRect.left),
        Math.round(currentRect.top),
      );
    }

    // Start of new positioning logic
    const draggableWidth = draggableEl.offsetWidth;
    const draggableHeight = draggableEl.offsetHeight;
    const offsetParent = draggableEl.offsetParent as HTMLElement | null;

    let parentViewportLeft = 0;
    let parentViewportTop = 0;
    let parentWidth = window.innerWidth;
    let parentHeight = window.innerHeight;

    if (offsetParent) {
      const opRect = offsetParent.getBoundingClientRect();
      parentViewportLeft = opRect.left;
      parentViewportTop = opRect.top;
      parentWidth = offsetParent.offsetWidth;
      parentHeight = offsetParent.offsetHeight;
    }
    // End of new positioning logic preamble - actual style application to come next

    // Clear previous positioning styles
    elStyle.left = '';
    elStyle.right = '';
    elStyle.top = '';
    elStyle.bottom = '';

    const currentProviderData = latestProviderDataRef.current;
    if (currentProviderData) {
      const containerRect = currentProviderData.borderLocation;
      const targetAbsCenterX = targetViewportX + draggableWidth / 2;
      const targetAbsCenterY = targetViewportY + draggableHeight / 2;

      const containerAbsCenterX =
        (containerRect.left + containerRect.right) / 2;
      const containerAbsCenterY =
        (containerRect.top + containerRect.bottom) / 2;

      const isInLeftHalf = targetAbsCenterX < containerAbsCenterX;
      const isInTopHalf = targetAbsCenterY < containerAbsCenterY;

      if (isInLeftHalf) {
        elStyle.left = `${Math.round(targetViewportX - parentViewportLeft)}px`;
      } else {
        const parentAbsRight = parentViewportLeft + parentWidth;
        const draggableAbsRight = targetViewportX + draggableWidth;
        elStyle.right = `${Math.round(parentAbsRight - draggableAbsRight)}px`;
      }

      if (isInTopHalf) {
        elStyle.top = `${Math.round(targetViewportY - parentViewportTop)}px`;
      } else {
        const parentAbsBottom = parentViewportTop + parentHeight;
        const draggableAbsBottom = targetViewportY + draggableHeight;
        elStyle.bottom = `${Math.round(parentAbsBottom - draggableAbsBottom)}px`;
      }
    } else {
      // Fallback: if no providerData, position relative to offsetParent (or viewport for fixed)
      // using left/top only.
      console.warn(
        'useDraggable: DraggableProvider context not available. Using basic positioning.',
      );
      elStyle.left = `${Math.round(targetViewportX - parentViewportLeft)}px`;
      elStyle.top = `${Math.round(targetViewportY - parentViewportTop)}px`;
    }

    // If dragging, or if the element hasn't reached its final target position after mouse up,
    // continue animating.
    if (isDraggingRef.current) {
      requestAnimationFrame(updateDraggablePosition);
    }
  }, []);

  // This will be listened to globally if the mouse was pressed down on the draggable element
  const mouseUpHandler = useCallback(
    (e: MouseEvent) => {
      if (isDraggingRef.current && onDragEnd) {
        onDragEnd();
      }
      mouseDownPosRef.current = null;
      isDraggingRef.current = false;
      console.log('Stop moving');
      window.removeEventListener('mousemove', mouseMoveHandler, {
        capture: true,
      });
      window.removeEventListener('mouseup', mouseUpHandler, {
        capture: true,
      });
      if (movingElementRef.current) {
        movingElementRef.current.style.userSelect = '';
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    },
    [onDragEnd],
  );

  // This will be listened to globally if the mouse was pressed down on the draggable element
  const mouseMoveHandler = useCallback(
    (e: MouseEvent) => {
      if (!mouseDownPosRef.current) return;

      const distance = Math.hypot(
        e.clientX - mouseDownPosRef.current!.x,
        e.clientY - mouseDownPosRef.current!.y,
      );
      if (distance > startThreshold && !isDraggingRef.current) {
        isDraggingRef.current = true;
        if (movingElementRef.current) {
          movingElementRef.current.style.userSelect = 'none';
        }
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        if (onDragStart) {
          onDragStart();
        }
        requestAnimationFrame(updateDraggablePosition);
        console.log('Start dragging');
      }

      currentMousePosRef.current = { x: e.clientX, y: e.clientY };
    },
    [startThreshold, onDragStart, updateDraggablePosition],
  );

  // This is attached to the draggable item or its handle
  const mouseDownHandler = useCallback(
    (e: MouseEvent) => {
      console.log('Mouse down on draggable/handle area');

      // Only proceed if it's the main mouse button (usually left-click)
      if (e.button !== 0) {
        return;
      }

      const handleNode = dragInitiatorRef.current;
      const draggableItemNode = movingElementRef.current;

      if (handleNode) {
        // A specific handle is defined. Drag only if the mousedown is ON the handle itself.
        if (e.target !== handleNode) {
          console.log(
            'Mousedown was not directly on the handle element. Current target:',
            e.target,
            'Expected handle:',
            handleNode,
            'Ignoring drag start.',
          );
          return;
        }
      } else {
        // No specific handle. The draggable item is its own handle.
        // Drag only if the mousedown is ON the draggable item itself.
        if (e.target !== draggableItemNode) {
          console.log(
            'Mousedown was not directly on the draggable item (no handle specified). Current target:',
            e.target,
            'Expected draggable item:',
            draggableItemNode,
            'Ignoring drag start.',
          );
          return;
        }
      }

      // If we've reached here, the click was on the correct drag-initiating element.
      console.log('Valid drag target. Proceeding with drag setup.');

      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

      if (!movingElementRef.current) {
        console.error('Draggable element ref not set in mouseDownHandler');
        return;
      }
      const rect = movingElementRef.current!.getBoundingClientRect();
      initialDraggableViewportPosRef.current = {
        x: rect.left,
        y: rect.top,
      };
      mouseAndDraggablePosDeltaRef.current = {
        x:
          mouseDownPosRef.current!.x -
          initialDraggableViewportPosRef.current!.x,
        y:
          mouseDownPosRef.current!.y -
          initialDraggableViewportPosRef.current!.y,
      };
      window.addEventListener('mousemove', mouseMoveHandler, {
        capture: true,
      });
      window.addEventListener('mouseup', mouseUpHandler, {
        capture: true,
      });
    },
    [mouseMoveHandler, mouseUpHandler],
  );

  useEffect(() => {
    const elementToListenOn = dragInitiatorNode || movingElementNode;

    if (elementToListenOn) {
      elementToListenOn.addEventListener('mousedown', mouseDownHandler);
    }

    return () => {
      if (elementToListenOn) {
        elementToListenOn.removeEventListener('mousedown', mouseDownHandler);
      }
      // Cleanup if hook unmounts or elementToListenOn changes mid-drag
      if (isDraggingRef.current) {
        if (onDragEnd) {
          onDragEnd();
        }
        isDraggingRef.current = false;
        if (movingElementNode) {
          // Reset styles on the MOVED element
          movingElementNode.style.userSelect = '';
        }
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        // Clean up global listeners
        window.removeEventListener('mousemove', mouseMoveHandler, {
          capture: true,
        });
        window.removeEventListener('mouseup', mouseUpHandler, {
          capture: true,
        });
      }
    };
  }, [
    movingElementNode,
    dragInitiatorNode,
    mouseDownHandler,
    onDragEnd,
    mouseMoveHandler,
    mouseUpHandler,
  ]);

  const draggableRefCallback = useCallback((node: HTMLElement | null) => {
    setMovingElementNode(node);
    movingElementRef.current = node;
  }, []);

  const handleRefCallback = useCallback((node: HTMLElement | null) => {
    setDragInitiatorNode(node);
    dragInitiatorRef.current = node;
  }, []);

  return {
    draggableRef: draggableRefCallback,
    handleRef: handleRefCallback,
  };
}
