import type { TextUIPart } from '@shared/karton-contracts/ui';
import { memo } from 'react';
import { Streamdown } from '@ui/components/streamdown';

interface TextPartProps {
  part: TextUIPart;
  messageRole: 'user' | 'assistant' | 'system';
}

export const TextPart = memo(
  ({ part, messageRole }: TextPartProps) => {
    // Only render markdown for assistant messages
    if (messageRole === 'assistant')
      return (
        <Streamdown isAnimating={part.state === 'streaming'}>
          {part.text}
        </Streamdown>
      );

    // Render plain text for user messages
    return <span className="whitespace-pre-wrap">{part.text}</span>;
  },
  // Custom comparison to prevent re-renders when only reference changes
  (prevProps, nextProps) =>
    prevProps.part.text === nextProps.part.text &&
    prevProps.part.state === nextProps.part.state &&
    prevProps.messageRole === nextProps.messageRole,
);
