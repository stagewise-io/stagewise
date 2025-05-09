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
  initialRelativeCenter?: { x: number; y: number };
}

export function useDraggable(config: DraggableConfig) {
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

  // New ref for offset between mouse and draggable's center
  const mouseToDraggableCenterOffsetRef = useRef<{
    x: number;
    y: number;
  } | null>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const currentMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  // This ref will store the latest relative center, initialized with the config's
  // initialRelativeCenter, and updated during/after drag operations.
  const persistedRelativeCenterRef = useRef(config.initialRelativeCenter);

  const {
    startThreshold = 3,
    onDragStart,
    onDragEnd,
    // initialRelativeCenter is used to initialize persistedRelativeCenterRef
  } = config;

  const updateDraggablePosition = useCallback(() => {
    const draggableEl = movingElementRef.current;
    if (!draggableEl) return;

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
      parentWidth = offsetParent.offsetWidth || window.innerWidth;
      parentHeight = offsetParent.offsetHeight || window.innerHeight;
    }

    let targetViewportCenterX: number | null = null;
    let targetViewportCenterY: number | null = null;

    // persistedRelativeCenterRef is initialized with config.initialRelativeCenter
    // and is updated during drag operations.
    const currentDesiredRelativeCenter = persistedRelativeCenterRef.current;

    if (
      isDraggingRef.current &&
      mouseToDraggableCenterOffsetRef.current &&
      currentMousePosRef.current
    ) {
      targetViewportCenterX =
        currentMousePosRef.current.x -
        mouseToDraggableCenterOffsetRef.current.x;
      targetViewportCenterY =
        currentMousePosRef.current.y -
        mouseToDraggableCenterOffsetRef.current.y;
    } else {
      // Not dragging: use the persisted or initial relative center
      if (currentDesiredRelativeCenter && parentWidth > 0 && parentHeight > 0) {
        // Determine if the element is in the top/left or bottom/right halves
        const isTopHalf = currentDesiredRelativeCenter.y <= 0.5;
        const isLeftHalf = currentDesiredRelativeCenter.x <= 0.5;

        if (isLeftHalf) {
          const targetCenterXInParent =
            parentWidth * currentDesiredRelativeCenter.x;
          targetViewportCenterX = parentViewportLeft + targetCenterXInParent;
        } else {
          // Relative to right edge
          const targetCenterXInParent =
            parentWidth * (1 - currentDesiredRelativeCenter.x);
          targetViewportCenterX =
            parentViewportLeft + parentWidth - targetCenterXInParent;
        }

        if (isTopHalf) {
          const targetCenterYInParent =
            parentHeight * currentDesiredRelativeCenter.y;
          targetViewportCenterY = parentViewportTop + targetCenterYInParent;
        } else {
          // Relative to bottom edge
          const targetCenterYInParent =
            parentHeight * (1 - currentDesiredRelativeCenter.y);
          targetViewportCenterY =
            parentViewportTop + parentHeight - targetCenterYInParent;
        }
      } else {
        // Cannot position if parent has no dimensions or no center defined.
        // This might happen if config.initialRelativeCenter was undefined and no drag has happened.
        if (
          !movingElementRef.current?.style.left &&
          !movingElementRef.current?.style.top
        ) {
          console.warn(
            'useDraggable: Cannot determine position. Parent has no dimensions or initialRelativeCenter was not effectively set.',
          );
        }
        return;
      }
    }

    if (targetViewportCenterX === null || targetViewportCenterY === null) {
      return;
    }

    // Clamp the position to the provider's boundaries
    const { borderLocation } = latestProviderDataRef.current || {
      borderLocation: undefined,
    };

    if (borderLocation && draggableWidth > 0 && draggableHeight > 0) {
      const providerRectWidth = borderLocation.right - borderLocation.left;
      const providerRectHeight = borderLocation.bottom - borderLocation.top;

      let clampedCenterX = targetViewportCenterX;
      let clampedCenterY = targetViewportCenterY;

      // Handle X-axis clamping
      if (draggableWidth >= providerRectWidth) {
        // If draggable is wider or same width as provider
        clampedCenterX = borderLocation.left + providerRectWidth / 2; // Center it
      } else {
        const minX = borderLocation.left + draggableWidth / 2;
        const maxX = borderLocation.right - draggableWidth / 2;
        clampedCenterX = Math.max(minX, Math.min(clampedCenterX, maxX));
      }

      // Handle Y-axis clamping
      if (draggableHeight >= providerRectHeight) {
        // If draggable is taller or same height as provider
        clampedCenterY = borderLocation.top + providerRectHeight / 2; // Center it
      } else {
        const minY = borderLocation.top + draggableHeight / 2;
        const maxY = borderLocation.bottom - draggableHeight / 2;
        clampedCenterY = Math.max(minY, Math.min(clampedCenterY, maxY));
      }

      targetViewportCenterX = clampedCenterX;
      targetViewportCenterY = clampedCenterY;
    }

    if (
      isDraggingRef.current &&
      parentWidth > 0 &&
      parentHeight > 0
      // targetViewportCenterX and targetViewportCenterY are guaranteed non-null
      // here due to the earlier check and subsequent clamping.
    ) {
      // Persist the new relative center if dragging, using the CLAMPED viewport coordinates
      const newRelativeX =
        (targetViewportCenterX - parentViewportLeft) / parentWidth;
      const newRelativeY =
        (targetViewportCenterY - parentViewportTop) / parentHeight;

      if (Number.isFinite(newRelativeX) && Number.isFinite(newRelativeY)) {
        persistedRelativeCenterRef.current = {
          x: newRelativeX,
          y: newRelativeY,
        };
      }
    }

    const elStyle = draggableEl.style;
    elStyle.right = ''; // Clear right and bottom as we use left/top
    elStyle.bottom = '';
    elStyle.left = '';
    elStyle.top = '';

    // Calculate target top-left for styling, from target viewport center
    const targetElementStyleX = targetViewportCenterX - draggableWidth / 2;
    const targetElementStyleY = targetViewportCenterY - draggableHeight / 2;

    // Determine if the element is in the top/left or bottom/right halves for styling
    // This needs to be re-evaluated for the styling part, especially if not dragging
    // or use a state/ref if these flags are needed elsewhere.
    // For simplicity here, we re-evaluate. If performance becomes an issue, optimize.
    const isTopHalf = currentDesiredRelativeCenter
      ? currentDesiredRelativeCenter.y <= 0.5
      : true; // Default to top if undefined
    const isLeftHalf = currentDesiredRelativeCenter
      ? currentDesiredRelativeCenter.x <= 0.5
      : true; // Default to left if undefined

    if (isLeftHalf) {
      const styleLeftPx = targetElementStyleX - parentViewportLeft;
      elStyle.left =
        parentWidth > 0
          ? `${((styleLeftPx / parentWidth) * 100).toFixed(2)}%`
          : '0px';
      elStyle.right = '';
    } else {
      // Calculate distance from right edge of parent to right edge of element
      const styleRightPx =
        parentViewportLeft +
        parentWidth -
        (targetElementStyleX + draggableWidth);
      elStyle.right =
        parentWidth > 0
          ? `${((styleRightPx / parentWidth) * 100).toFixed(2)}%`
          : '0px';
      elStyle.left = '';
    }

    if (isTopHalf) {
      const styleTopPx = targetElementStyleY - parentViewportTop;
      elStyle.top =
        parentHeight > 0
          ? `${((styleTopPx / parentHeight) * 100).toFixed(2)}%`
          : '0px';
      elStyle.bottom = '';
    } else {
      // Calculate distance from bottom edge of parent to bottom edge of element
      const styleBottomPx =
        parentViewportTop +
        parentHeight -
        (targetElementStyleY + draggableHeight);
      elStyle.bottom =
        parentHeight > 0
          ? `${((styleBottomPx / parentHeight) * 100).toFixed(2)}%`
          : '0px';
      elStyle.top = '';
    }

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
        if (!handleNode.contains(e.target as Node) && e.target !== handleNode) {
          console.log(
            'Mousedown was not on the handle element or its children. Current target:',
            e.target,
            'Expected handle:',
            handleNode,
            'Ignoring drag start.',
          );
          return;
        }
      } else if (draggableItemNode) {
        if (
          !draggableItemNode.contains(e.target as Node) &&
          e.target !== draggableItemNode
        ) {
          console.log(
            'Mousedown was not on the draggable item or its children (no handle specified). Current target:',
            e.target,
            'Expected draggable item:',
            draggableItemNode,
            'Ignoring drag start.',
          );
          return;
        }
      } else {
        console.error(
          'Draggable element or handle ref not set in mouseDownHandler',
        );
        return;
      }

      // If we've reached here, the click was on the correct drag-initiating element.
      console.log('Valid drag target. Proceeding with drag setup.');

      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

      if (!movingElementRef.current) {
        console.error('Draggable element ref not set in mouseDownHandler');
        return;
      }
      const rect = movingElementRef.current!.getBoundingClientRect();
      // Calculate offset from mouse to draggable's CENTER
      const currentDraggableCenterX = rect.left + rect.width / 2;
      const currentDraggableCenterY = rect.top + rect.height / 2;
      mouseToDraggableCenterOffsetRef.current = {
        x: e.clientX - currentDraggableCenterX,
        y: e.clientY - currentDraggableCenterY,
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

  // Effect for initial positioning and reacting to container/config changes
  useEffect(() => {
    if (
      movingElementNode &&
      persistedRelativeCenterRef.current &&
      !isDraggingRef.current
    ) {
      requestAnimationFrame(updateDraggablePosition);
    }
  }, [
    movingElementNode,
    providerData, // Triggers on container resize/scroll via DraggableProvider
    persistedRelativeCenterRef, // Triggers if the persistedRelativeCenterRef changes
    updateDraggablePosition, // Stable callback
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
