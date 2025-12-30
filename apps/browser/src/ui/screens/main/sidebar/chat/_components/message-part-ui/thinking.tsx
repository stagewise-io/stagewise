import { cn } from '@/utils';
import type { ReasoningUIPart } from '@shared/karton-contracts/ui';
import { useState, useEffect, useMemo, useId, useCallback } from 'react';
import { BrainIcon } from 'lucide-react';
import { Streamdown } from '@/components/streamdown';
import { useTypeWriterText } from '@/hooks/use-type-writer-text';
import { ToolPartUI } from './tools/shared/tool-part-ui';
import { useExploringContentContext } from './tools/exploring';

export const ThinkingPart = ({
  part,
  isAutoExpanded,
  isShimmering,
  thinkingDuration,
  showBorder = true,
}: {
  part: ReasoningUIPart;
  isAutoExpanded: boolean;
  isShimmering: boolean;
  thinkingDuration?: number;
  showBorder?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);
  const exploringContext = useExploringContentContext();
  const id = useId();
  const formattedThinkingDuration = useMemo(() => {
    if (!thinkingDuration) return null;
    // thinkingDuration is ms, convert to s without decimals
    return `${Math.round(thinkingDuration / 1000)}s`;
  }, [thinkingDuration]);

  // Handle auto-expansion (not user-initiated)
  useEffect(() => {
    setIsExpanded(isAutoExpanded);
    setIsManuallyExpanded(false);
  }, [isAutoExpanded]);

  // Handle user-initiated expansion toggle
  const handleUserSetExpanded = useCallback((expanded: boolean) => {
    setIsExpanded(expanded);
    setIsManuallyExpanded(expanded);
  }, []);

  // Report expansion state to parent exploring context (only for manual expansion)
  useEffect(() => {
    if (!exploringContext) return;
    if (isManuallyExpanded && isExpanded) exploringContext.registerExpanded(id);
    else exploringContext.unregisterExpanded(id);

    return () => {
      exploringContext.unregisterExpanded(id);
    };
  }, [isExpanded, isManuallyExpanded, exploringContext, id]);

  const displayedText = useTypeWriterText(part.text, {
    charsPerInterval: 2,
    framesPerInterval: 1,
    showAllOnFirstRender: true,
    animateOnIncreaseOnly: true,
  });
  return (
    <ToolPartUI
      showBorder={showBorder}
      expanded={isExpanded}
      setExpanded={handleUserSetExpanded}
      contentClassName="max-h-24"
      trigger={
        <>
          <BrainIcon
            className={cn(
              'size-3 text-muted-foreground',
              isShimmering
                ? 'animate-thinking-part-brain-pulse text-primary'
                : '',
            )}
          />
          <span
            className={cn(
              'truncate text-start text-xs',
              isShimmering
                ? 'shimmer-text shimmer-duration-1500 shimmer-from-primary shimmer-to-blue-300'
                : 'text-muted-foreground',
              showBorder && 'flex-1',
            )}
          >
            {part.state === 'streaming' && 'Thinking...'}
            {part.state === 'done' && formattedThinkingDuration && (
              <span
                className={
                  !showBorder ? 'font-normal text-muted-foreground/75' : ''
                }
              >
                {!showBorder ? (
                  <span className="shrink-0 truncate font-medium text-muted-foreground">
                    Thought{' '}
                  </span>
                ) : (
                  'Thought '
                )}
                for {formattedThinkingDuration}
              </span>
            )}
            {part.state === 'done' && !formattedThinkingDuration && (
              <span>
                {!showBorder ? (
                  <span className="shrink-0 truncate font-medium">
                    Thought{' '}
                  </span>
                ) : (
                  'Thought '
                )}
              </span>
            )}
          </span>
        </>
      }
      content={
        <div className="pb-1 text-muted-foreground opacity-75">
          <Streamdown isAnimating={part.state === 'streaming'}>
            {displayedText}
          </Streamdown>
        </div>
      }
    />
  );
};
