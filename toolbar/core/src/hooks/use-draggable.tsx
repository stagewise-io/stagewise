import { type ReactNode, createContext, type RefObject } from 'react';
import { useState, useEffect, useContext, useRef, useCallback } from 'react';

export interface DraggableContextType {
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
    bottomLeft: boolean;
    bottomCenter: boolean;
    bottomRight: boolean;
  };
  registerDragStart?: (cb: () => void) => () => void;
  registerDragEnd?: (cb: () => void) => () => void;
  emitDragStart?: () => void;
  emitDragEnd?: () => void;
}

export const DraggableContext = createContext<DraggableContextType | null>(
  null,
);

export const DraggableProvider = ({
  containerRef,
  children,
  snapAreas,
  onDragStart,
  onDragEnd,
}: {
  containerRef: RefObject<HTMLElement>;
  children: ReactNode;
  snapAreas: DraggableContextType['snapAreas'];
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) => {
  const [borderLocation, setBorderLocation] = useState({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  });

  // Update border location when container dimensions change
  useEffect(() => {
    if (!containerRef.current) return;

    const updateBorderLocation = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setBorderLocation({
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
        });
      }
    };

    // Initial update
    updateBorderLocation();

    // Create ResizeObserver to watch for container size changes
    const resizeObserver = new ResizeObserver(updateBorderLocation);
    resizeObserver.observe(containerRef.current);

    // Watch for window resize events
    window.addEventListener('resize', updateBorderLocation);

    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateBorderLocation);
    };
  }, [containerRef]);

  const dragStartListeners = useRef<Set<() => void>>(new Set());
  const dragEndListeners = useRef<Set<() => void>>(new Set());

  const registerDragStart = useCallback((cb: () => void) => {
    dragStartListeners.current.add(cb);
    return () => dragStartListeners.current.delete(cb);
  }, []);
  const registerDragEnd = useCallback((cb: () => void) => {
    dragEndListeners.current.add(cb);
    return () => dragEndListeners.current.delete(cb);
  }, []);

  const emitDragStart = useCallback(() => {
    if (onDragStart) onDragStart();
    dragStartListeners.current.forEach((cb) => cb());
  }, [onDragStart]);
  const emitDragEnd = useCallback(() => {
    if (onDragEnd) onDragEnd();
    dragEndListeners.current.forEach((cb) => cb());
  }, [onDragEnd]);

  const contextValue = {
    borderLocation,
    snapAreas,
    registerDragStart,
    registerDragEnd,
    emitDragStart,
    emitDragEnd,
  };

  // Removed useEffect for scroll/resize/ResizeObserver

  return (
    <DraggableContext.Provider value={contextValue}>
      {children}
    </DraggableContext.Provider>
  );
};

export interface DraggableConfig {
  startThreshold?: number;
  areaSnapThreshold?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  initialSnapArea?: keyof DraggableContextType['snapAreas'];
  initialRelativeCenter?: { x: number; y: number };
  springStiffness?: number;
  springDampness?: number;
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

  // Snap state
  const [currentSnapArea, setCurrentSnapArea] = useState<
    keyof DraggableContextType['snapAreas'] | null
  >(null);

  const {
    startThreshold = 3,
    areaSnapThreshold = 60, // px, default threshold for snapping
    onDragStart,
    onDragEnd,
    initialSnapArea,
    springStiffness = 0.2, // Default spring stiffness
    springDampness = 0.55, // Default spring dampness
    // initialRelativeCenter is used to initialize persistedRelativeCenterRef
  } = config;

  // --- SPRING ANIMATION STATE ---
  // Animated position (center of draggable in viewport coordinates)
  const animatedPositionRef = useRef<{ x: number; y: number } | null>(null);
  // Animated velocity
  const velocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Track if we've already animated once (to skip animation on first render)
  const hasAnimatedOnceRef = useRef(false);

  // Set initial position based on initialSnapArea if provided
  useEffect(() => {
    if (
      initialSnapArea &&
      providerData &&
      providerData.borderLocation &&
      providerData.snapAreas &&
      providerData.snapAreas[initialSnapArea] &&
      !isDraggingRef.current
    ) {
      // Get snap area centers
      const { top, left, right, bottom } = providerData.borderLocation;
      const width = right - left;
      const height = bottom - top;
      const areaCenters = {
        topLeft: { x: left, y: top },
        topRight: { x: right, y: top },
        bottomLeft: { x: left, y: bottom },
        bottomRight: { x: right, y: bottom },
      };
      const center = areaCenters[initialSnapArea];
      if (center && width > 0 && height > 0) {
        // Convert absolute center to relative (0-1) coordinates
        const relX = (center.x - left) / width;
        const relY = (center.y - top) / height;
        persistedRelativeCenterRef.current = { x: relX, y: relY };
      } else if (center) {
        console.warn(
          'useDraggable: Container for initialSnapArea has zero width or height. Cannot calculate relative center from snap area. Falling back to initialRelativeCenter or undefined.',
        );
        // Do not set persistedRelativeCenterRef.current to NaN values.
        // It will retain its value from config.initialRelativeCenter or remain undefined if that was also undefined.
      }
    }
  }, [initialSnapArea, providerData]);

