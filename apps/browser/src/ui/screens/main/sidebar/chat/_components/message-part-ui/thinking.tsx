import { cn } from '@/utils';
import type { ReasoningUIPart } from '@shared/karton-contracts/ui';
import { useMemo } from 'react';
import { BrainIcon } from 'lucide-react';
import { Streamdown } from '@/components/streamdown';
import { useTypeWriterText } from '@/hooks/use-type-writer-text';
import { ToolPartUI } from './tools/shared/tool-part-ui';
import { useToolAutoExpand } from './tools/shared/use-tool-auto-expand';

export const ThinkingPart = ({
  part,
  isShimmering,
  thinkingDuration,
  isLastPart = false,
  capMaxHeight = false,
}: {
  part: ReasoningUIPart;
  isShimmering: boolean;
  thinkingDuration?: number;
  isLastPart?: boolean;
  capMaxHeight?: boolean;
}) => {
  const isStreaming = part.state === 'streaming';

  // Use the unified auto-expand hook
  const { expanded, handleUserSetExpanded } = useToolAutoExpand({
    isStreaming,
    isLastPart,
  });

  const formattedThinkingDuration = useMemo(() => {
    if (!thinkingDuration) return null;
    // thinkingDuration is ms, convert to s without decimals
    return `${Math.round(thinkingDuration / 1000)}s`;
  }, [thinkingDuration]);

  const displayedText = useTypeWriterText(part.text, {
    showAllOnFirstRender: true,
    animateOnIncreaseOnly: true,
    isStreaming: part.state === 'streaming',
  });
  return (
    <ToolPartUI
      expanded={expanded}
      setExpanded={handleUserSetExpanded}
      trigger={
        <>
          <BrainIcon
            className={cn(
              'size-3',
              isShimmering
                ? 'animate-thinking-part-brain-pulse text-primary-foreground'
                : '',
            )}
          />
          <span
            className={cn(
              'truncate text-start text-xs',
              isShimmering ? 'shimmer-text-primary' : '',
            )}
          >
            {part.state === 'streaming' ? (
              'Thinking...'
            ) : part.state === 'done' && formattedThinkingDuration ? (
              <>
                <span className="shrink-0 truncate font-medium">Thought </span>
                <span className={'font-normal opacity-75'}>
                  for {formattedThinkingDuration}
                </span>
              </>
            ) : (
              <span className="shrink-0 truncate font-medium">Thought</span>
            )}
          </span>
        </>
      }
      content={
        <div className={cn('pb-1 opacity-75', capMaxHeight ? 'max-h-24!' : '')}>
          <Streamdown isAnimating={part.state === 'streaming'}>
            {displayedText}
          </Streamdown>
        </div>
      }
    />
  );
};
