'use client';

import {
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type ElementType,
} from 'react';
import {
  OverlayScrollbarsComponent,
  type OverlayScrollbarsComponentRef,
} from 'overlayscrollbars-react';
import type { PartialOptions, OverlayScrollbars } from 'overlayscrollbars';
import { cn } from '../lib/utils';

/**
 * Ref handle exposed by the OverlayScrollbar component
 */
export interface OverlayScrollbarRef {
  /** Get the OverlayScrollbars instance */
  osInstance: () => OverlayScrollbars | null;
  /** Get the viewport element (the actual scrollable container) */
  getViewport: () => HTMLElement | null;
  /** Scroll to a specific position */
  scrollTo: (options: ScrollToOptions) => void;
  /** Scroll to the bottom of the container */
  scrollToBottom: () => void;
  /** Check if scroll is at the bottom (within threshold) */
  isAtBottom: (threshold?: number) => boolean;
}

export interface OverlayScrollbarProps {
  /** Content to render inside the scrollable area */
  children: React.ReactNode;
  /** CSS class name for the host element (outer wrapper) */
  className?: string;
  /**
   * CSS class name for the content wrapper inside the scrollable area.
   * Use this for layout classes like flex-col, gap-*, etc. that need to
   * apply directly to the container of your children.
   */
  contentClassName?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** Custom OverlayScrollbars options (merged with defaults) */
  options?: PartialOptions;
  /** Called when the viewport is scrolled */
  onScroll?: (instance: OverlayScrollbars) => void;
  /** Called when content or host size updates */
  onUpdated?: (instance: OverlayScrollbars) => void;
  /** Called when the instance is initialized */
  onInitialized?: (instance: OverlayScrollbars) => void;
  /** Defer initialization until idle */
  defer?: boolean;
  /** The HTML element to use for the root */
  element?: 'div' | 'section' | 'article' | 'main' | 'aside' | 'nav';
  /** Aria label for accessibility */
  'aria-label'?: string;
  /** Callback to receive the viewport element ref (useful for external scroll tracking) */
  onViewportRef?: (viewport: HTMLElement | null) => void;
}

const defaultOptions: PartialOptions = {
  scrollbars: {
    theme: 'os-theme-stagewise',
    autoHide: 'leave', // Show on scroll AND hover, hide when mouse leaves
    autoHideDelay: 100,
    autoHideSuspend: true,
    clickScroll: true,
  },
  overflow: {
    x: 'hidden',
    y: 'scroll',
  },
};

/**
 * A wrapper component for OverlayScrollbars that provides VS Code-like overlay scrollbars.
 *
 * Features:
 * - Overlay scrollbars that don't take up gutter space
 * - Auto-hide behavior (shows on scroll/hover, hides when mouse leaves)
 * - Custom stagewise theme matching the design system
 * - Imperative handle for programmatic scroll control
 *
 * @example
 * ```tsx
 * const scrollbarRef = useRef<OverlayScrollbarRef>(null);
 *
 * // Scroll to bottom
 * scrollbarRef.current?.scrollToBottom();
 *
 * // Check if at bottom
 * const atBottom = scrollbarRef.current?.isAtBottom(10);
 *
 * // Use className for the outer host element (sizing, positioning)
 * // Use contentClassName for layout of children (flex, gap, etc.)
 * <OverlayScrollbar
 *   ref={scrollbarRef}
 *   className="max-h-60 w-full"
 *   contentClassName="flex flex-col gap-2"
 * >
 *   {items.map(item => <Item key={item.id} />)}
 * </OverlayScrollbar>
 * ```
 */
export const OverlayScrollbar = forwardRef<
  OverlayScrollbarRef,
  OverlayScrollbarProps
>(function OverlayScrollbar(
  {
    children,
    className,
    contentClassName,
    style,
    options,
    onScroll,
    onUpdated,
    onInitialized,
    defer = true,
    element = 'div',
    'aria-label': ariaLabel,
    onViewportRef,
  },
  ref,
) {
  const osRef = useRef<OverlayScrollbarsComponentRef<ElementType>>(null);

  // Handle viewport ref callback when instance is initialized
  const handleInitialized = useCallback(
    (instance: OverlayScrollbars) => {
      const { viewport } = instance.elements();
      // Remove the viewport from the Tab order. Keyboard scrolling still works
      // when focus moves to items inside, but Tab should not land on the scroll
      // container itself (which happens with certain overflow configurations).
      viewport.tabIndex = -1;
      if (onViewportRef) {
        onViewportRef(viewport);
      }
      if (onInitialized) {
        onInitialized(instance);
      }
    },
    [onViewportRef, onInitialized],
  );

  // Merge custom options with defaults
  const mergedOptions: PartialOptions = {
    ...defaultOptions,
    ...options,
    scrollbars: {
      ...defaultOptions.scrollbars,
      ...options?.scrollbars,
    },
    overflow: {
      ...defaultOptions.overflow,
      ...options?.overflow,
    },
  };

  // Get the viewport element from the OverlayScrollbars instance
  const getViewport = useCallback((): HTMLElement | null => {
    const instance = osRef.current?.osInstance();
    if (!instance) return null;
    return instance.elements().viewport;
  }, []);

  // Scroll to a specific position
  const scrollTo = useCallback(
    (scrollOptions: ScrollToOptions) => {
      const viewport = getViewport();
      if (viewport) {
        viewport.scrollTo(scrollOptions);
      }
    },
    [getViewport],
  );

  // Scroll to the bottom
  const scrollToBottom = useCallback(() => {
    const viewport = getViewport();
    if (viewport) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        viewport.scrollTop = viewport.scrollHeight;
      });
    }
  }, [getViewport]);

  // Check if scrolled to bottom (within threshold)
  const isAtBottom = useCallback(
    (threshold = 10): boolean => {
      const viewport = getViewport();
      if (!viewport) return true;
      return (
        viewport.scrollTop + viewport.clientHeight >=
        viewport.scrollHeight - threshold
      );
    },
    [getViewport],
  );

  // Expose imperative handle
  useImperativeHandle(
    ref,
    () => ({
      osInstance: () => osRef.current?.osInstance() ?? null,
      getViewport,
      scrollTo,
      scrollToBottom,
      isAtBottom,
    }),
    [getViewport, scrollTo, scrollToBottom, isAtBottom],
  );

  // Wrap children in a div with contentClassName if provided
  const content = contentClassName ? (
    <div className={contentClassName}>{children}</div>
  ) : (
    children
  );

  return (
    <OverlayScrollbarsComponent
      ref={osRef}
      element={element}
      options={mergedOptions}
      events={{
        scroll: onScroll ? (instance) => onScroll(instance) : undefined,
        updated: onUpdated ? (instance) => onUpdated(instance) : undefined,
        initialized: handleInitialized,
      }}
      defer={defer}
      className={cn(className)}
      style={style}
      aria-label={ariaLabel}
    >
      {content}
    </OverlayScrollbarsComponent>
  );
});
