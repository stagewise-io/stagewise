import { useState, useEffect, useCallback, useId } from 'react';
import { useExploringContentContext } from '../exploring';

/**
 * Hook to manage auto-expand/collapse behavior for tool parts.
 *
 * The logic is:
 * - Auto-expand when streaming starts
 * - Stay expanded after streaming ends if this is the last part
 * - Auto-collapse when no longer the last part (unless manually expanded by user)
 * - Always respect user's manual expansion/collapse
 */
export function useToolAutoExpand({
  isStreaming,
  isLastPart,
}: {
  isStreaming: boolean;
  isLastPart: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);
  const exploringContext = useExploringContentContext();
  const id = useId();

  // Auto-expand when streaming starts OR when part finishes and is last
  // Auto-collapse only when no longer the last part (and not manually expanded)
  useEffect(() => {
    if (isStreaming) {
      setExpanded(true);
      setIsManuallyExpanded(false);
    } else if (!isLastPart && !isManuallyExpanded) {
      setExpanded(false);
    }
    // When streaming ends and isLastPart, stay expanded
  }, [isStreaming, isLastPart, isManuallyExpanded]);

  // Handle user-initiated expansion toggle
  const handleUserSetExpanded = useCallback((newExpanded: boolean) => {
    setExpanded(newExpanded);
    setIsManuallyExpanded(newExpanded);
  }, []);

  // Report expansion state to parent exploring context (only for manual expansion)
  useEffect(() => {
    if (!exploringContext) return;
    if (isManuallyExpanded && expanded) exploringContext.registerExpanded(id);
    else exploringContext.unregisterExpanded(id);

    return () => {
      exploringContext.unregisterExpanded(id);
    };
  }, [expanded, isManuallyExpanded, exploringContext, id]);

  return { expanded, handleUserSetExpanded, isManuallyExpanded };
}
