import type { TextUIPart } from '@stagewise/karton-contract';
import { memo } from 'react';
import { Streamdown } from 'streamdown';
import { useTypeWriterText } from '@/hooks/use-type-writer-text';

interface TextPartProps {
  part: TextUIPart;
}

export const TextPart = memo(({ part }: TextPartProps) => {
  const displayedText = useTypeWriterText(part.text, {
    charsPerInterval: 1,
    framesPerInterval: 1,
    showAllOnFirstRender: true,
    animateOnIncreaseOnly: true,
  });

  return (
    <Streamdown isAnimating={part.state === 'streaming'}>
      {displayedText}
    </Streamdown>
  );
});
