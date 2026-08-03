import type { TextUIPart } from '@shared/karton-contracts/ui';
import { memo } from 'react';
import { Streamdown } from '@ui/components/streamdown';

interface TextPartProps {
  part: TextUIPart;
  isStreaming: boolean;
}

export const TextPart = memo(
  ({ part, isStreaming }: TextPartProps) => (
    <Streamdown isStreaming={isStreaming}>{part.text}</Streamdown>
  ),
  // Custom comparison to prevent re-renders when only reference changes
  (prevProps, nextProps) =>
    prevProps.part.text === nextProps.part.text &&
    prevProps.isStreaming === nextProps.isStreaming,
);
