import { cn } from '@/utils';
import type { ReasoningUIPart } from '@stagewise/karton-contract';
import { useState, useEffect, useMemo } from 'react';
import { BrainIcon } from 'lucide-react';
import { Streamdown } from '@/components/streamdown';
import { useTypeWriterText } from '@/hooks/use-type-writer-text';
import { ToolPartUI } from './tools/shared/tool-part-ui';

export const ThinkingPart = ({
  part,
  isAutoExpanded,
  isShimmering,
  thinkingDuration,
}: {
  part: ReasoningUIPart;
  isAutoExpanded: boolean;
  isShimmering: boolean;
  thinkingDuration?: number;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const formattedThinkingDuration = useMemo(() => {
    if (!thinkingDuration) return null;
    // thinkingDuration is ms, convert to s without decimals
    return `${Math.round(thinkingDuration / 1000)}s`;
  }, [thinkingDuration]);

  useEffect(() => {
    setIsExpanded(isAutoExpanded);
  }, [isAutoExpanded]);

  const displayedText = useTypeWriterText(part.text, {
    charsPerInterval: 2,
    framesPerInterval: 1,
    showAllOnFirstRender: true,
    animateOnIncreaseOnly: true,
  });
  return (
    <ToolPartUI
      expanded={isExpanded}
      setExpanded={setIsExpanded}
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
              'flex-1 truncate text-start text-xs',
              isShimmering
                ? 'shimmer-text shimmer-duration-1500 shimmer-from-primary shimmer-to-blue-300'
                : 'text-muted-foreground',
            )}
          >
            {part.state === 'streaming' && 'Thinking...'}
            {part.state === 'done' && formattedThinkingDuration && (
              <span>Thought for {formattedThinkingDuration}</span>
            )}
            {part.state === 'done' && !formattedThinkingDuration && (
              <span>Thought</span>
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
