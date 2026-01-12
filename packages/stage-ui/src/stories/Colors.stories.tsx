import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Tailwind Safelist for palette.css colors
 * These classes ensure Tailwind generates all color utilities from palette.css
 *
 * bg-primary-50 bg-primary-100 bg-primary-150 bg-primary-200 bg-primary-250 bg-primary-300 bg-primary-350 bg-primary-400 bg-primary-450 bg-primary-500 bg-primary-550 bg-primary-600 bg-primary-650 bg-primary-700 bg-primary-750 bg-primary-800 bg-primary-850 bg-primary-900 bg-primary-950
 * text-primary-50 text-primary-100 text-primary-150 text-primary-200 text-primary-250 text-primary-300 text-primary-350 text-primary-400 text-primary-450 text-primary-500 text-primary-550 text-primary-600 text-primary-650 text-primary-700 text-primary-750 text-primary-800 text-primary-850 text-primary-900 text-primary-950
 * border-primary-50 border-primary-100 border-primary-150 border-primary-200 border-primary-250 border-primary-300 border-primary-350 border-primary-400 border-primary-450 border-primary-500 border-primary-550 border-primary-600 border-primary-650 border-primary-700 border-primary-750 border-primary-800 border-primary-850 border-primary-900 border-primary-950
 * bg-base-50 bg-base-100 bg-base-150 bg-base-200 bg-base-250 bg-base-300 bg-base-350 bg-base-400 bg-base-450 bg-base-500 bg-base-550 bg-base-600 bg-base-650 bg-base-700 bg-base-750 bg-base-800 bg-base-850 bg-base-900 bg-base-950
 * text-base-50 text-base-100 text-base-150 text-base-200 text-base-250 text-base-300 text-base-350 text-base-400 text-base-450 text-base-500 text-base-550 text-base-600 text-base-650 text-base-700 text-base-750 text-base-800 text-base-850 text-base-900 text-base-950
 * border-base-50 border-base-100 border-base-150 border-base-200 border-base-250 border-base-300 border-base-350 border-base-400 border-base-450 border-base-500 border-base-550 border-base-600 border-base-650 border-base-700 border-base-750 border-base-800 border-base-850 border-base-900 border-base-950
 * bg-success bg-success-hover bg-success-active text-success text-success-hover text-success-active border-success border-success-hover border-success-active text-success-foreground-light text-success-foreground-dark
 * bg-error bg-error-hover bg-error-active text-error text-error-hover text-error-active border-error border-error-hover border-error-active text-error-foreground-light text-error-foreground-dark
 * bg-warning bg-warning-hover bg-warning-active text-warning text-warning-hover text-warning-active border-warning border-warning-hover border-warning-active text-warning-foreground-light text-warning-foreground-dark
 * bg-info bg-info-hover bg-info-active text-info text-info-hover text-info-active border-info border-info-hover border-info-active text-info-foreground-light text-info-foreground-dark
 */

const allShades = [
  50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800,
  850, 900, 950,
];

