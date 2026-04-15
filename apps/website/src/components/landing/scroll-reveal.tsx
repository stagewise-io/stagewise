'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: string;
}

export function ScrollReveal({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  distance = '20px',
}: ScrollRevealProps) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const reveal = () => {
      element.style.opacity = '1';
      element.style.filter = 'blur(0)';
      element.style.transform = 'translate3d(0, 0, 0)';
    };

    const revealWithDelay = () => {
      return window.setTimeout(reveal, delay);
    };

    const isInViewport = () => {
      const rect = element.getBoundingClientRect();
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth =
        window.innerWidth || document.documentElement.clientWidth;

      return (
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < viewportHeight &&
        rect.left < viewportWidth
      );
    };

    if (typeof IntersectionObserver === 'undefined') {
      const timeoutId = revealWithDelay();
      return () => window.clearTimeout(timeoutId);
    }

    let timeoutId: number | null = null;

    if (isInViewport()) {
      timeoutId = revealWithDelay();
      return () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          timeoutId = revealWithDelay();
          observer.disconnect();
        });
      },
      { threshold: 0.1 },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [delay]);

  const getTransform = () => {
    switch (direction) {
      case 'up':
        return `translate3d(0, ${distance}, 0)`;
      case 'down':
        return `translate3d(0, -${distance}, 0)`;
      case 'left':
        return `translate3d(${distance}, 0, 0)`;
      case 'right':
        return `translate3d(-${distance}, 0, 0)`;
      default:
        return `translate3d(0, ${distance}, 0)`;
    }
  };

  return (
    <div
      ref={elementRef}
      className={`opacity-0 blur-xs transition-all duration-700 ease-out ${className}`}
      style={{ transform: getTransform() }}
    >
      {children}
    </div>
  );
}
