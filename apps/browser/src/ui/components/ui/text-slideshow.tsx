import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/utils';

const textSlideshowVariants = cva('relative block h-[1.2em] overflow-hidden');

interface TextSlideshowProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof textSlideshowVariants> {
  texts: string[];
  changeEveryMs?: number;
  appendix?: string | React.ReactNode;
}

function TextSlideshow({
  className,
  texts,
  changeEveryMs = 3000,
  appendix,
  ...props
}: TextSlideshowProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isAnimating, setIsAnimating] = React.useState(false);

  // Find the longest text to maintain consistent width
  const longestText = React.useMemo(() => {
    return texts.reduce((longest, current) =>
      current.length > longest.length ? current : longest,
    );
  }, [texts]);

  React.useEffect(() => {
    if (texts.length <= 1) return;

    const interval = setInterval(() => {
      setIsAnimating(true);

      setTimeout(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % texts.length);
        setIsAnimating(false);
      }, 300); // Half of animation duration
    }, changeEveryMs);

    return () => clearInterval(interval);
  }, [texts.length, changeEveryMs]);

  if (texts.length === 0) {
    return null;
  }

  return (
    <span
      data-slot="text-slideshow"
      className={cn(textSlideshowVariants(), className)}
      {...props}
    >
      {/* Invisible placeholder to establish width based on longest text */}
      <span className="invisible" aria-hidden="true">
        {longestText}
        {appendix}
      </span>
      <span
        className={cn(
          'absolute inset-0 transition-all duration-300 ease-in-out',
          isAnimating
            ? '-translate-y-2 transform opacity-0 blur-sm'
            : 'translate-y-0 transform opacity-100',
        )}
        key={`current-${currentIndex}`}
      >
        {texts[currentIndex]}
        {appendix}
      </span>
      <span
        className={cn(
          'absolute inset-0 transition-all duration-300 ease-in-out',
          isAnimating
            ? 'translate-y-0 opacity-100'
            : 'translate-y-2 opacity-0 blur-sm',
        )}
        key={`next-${(currentIndex + 1) % texts.length}`}
      >
        {texts[(currentIndex + 1) % texts.length]}
        {appendix}
      </span>
    </span>
  );
}

export { TextSlideshow, textSlideshowVariants };
