import type { TextUIPart } from '@shared/karton-contracts/ui';
import { memo } from 'react';
import { Streamdown } from '@/components/streamdown';
import { useTypeWriterText } from '@/hooks/use-type-writer-text';

interface TextPartProps {
  part: TextUIPart;
  messageRole: 'user' | 'assistant' | 'system';
}

export const TextPart = memo(
  ({ part, messageRole }: TextPartProps) => {
    const displayedText = useTypeWriterText(part.text, {
      showAllOnFirstRender: true,
      animateOnIncreaseOnly: true,
      isStreaming: part.state === 'streaming',
    });

    // Only render markdown for assistant messages
    if (messageRole === 'assistant')
      return (
        <Streamdown isAnimating={part.state === 'streaming'}>
          {displayedText}
        </Streamdown>
      );

    // Render plain text for user messages
    return <span className="whitespace-pre-wrap">{displayedText}</span>;
  },
  // Custom comparison to prevent re-renders when only reference changes
  (prevProps, nextProps) =>
    prevProps.part.text === nextProps.part.text &&
    prevProps.part.state === nextProps.part.state &&
    prevProps.messageRole === nextProps.messageRole,
);