  // Utility: get snap area centers
  function getSnapAreaCenters(
    borderLocation: DraggableContextType['borderLocation'],
  ) {
    const { top, left, right, bottom } = borderLocation;
    const centerX = (left + right) / 2;
    return {
      topLeft: { x: left, y: top },
      topCenter: { x: centerX, y: top },
      topRight: { x: right, y: top },
      bottomLeft: { x: left, y: bottom },
      bottomCenter: { x: centerX, y: bottom },
      bottomRight: { x: right, y: bottom },
    };
  }

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

    // --- SNAP LOGIC ---
    let snapArea: keyof DraggableContextType['snapAreas'] | null = null;
    let snapTarget: { x: number; y: number } | null = null;
    const provider = latestProviderDataRef.current;
    let isTopHalf = true;
    let isLeftHalf = true;
    if (
      isDraggingRef.current &&
      mouseToDraggableCenterOffsetRef.current &&
      currentMousePosRef.current &&
      provider &&
      provider.borderLocation &&
      provider.snapAreas
    ) {
      // Compute draggable's center
      const dragCenter = {
        x:
          currentMousePosRef.current.x -
          mouseToDraggableCenterOffsetRef.current.x,
        y:
          currentMousePosRef.current.y -
          mouseToDraggableCenterOffsetRef.current.y,
      };
      // Get snap area centers
      const areaCenters = getSnapAreaCenters(provider.borderLocation);
      let minDist = Number.POSITIVE_INFINITY;
      let closestArea: keyof DraggableContextType['snapAreas'] | null = null;
      let closestCenter: { x: number; y: number } | null = null;
      for (const area in provider.snapAreas) {
        if (provider.snapAreas[area as keyof typeof provider.snapAreas]) {
          // Only consider enabled snap areas
          const center = areaCenters[area as keyof typeof areaCenters];
          if (!center) continue;
          const dist = Math.hypot(
            center.x - dragCenter.x,
            center.y - dragCenter.y,
          );
          if (dist < minDist) {
            minDist = dist;
            closestArea = area as keyof DraggableContextType['snapAreas'];
            closestCenter = center;
          }
        }
      }
      if (closestArea && closestCenter && minDist <= areaSnapThreshold) {
        snapArea = closestArea;
        snapTarget = closestCenter;
      }
      // Determine halves based on current drag center
      isLeftHalf = (dragCenter.x - parentViewportLeft) / parentWidth <= 0.5;
      isTopHalf = (dragCenter.y - parentViewportTop) / parentHeight <= 0.5;
    }
    // --- END SNAP LOGIC ---