const ColorRamp = ({
  title,
  colorVar,
  isDark,
}: {
  title: string;
  colorVar: 'primary' | 'base';
  isDark: boolean;
}) => {
  return (
    <div className="flex flex-col gap-2">
      <h3
        className="font-semibold text-sm"
        style={{ color: isDark ? 'white' : 'black' }}
      >
        {title}
      </h3>
      <div className="flex flex-row flex-wrap items-start justify-start">
        {allShades.map((shade) => (
          <div
            key={shade}
            className="flex size-11 items-end justify-start p-1"
            style={{ backgroundColor: `var(--color-${colorVar}-${shade})` }}
          >
            <span
              className="font-mono text-[10px]"
              style={{
                color:
                  shade < 500
                    ? 'var(--color-base-900)'
                    : 'var(--color-base-100)',
              }}
            >
              {shade}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Color Modifier Demo
 * Demonstrates the @stagewise/tailwindcss-color-modifiers plugin
 * which allows adjusting OKLCH color channels directly in class names.
 *
 * Syntax: color-name/[modifier] where modifier is:
 * - l+N or l-N: Adjust lightness (scaled: l+10 = +0.1)
 * - c+N or c-N: Adjust chroma (scaled: c+5 = +0.05)
 * - h+N or h-N: Adjust hue (degrees)
 * - a+N or a-N: Adjust alpha
 */
const ColorModifierDemo = ({ isDark }: { isDark: boolean }) => {
  return (
    <div className="flex flex-col gap-4">
      <h3
        className="font-semibold text-sm"
        style={{ color: isDark ? 'white' : 'black' }}
      >
        Color Modifiers (OKLCH adjustments)
      </h3>
      <p
        className="max-w-md text-xs"
        style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}
      >
        Use <code className="rounded bg-base-700/30 px-1">/[l+N]</code> syntax
        to adjust lightness, chroma, hue, or alpha directly in class names.
      </p>

      {/* Lightness adjustments */}
      <div className="flex flex-col gap-2">
        <span
          className="font-medium text-xs"
          style={{
            color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
          }}
        >
          Lightness (l+/l-)
        </span>
        <div className="flex gap-1">
          <div className="size-10 rounded bg-primary-500/l-20" title="l-20" />
          <div className="size-10 rounded bg-primary-500/[l-10]" title="l-10" />
          <div className="size-10 rounded bg-primary-500" title="base" />
          <div className="size-10 rounded bg-primary-500/[l+10]" title="l+10" />
          <div className="size-10 rounded bg-primary-500/[l+20]" title="l+20" />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          l-20 → l-10 → base → l+10 → l+20
        </span>
      </div>

      {/* Chroma adjustments */}
      <div className="flex flex-col gap-2">
        <span
          className="font-medium text-xs"
          style={{
            color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
          }}
        >
          Chroma / Saturation (c+/c-)
        </span>
        <div className="flex gap-1">
          <div
            className="size-10 rounded bg-primary-500/[c-0.15]"
            title="c-0.15"
          />
          <div
            className="size-10 rounded bg-primary-500/[c-0.08]"
            title="c-0.08"
          />
          <div className="size-10 rounded bg-primary-500" title="base" />
          <div
            className="size-10 rounded bg-primary-500/[c+0.05]"
            title="c+0.05"
          />
          <div
            className="size-10 rounded bg-primary-500/[c+0.10]"
            title="c+0.10"
          />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          c-0.15 → c-0.08 → base → c+0.05 → c+0.10
        </span>
      </div>

      {/* Hue rotation */}
      <div className="flex flex-col gap-2">
        <span
          className="font-medium text-xs"
          style={{
            color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
          }}
        >
          Hue Rotation (h+/h-)
        </span>
        <div className="flex gap-1">
          <div className="size-10 rounded bg-primary-500/[h-60]" title="h-60" />
          <div className="size-10 rounded bg-primary-500/[h-30]" title="h-30" />
          <div className="size-10 rounded bg-primary-500" title="base" />
          <div className="size-10 rounded bg-primary-500/[h+30]" title="h+30" />
          <div className="size-10 rounded bg-primary-500/[h+60]" title="h+60" />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          h-60 → h-30 → base → h+30 → h+60 (degrees)
        </span>
      </div>

      {/* Combined modifiers */}
      <div className="flex flex-col gap-2">
        <span
          className="font-medium text-xs"
          style={{
            color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
          }}
        >
          Combined Modifiers
        </span>
        <div className="flex gap-1">
          <div
            className="size-10 rounded bg-primary-500/[l+10_c-0.05]"
            title="l+10 c-0.05"
          />
          <div
            className="size-10 rounded bg-primary-500/[l-10_h+30]"
            title="l-10 h+30"
          />
          <div
            className="size-10 rounded bg-success/[l+15]"
            title="success l+15"
          />
          <div className="size-10 rounded bg-error/[l+15]" title="error l+15" />
          <div className="size-10 rounded bg-info/[l+15]" title="info l+15" />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          l+10_c-0.05 | l-10_h+30 | success/l+15 | error/l+15 | info/l+15
        </span>
      </div>
    </div>
  );
};

const SemanticColorCard = ({
  title,
  colorName,
}: {
  title: string;
  colorName: 'success' | 'warning' | 'error' | 'info';
}) => {
  return (
    <div className="flex flex-col items-start justify-center gap-2">
      <div
        className="size-12 rounded transition-colors"
        style={{ backgroundColor: `var(--color-${colorName})` }}
      />
      <div
        className="size-12 rounded transition-colors"
        style={{ backgroundColor: `var(--color-${colorName}-hover)` }}
      />
      <div
        className="size-12 rounded transition-colors"
        style={{ backgroundColor: `var(--color-${colorName}-active)` }}
      />
      <div className="mt-1 flex flex-col gap-1">
        <span
          className="text-xs"
          style={{ color: `var(--color-${colorName}-foreground-light)` }}
        >
          {title} Light
        </span>
        <span
          className="text-xs"
          style={{ color: `var(--color-${colorName}-foreground-dark)` }}
        >
          {title} Dark
        </span>
      </div>
    </div>
  );
};

const ColorShowcase = () => {
  const [isDark, setIsDark] = useState(true);

  return (
    <div
      className="flex min-h-screen flex-col gap-8 p-8"
      style={{ backgroundColor: isDark ? 'black' : 'white' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="mb-2 font-bold text-2xl"
            style={{ color: isDark ? 'white' : 'black' }}
          >
            Color Palette
          </h2>
          <p
            className="text-sm"
            style={{
              color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
            }}
          >
            Complete color ramps with all 50s steps for primary, base, and
            semantic colors.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsDark(!isDark)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 font-medium text-sm transition-colors"
          style={{
            backgroundColor: isDark
              ? 'rgba(255,255,255,0.1)'
              : 'rgba(0,0,0,0.1)',
            color: isDark ? 'white' : 'black',
          }}
        >
          <span
            className="size-4 rounded-full border-2"
            style={{
              backgroundColor: isDark ? 'black' : 'white',
              borderColor: isDark ? 'white' : 'black',
            }}
          />
          {isDark ? 'Dark' : 'Light'}
        </button>
      </div>

      {/* Primary Ramp */}
      <ColorRamp title="Primary" colorVar="primary" isDark={isDark} />

      {/* Base Ramp */}
      <ColorRamp title="Base (Neutrals)" colorVar="base" isDark={isDark} />

      {/* Semantic Colors */}
      <div className="flex flex-col gap-2">
        <h3
          className="font-semibold text-sm"
          style={{ color: isDark ? 'white' : 'black' }}
        >
          Semantic Colors
        </h3>
        <div className="flex flex-row items-start gap-6">
          <SemanticColorCard title="Success" colorName="success" />
          <SemanticColorCard title="Warning" colorName="warning" />
          <SemanticColorCard title="Error" colorName="error" />
          <SemanticColorCard title="Info" colorName="info" />
        </div>
        <div
          className="mt-2 flex flex-row gap-4 text-xs"
          style={{
            color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
          }}
        >
          <span>Top: default</span>
          <span>Middle: hover</span>
          <span>Bottom: active</span>
        </div>
      </div>

      {/* Color Modifiers Demo */}
      <ColorModifierDemo isDark={isDark} />
    </div>
  );
};

const meta = {
  title: 'Example/Colors',
  component: ColorShowcase,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ColorShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ColorShowcase />,
};
