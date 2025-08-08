import React, { useState, useEffect, useMemo } from 'react';

export type GradientBackgroundSpeed = 'slow' | 'medium' | 'fast';

export interface GradientBackgroundVariant {
  activeSpeed: GradientBackgroundSpeed;
  backgroundColor: string;
  colors: [string, string, string, string];
}

export type GradientBackgroundShape = (
  | {
      type: 'circle';
      cx: string;
      cy: string;
      r: string;
    }
  | {
      type: 'rect';
      x: string;
      y: string;
      width: string;
      height: string;
    }
) & {
  color: 1 | 2 | 3 | 4;
};

// --- Default Configuration (can be overridden by props) ---
const DEFAULT_VARIANTS: Record<string, GradientBackgroundVariant> = {
  blue: {
    activeSpeed: 'slow',
    backgroundColor: '#0d253f',
    colors: ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa'],
  },
  green: {
    activeSpeed: 'fast',
    backgroundColor: '#062a22',
    colors: ['#059669', '#10b981', '#34d399', '#6ee7b7'],
  },
  transparent: {
    activeSpeed: 'slow',
    backgroundColor: 'transparent',
    colors: ['transparent', 'transparent', 'transparent', 'transparent'],
  },
};

const SHAPE_DEFAULTS: GradientBackgroundShape[] = [
  // This is now just a template for generating shapes for each speed group
  { type: 'circle', cx: '15%', cy: '20%', r: '30%', color: 1 },
  {
    type: 'rect',
    x: '50%',
    y: '0%',
    width: '40%',
    height: '40%',
    color: 2,
  },
  { type: 'circle', cx: '75%', cy: '60%', r: '25%', color: 3 },
  {
    type: 'rect',
    x: '10%',
    y: '55%',
    width: '35%',
    height: '35%',
    color: 4,
  },
  { type: 'circle', cx: '40%', cy: '80%', r: '20%', color: 1 },
];

/**
 * Generates a random number within a given range.
 */
const random = (min: number, max: number): number =>
  Math.random() * (max - min) + min;

/**
 * Renders a single group of shapes with a specific animation speed.
 */
const ShapeGroup = ({
  shapes,
  speed,
  speedClass,
}: {
  shapes: GradientBackgroundShape[];
  speed: number;
  speedClass: string;
}) => {
  const animationMultipliers = useMemo(() => {
    return shapes.map((_, i) => ({
      duration: random(0.8, 1.2),
      delay: random(0, -1),
      direction: i % 2 === 0 ? 'alternate' : 'alternate-reverse',
    }));
  }, [shapes]);

  // Add colorVar property to shapes
  const shapesWithColorVar = shapes.map((shape, i) => ({
    ...shape,
    colorVar: `--chat-grad-bg-c${shape.color}`,
    id: `${shape.type}-${shape.color}-${i}`, // Better key for React
    animationMultipliers: animationMultipliers[i],
  }));

  return (
    <g className={speedClass}>
      {shapesWithColorVar.map((shape) => {
        const multipliers = shape.animationMultipliers;
        const animationProps = {
          animationDuration: `calc(${speed}s * ${multipliers.duration})`,
          animationDelay: `calc(${speed}s * ${multipliers.delay})`,
          animationDirection: multipliers.direction,
        };
        if (shape.type === 'circle') {
          return (
            <circle
              key={shape.id}
              cx={shape.cx}
              cy={shape.cy}
              r={shape.r}
              fill={`var(${shape.colorVar})`}
              className="shape-anim"
              style={animationProps}
            />
          );
        }
        return (
          <rect
            key={shape.id}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            fill={`var(${shape.colorVar})`}
            className="shape-anim"
            style={animationProps}
          />
        );
      })}
    </g>
  );
};

/**
 * GradientBackgroundChat Component
 * Renders a background with 3 groups of shapes (slow, medium, fast) and smoothly
 * transitions their opacity and colors based on the selected variant.
 * Supports transparent states via the 'transparent' prop or 'transparent' variant.
 */
export const GradientBackgroundChat = ({
  currentVariant,
  variants = DEFAULT_VARIANTS,
  className,
  blurAmount = 80,
  shapes = SHAPE_DEFAULTS,
  transparent = false,
}: {
  currentVariant: string;
  variants?: Record<string, GradientBackgroundVariant>;
  className?: string;
  blurAmount?: number;
  shapes?: GradientBackgroundShape[];
  transparent?: boolean;
}) => {
  const [style, setStyle] = useState({});

  useEffect(() => {
    const activeVariant = variants[currentVariant];
    if (!activeVariant) {
      console.warn(
        `Variant "${currentVariant}" not found, falling back to default`,
      );
      return;
    }
    // Check if we should be transparent (either via prop or 'transparent' variant)
    const shouldBeTransparent = transparent || currentVariant === 'transparent';

    setStyle({
      '--chat-grad-bg-bg-color': activeVariant.backgroundColor,
      backgroundColor: 'var(--chat-grad-bg-bg-color)',
      '--chat-grad-bg-c1': activeVariant.colors[0],
      '--chat-grad-bg-c2': activeVariant.colors[1],
      '--chat-grad-bg-c3': activeVariant.colors[2],
      '--chat-grad-bg-c4': activeVariant.colors[3],
      '--chat-grad-bg-opacity-slow':
        activeVariant.activeSpeed === 'slow' ? 1 : 0,
      '--chat-grad-bg-opacity-medium':
        activeVariant.activeSpeed === 'medium' ? 1 : 0,
      '--chat-grad-bg-opacity-fast':
        activeVariant.activeSpeed === 'fast' ? 1 : 0,
      '--chat-grad-bg-overall-opacity': shouldBeTransparent ? 0 : 1,
      opacity: 'var(--chat-grad-bg-overall-opacity)',
    });
  }, [currentVariant, variants, transparent]);

  return (
    <div
      className={`absolute inset-0 overflow-hidden transition-all duration-1000 ${className}`}
      style={style}
    >
      <svg
        className="-inset-[25%] absolute h-[150%] w-[150%]"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        role="presentation"
      >
        <defs>
          <filter id="blur-filter">
            <feGaussianBlur stdDeviation={blurAmount} />
          </filter>
        </defs>
        <g filter="url(#blur-filter)">
          <ShapeGroup shapes={shapes} speed={40} speedClass="g-slow" />
          <ShapeGroup shapes={shapes} speed={20} speedClass="g-medium" />
          <ShapeGroup shapes={shapes} speed={5} speedClass="g-fast" />
        </g>
      </svg>
    </div>
  );
};