    if (isDraggingRef.current && snapTarget) {
      // Snap to the snapTarget
      targetViewportCenterX = snapTarget.x;
      targetViewportCenterY = snapTarget.y;
      setCurrentSnapArea(snapArea);
      // Determine halves based on snap target
      isLeftHalf = (snapTarget.x - parentViewportLeft) / parentWidth <= 0.5;
      isTopHalf = (snapTarget.y - parentViewportTop) / parentHeight <= 0.5;
    } else if (
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
      setCurrentSnapArea(null);
      // Determine halves based on current drag center
      isLeftHalf =
        (targetViewportCenterX - parentViewportLeft) / parentWidth <= 0.5;
      isTopHalf =
        (targetViewportCenterY - parentViewportTop) / parentHeight <= 0.5;
    } else {
      // Not dragging: use the persisted or initial relative center
      if (currentDesiredRelativeCenter && parentWidth > 0 && parentHeight > 0) {
        isTopHalf = currentDesiredRelativeCenter.y <= 0.5;
        isLeftHalf = currentDesiredRelativeCenter.x <= 0.5;
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
      setCurrentSnapArea(null);
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

    // --- SPRING ANIMATION ---
    // Use spring physics to animate the position
    // If this is the first frame, initialize the animated position
    if (!animatedPositionRef.current) {
      animatedPositionRef.current = {
        x: targetViewportCenterX,
        y: targetViewportCenterY,
      };
      velocityRef.current = { x: 0, y: 0 };
      // On first render, jump to position and skip animation
      const targetElementStyleX = targetViewportCenterX - draggableWidth / 2;
      const targetElementStyleY = targetViewportCenterY - draggableHeight / 2;
      const elStyle = draggableEl.style;
      elStyle.right = '';
      elStyle.bottom = '';
      elStyle.left = '';
      elStyle.top = '';
      if (isLeftHalf) {
        const styleLeftPx = targetElementStyleX - parentViewportLeft;
        elStyle.left =
          parentWidth > 0
            ? `${((styleLeftPx / parentWidth) * 100).toFixed(2)}%`
            : '0px';
        elStyle.right = '';
      } else {
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
      hasAnimatedOnceRef.current = true;
      return;
    }
    // Only animate if we've already jumped to the initial position
    if (!hasAnimatedOnceRef.current) {
      hasAnimatedOnceRef.current = true;
      return;
    }
    const pos = animatedPositionRef.current;
    const vel = velocityRef.current;
    // Calculate spring force
    const dx = targetViewportCenterX - pos.x;
    const dy = targetViewportCenterY - pos.y;
    // F = -kX - bv
    const ax = springStiffness * dx - springDampness * vel.x;
    const ay = springStiffness * dy - springDampness * vel.y;
    // Integrate velocity and position
    vel.x += ax;
    vel.y += ay;
    pos.x += vel.x;
    pos.y += vel.y;
    // If close enough to target, snap to target and zero velocity
    const threshold = 0.5;
    if (
      Math.abs(dx) < threshold &&
      Math.abs(dy) < threshold &&
      Math.abs(vel.x) < threshold &&
      Math.abs(vel.y) < threshold
    ) {
      pos.x = targetViewportCenterX;
      pos.y = targetViewportCenterY;
      vel.x = 0;
      vel.y = 0;
    }
    animatedPositionRef.current = { ...pos };
    velocityRef.current = { ...vel };

    // Calculate target top-left for styling, from animated center
    const targetElementStyleX = pos.x - draggableWidth / 2;
    const targetElementStyleY = pos.y - draggableHeight / 2;

    const elStyle = draggableEl.style;
    elStyle.right = '';
    elStyle.bottom = '';
    elStyle.left = '';
    elStyle.top = '';

    if (isLeftHalf) {
      const styleLeftPx = targetElementStyleX - parentViewportLeft;
      elStyle.left =
        parentWidth > 0
          ? `${((styleLeftPx / parentWidth) * 100).toFixed(2)}%`
          : '0px';
      elStyle.right = '';
    } else {
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

    // Continue animating if not at target
    if (
      Math.abs(pos.x - targetViewportCenterX) > threshold ||
      Math.abs(pos.y - targetViewportCenterY) > threshold ||
      Math.abs(vel.x) > threshold ||
      Math.abs(vel.y) > threshold ||
      isDraggingRef.current
    ) {
      requestAnimationFrame(updateDraggablePosition);
    }
  }, [areaSnapThreshold, springStiffness, springDampness]);

  const [wasDragged, setWasDragged] = useState(false);

  // This will be listened to globally if the mouse was pressed down on the draggable element
  const mouseUpHandler = useCallback(
    (_e: MouseEvent) => {
      if (isDraggingRef.current) {
        if (onDragEnd) onDragEnd();
        if (latestProviderDataRef.current?.emitDragEnd) {
          latestProviderDataRef.current.emitDragEnd();
        }
        // Set wasDragged to true when a drag operation ends
        setWasDragged(true);
        // Reset wasDragged after a short delay to allow click handlers to check it
        setTimeout(() => setWasDragged(false), 0);
        // --- Persist the new position on drag end ---
        const draggableEl = movingElementRef.current;
        const provider = latestProviderDataRef.current;
        if (draggableEl && provider && provider.borderLocation) {
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
          // Compute the center where the draggable is released
          let releasedCenterX = 0;
          let releasedCenterY = 0;
          if (
            currentMousePosRef.current &&
            mouseToDraggableCenterOffsetRef.current
          ) {
            releasedCenterX =
              currentMousePosRef.current.x -
              mouseToDraggableCenterOffsetRef.current.x;
            releasedCenterY =
              currentMousePosRef.current.y -
              mouseToDraggableCenterOffsetRef.current.y;
          } else {
            // fallback to current animated position
            if (animatedPositionRef.current) {
              releasedCenterX = animatedPositionRef.current.x;
              releasedCenterY = animatedPositionRef.current.y;
            }
          }
          // Clamp to provider bounds
          const borderLocation = provider.borderLocation;
          const minX = borderLocation.left + draggableWidth / 2;
          const maxX = borderLocation.right - draggableWidth / 2;
          const minY = borderLocation.top + draggableHeight / 2;
          const maxY = borderLocation.bottom - draggableHeight / 2;
          releasedCenterX = Math.max(minX, Math.min(releasedCenterX, maxX));
          releasedCenterY = Math.max(minY, Math.min(releasedCenterY, maxY));

          // Always snap to the closest snap area, regardless of distance
          const areaCenters = getSnapAreaCenters(borderLocation);
          let minDist = Number.POSITIVE_INFINITY;
          let closestArea: keyof DraggableContextType['snapAreas'] | null =
            null;
          let closestCenter: { x: number; y: number } | null = null;
          for (const area in provider.snapAreas) {
            if (provider.snapAreas[area as keyof typeof provider.snapAreas]) {
              const center = areaCenters[area as keyof typeof areaCenters];
              if (!center) continue;
              const dist = Math.hypot(
                center.x - releasedCenterX,
                center.y - releasedCenterY,
              );
              if (dist < minDist) {
                minDist = dist;
                closestArea = area as keyof DraggableContextType['snapAreas'];
                closestCenter = center;
              }
            }
          }
          // Snap to the closest area, but only if within threshold
          if (closestArea && closestCenter) {
            setCurrentSnapArea(closestArea);
            // Convert to relative
            const relX = (closestCenter.x - parentViewportLeft) / parentWidth;
            const relY = (closestCenter.y - parentViewportTop) / parentHeight;
            persistedRelativeCenterRef.current = { x: relX, y: relY };
          } else {
            // Fallback: use released position
            // This else branch should ideally not be reached if a closestArea and closestCenter are always found.
            // However, keeping it as a fallback or for cases where no snap areas are defined/valid.
            setCurrentSnapArea(null);
            const relX = (releasedCenterX - parentViewportLeft) / parentWidth;
            const relY = (releasedCenterY - parentViewportTop) / parentHeight;
            persistedRelativeCenterRef.current = { x: relX, y: relY };
          }
        }
      }
      mouseDownPosRef.current = null;
      isDraggingRef.current = false;
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
        if (onDragStart) onDragStart();
        if (latestProviderDataRef.current?.emitDragStart) {
          latestProviderDataRef.current.emitDragStart();
        }
        requestAnimationFrame(updateDraggablePosition);
      }

      currentMousePosRef.current = { x: e.clientX, y: e.clientY };
    },
    [startThreshold, onDragStart, updateDraggablePosition],
  );

  // This is attached to the draggable item or its handle
  const mouseDownHandler = useCallback(
    (e: MouseEvent) => {
      // Only proceed if it's the main mouse button (usually left-click)
      if (e.button !== 0) {
        return;
      }

      const handleNode = dragInitiatorRef.current;
      const draggableItemNode = movingElementRef.current;

      if (handleNode) {
        if (!handleNode.contains(e.target as Node) && e.target !== handleNode) {
          return;
        }
      } else if (draggableItemNode) {
        if (
          !draggableItemNode.contains(e.target as Node) &&
          e.target !== draggableItemNode
        ) {
          return;
        }
      } else {
        console.error(
          'Draggable element or handle ref not set in mouseDownHandler',
        );
        return;
      }

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

  // Effect to set initial position
  useEffect(() => {
    const el = movingElementRef.current;
    if (
      el &&
      providerData &&
      providerData.borderLocation && // Needed for calculations within updateDraggablePosition
      persistedRelativeCenterRef.current && // Ensure we have a center to position to
      !isDraggingRef.current && // Not currently dragging
      !hasAnimatedOnceRef.current // Only run for the very first setup
    ) {
      requestAnimationFrame(() => {
        // Ensure element still exists in rAF callback
        if (movingElementRef.current) {
          updateDraggablePosition();
          // updateDraggablePosition will set hasAnimatedOnceRef.current to true
          // if it's the first run and it successfully positions (in the !animatedPositionRef.current block).
        }
      });
    }
  }, [
    movingElementNode, // Run when element is available/changes
    providerData, // Run if provider context changes (for borderLocation)
    config.initialRelativeCenter, // If this changes, persistedRelativeCenterRef might be re-initialized
    initialSnapArea, // If this changes, an effect updates persistedRelativeCenterRef
    updateDraggablePosition, // Memoized callback for positioning
    // hasAnimatedOnceRef is intentionally not a dep, its current value is checked inside.
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
    position: {
      snapArea: currentSnapArea,
      isTopHalf: persistedRelativeCenterRef.current
        ? persistedRelativeCenterRef.current.y <= 0.5
        : true,
      isLeftHalf: persistedRelativeCenterRef.current
        ? persistedRelativeCenterRef.current.x <= 0.5
        : true,
    },
    wasDragged,
  };
}
