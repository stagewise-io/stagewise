import type { TextUIPart } from '@shared/karton-contracts/ui';
import { memo } from 'react';
import { Streamdown } from '@/components/streamdown';
import { useTypeWriterText } from '@/hooks/use-type-writer-text';

interface TextPartProps {
  part: TextUIPart;
  role: 'user' | 'assistant' | 'system';
}

export const TextPart = memo(
  ({ part, role }: TextPartProps) => {
    const displayedText = useTypeWriterText(part.text, {
      charsPerInterval: 2,
      framesPerInterval: 1,
      showAllOnFirstRender: true,
      animateOnIncreaseOnly: true,
    });

    // Only render markdown for assistant messages
    if (role === 'assistant') {
      return (
        <Streamdown isAnimating={part.state === 'streaming'}>
          {displayedText}
        </Streamdown>
      );
    }

    // Render plain text for user messages
    return <span className="whitespace-pre-wrap">{displayedText}</span>;
  },
  // Custom comparison to prevent re-renders when only reference changes
  (prevProps, nextProps) =>
    prevProps.part.text === nextProps.part.text &&
    prevProps.part.state === nextProps.part.state &&
    prevProps.role === nextProps.role,
);
