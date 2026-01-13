import type { Meta, StoryObj } from '@storybook/react-vite';

const ShimmerShowcase = () => {
  return (
    <div className="space-y-12 p-8">
      <div>
        <h2 className="mb-2 font-bold text-2xl text-foreground">
          Shimmer Text Effect
        </h2>
        <p className="text-muted-foreground">
          Showcasing animated shimmer effects with different color combinations
          and durations.
        </p>
      </div>

      <div className="space-y-8">
        <section>
          <h3 className="mb-4 font-semibold text-foreground text-xl">
            Primary Colors
          </h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-primary-solid shimmer-to-primary-solid/l30_c0.05 font-semibold text-lg">
                Processing your request...
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-primary-solid shimmer-to-primary-solid/l30_c0.05
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-blue-600 shimmer-to-blue-600/l27_c0.03 w-fit font-semibold text-lg">
                Loading data...
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-blue-600 shimmer-to-blue-600/l27_c0.03
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-blue-700 shimmer-to-blue-700/l35_c0.04 font-semibold text-lg">
                Analyzing code...
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-blue-700 shimmer-to-blue-700/l35_c0.04
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-blue-600 shimmer-to-blue-600/l40_c0.05 font-semibold text-lg">
                Building preview...
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-blue-600 shimmer-to-blue-600/l40_c0.05
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-4 font-semibold text-foreground text-xl">
            Subtle Effects
          </h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-muted-foreground shimmer-to-muted-foreground/l15_c0.02 font-semibold text-lg">
                Reading file contents...
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-muted-foreground
                shimmer-to-muted-foreground/l15_c0.02
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-slate-600 shimmer-to-slate-600/l20_c0.015 font-semibold text-lg">
                Scanning directory...
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-slate-600 shimmer-to-slate-600/l20_c0.015
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-slate-900 shimmer-to-slate-900/l25_c0.02 font-semibold text-lg">
                Searching patterns...
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-slate-900 shimmer-to-slate-900/l25_c0.02
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-foreground shimmer-to-foreground/l18_c0.025 font-semibold text-lg">
                Processing changes...
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-foreground shimmer-to-foreground/l18_c0.025
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-4 font-semibold text-foreground text-xl">
            Metallic Effects (Silver-like)
          </h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-zinc-500 shimmer-to-zinc-500/l35_c-0.01 font-semibold text-lg">
                Silver gleam effect
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-zinc-500 shimmer-to-zinc-500/l35_c-0.01
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-slate-900 shimmer-to-slate-900/l45_c-0.015 font-semibold text-lg">
                Metallic slate shine
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-slate-900 shimmer-to-slate-900/l45_c-0.015
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-zinc-950 shimmer-to-zinc-950/l50_c-0.02 font-semibold text-lg">
                Chrome-like reflection
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-zinc-950 shimmer-to-zinc-950/l50_c-0.02
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-slate-400 shimmer-to-slate-400/l30_c-0.01 font-semibold text-lg">
                Polished steel effect
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-slate-400 shimmer-to-slate-400/l30_c-0.01
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-4 font-semibold text-foreground text-xl">
            Contrast Variations
          </h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-foreground shimmer-to-foreground/l50_c-0.03 font-semibold text-lg">
                High contrast effect
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-foreground shimmer-to-foreground/l50_c-0.03
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-primary-solid shimmer-to-primary-solid/l40_c0.04 font-semibold text-lg">
                Theme color transition
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-primary-solid shimmer-to-primary-solid/l40_c0.04
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-zinc-950 shimmer-to-zinc-950/l35_c0.02 font-semibold text-lg">
                Dark to medium transition
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-zinc-950 shimmer-to-zinc-950/l35_c0.02
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-blue-600 shimmer-to-blue-600/l42_c-0.025 font-semibold text-lg">
                Cross-hue shimmer
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-from-blue-600 shimmer-to-blue-600/l42_c-0.025
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-4 font-semibold text-foreground text-xl">
            Duration Variations
          </h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-600 shimmer-from-primary-solid shimmer-to-primary-solid/l30_c0.05 font-semibold text-lg">
                Quick animation
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-duration-600 shimmer-from-primary-solid
                shimmer-to-primary-solid/l30_c0.05
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1000 shimmer-from-primary-solid shimmer-to-primary-solid/l30_c0.05 font-semibold text-lg">
                Standard animation
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-duration-1000 shimmer-from-primary-solid
                shimmer-to-primary-solid/l30_c0.05
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-1800 shimmer-from-primary-solid shimmer-to-primary-solid/l30_c0.05 font-semibold text-lg">
                Relaxed animation
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-duration-1800 shimmer-from-primary-solid
                shimmer-to-primary-solid/l30_c0.05
              </p>
            </div>

            <div className="space-y-2">
              <div className="shimmer-text shimmer-duration-3000 shimmer-from-primary-solid shimmer-to-primary-solid/l30_c0.05 font-semibold text-lg">
                Smooth and calm
              </div>
              <p className="text-muted-foreground text-xs">
                shimmer-duration-3000 shimmer-from-primary-solid
                shimmer-to-primary-solid/l30_c0.05
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg bg-surface-1 p-6">
          <h3 className="mb-4 font-semibold text-foreground text-xl">
            Usage Example
          </h3>
          <div className="space-y-3 rounded-md bg-background/50 p-4 font-mono text-sm">
            <div className="text-foreground">
              <span className="text-blue-600">className</span>=
              <span className="text-emerald-600">
                "shimmer-text shimmer-duration-1000 shimmer-from-blue-600
                shimmer-to-blue-600/l27_c0.03"
              </span>
            </div>
            <div className="border-border border-l-2 pl-3 text-muted-foreground text-xs">
              Apply shimmer animation to text with blue-600 transitioning to a
              lighter/brighter variant using OKLCH lightness and chroma
              modifiers
            </div>
          </div>
          <div className="mt-4 space-y-2 text-muted-foreground text-sm">
            <p>
              <strong className="text-foreground">shimmer-text:</strong> Applies
              the shimmer animation
            </p>
            <p>
              <strong className="text-foreground">shimmer-duration-*:</strong>{' '}
              Sets animation duration in milliseconds (e.g., 600, 1000, 1800)
            </p>
            <p>
              <strong className="text-foreground">shimmer-from-*:</strong> Start
              color (uses Tailwind color tokens)
            </p>
            <p>
              <strong className="text-foreground">shimmer-to-*:</strong> End
              color with optional OKLCH modifiers (e.g., /l27_c0.03 adds 0.27 to
              lightness and 0.03 to chroma)
            </p>
          </div>
        </section>

        <section>
          <h3 className="mb-4 font-semibold text-foreground text-xl">
            Real-world Use Cases
          </h3>
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                  <svg
                    className="size-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="shimmer-text shimmer-duration-1000 shimmer-from-primary-solid shimmer-to-primary-solid/l30_c0.05 font-medium">
                    Stage is thinking...
                  </div>
                  <p className="text-muted-foreground text-xs">
                    AI assistant processing request
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <svg
                    className="size-5 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="shimmer-text shimmer-duration-1000 shimmer-from-muted-foreground shimmer-to-muted-foreground/l15_c0.02 font-medium">
                    Reading file: components/button.tsx
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Loading file contents
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-blue-600/10">
                  <svg
                    className="size-5 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="shimmer-text shimmer-duration-1500 shimmer-from-blue-600 shimmer-to-blue-600/l25_c0.03 font-medium">
                    Changes applied successfully
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Finalizing updates
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const meta = {
  title: 'Example/Shimmer',
  component: ShimmerShowcase,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ShimmerShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ShimmerShowcase />,
};
