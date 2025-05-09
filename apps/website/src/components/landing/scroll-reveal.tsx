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

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              element.style.opacity = '1';
              element.style.transform = 'translate3d(0, 0, 0)';
            }, delay);
            observer.unobserve(element);
          }
        });
      },
      { threshold: 0.1 },
    );

    observer.observe(element);

    return () => {
      if (element) observer.unobserve(element);
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
      className={`opacity-0 transition-all duration-700 ease-out ${className}`}
      style={{ transform: getTransform() }}
    >
      {children}
    </div>
  );
}
