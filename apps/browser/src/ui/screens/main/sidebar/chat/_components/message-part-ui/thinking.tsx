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
  showBorder = true,
  isLastPart = false,
}: {
  part: ReasoningUIPart;
  isShimmering: boolean;
  thinkingDuration?: number;
  showBorder?: boolean;
  isLastPart?: boolean;
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
    charsPerInterval: 2,
    framesPerInterval: 1,
    showAllOnFirstRender: true,
    animateOnIncreaseOnly: true,
  });
  return (
    <ToolPartUI
      showBorder={showBorder}
      expanded={expanded}
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
