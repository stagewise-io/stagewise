import { useCallback, useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { useWindowFocused } from '@/hooks/use-window-focused';
import { cn } from '@/utils';
import { SplitText } from '@stagewise/stage-ui/components/split-text';
import type { StepValidityCallback } from '..';

export function StepWelcome({
  isActive,
  onValidityChange,
  onAnimationStart,
}: {
  isActive: boolean;
  onValidityChange: StepValidityCallback;
  onAnimationStart?: () => void;
}) {
  const [isComplete, setIsComplete] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showSecondLine, setShowSecondLine] = useState(false);

  const windowFocused = useWindowFocused();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (isActive) onValidityChange(isComplete);
  }, [isComplete, isActive, onValidityChange]);

  // Wait for the window to be visible, then kick off both the orb and text.
  useEffect(() => {
    if (!windowFocused || hasStarted.current) return;
    const timer = setTimeout(() => {
      hasStarted.current = true;
      onAnimationStart?.();
      setShowText(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [windowFocused, onAnimationStart]);

  const handleFirstLineComplete = useCallback(() => {
    const timer = setTimeout(() => setShowSecondLine(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleLastLineComplete = useCallback(() => {
    setIsComplete(true);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2">
      <Logo className="mb-2 size-16" />
      <div className="relative w-full text-center">
        <span className="invisible font-normal text-foreground text-lg">
          Welcome to a new way to interact with the internet.
        </span>
        {showText && (
          <div className="absolute inset-0 flex items-center justify-center">
            <SplitText
              text="Welcome to a new way to interact with the internet."
              className="font-normal text-foreground text-lg"
              delay={30}
              duration={0.4}
              ease="power3.out"
              splitType="words"
              from={{ opacity: 0, y: 20 }}
              to={{ opacity: 1, y: 0 }}
              threshold={0.1}
              rootMargin="0px"
              textAlign="center"
              tag="span"
              onLetterAnimationComplete={handleFirstLineComplete}
            />
          </div>
        )}
      </div>
      <div className="relative w-full text-center">
        <span className="invisible font-normal text-base text-primary-foreground">
          Welcome to stagewise.
        </span>
        {showSecondLine && (
          <div className="absolute inset-0 flex items-center justify-center">
            <SplitText
              text="Welcome to stagewise."
              className={cn('font-normal text-base text-primary-foreground')}
              delay={40}
              duration={0.6}
              ease="power3.out"
              splitType="words"
              from={{ opacity: 0, y: 20 }}
              to={{ opacity: 1, y: 0 }}
              threshold={0.1}
              rootMargin="0px"
              textAlign="center"
              tag="span"
              onLetterAnimationComplete={handleLastLineComplete}
            />
          </div>
        )}
      </div>
    </div>
  );
}
