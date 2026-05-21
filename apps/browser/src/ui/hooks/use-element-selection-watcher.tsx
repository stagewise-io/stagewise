import { useEffect, useRef } from 'react';
import { useKartonState } from './use-karton';
import type { SelectedElement } from '@shared/selected-elements';

export interface UseElementSelectionWatcherOptions {
  /** Guard flag - only process new elements when this is true */
  isActive: boolean;
  /** Callback invoked for each newly added element */
  onNewElement: (element: SelectedElement) => void;
}

/**
 * Hook that watches `selectedElementsFromWebcontents` from Karton state
 * and calls a callback for newly added elements.
 *
 * Features:
 * - Ref-based previous elements tracking
 * - Always updates ref to prevent stale comparisons (even when inactive)
 * - Guard check before processing (controlled by isActive flag)
 * - Detects newly added elements by comparing stagewiseId
 *
 * This is useful for inserting element mentions into a chat input when
 * elements are selected via the context selector.
 */
export function useElementSelectionWatcher(
  options: UseElementSelectionWatcherOptions,
): void {
  const { isActive, onNewElement } = options;

  const selectedElementsFromWebcontents = useKartonState(
    (s) => s.browsing.selectedElements,
  );

  const prevSelectedElementsRef = useRef(selectedElementsFromWebcontents);

  useEffect(() => {
    const prevElements = prevSelectedElementsRef.current;
    const currentElements = selectedElementsFromWebcontents;

    // Always update the ref to stay in sync, even when not inserting.
    // This prevents stale comparisons when isActive becomes true again
    // (e.g., after a message edit is cancelled or panel is reopened).
    prevSelectedElementsRef.current = currentElements;

    // Only process new elements when active
    if (!isActive) return;

    // Find newly added elements by comparing stagewiseId
    const newElements = currentElements.filter(
      (el) => !prevElements.some((prev) => prev.stagewiseId === el.stagewiseId),
    );

    // Call callback for each new element
    newElements.forEach((element) => {
      onNewElement(element);
    });
  }, [selectedElementsFromWebcontents, isActive, onNewElement]);
}
